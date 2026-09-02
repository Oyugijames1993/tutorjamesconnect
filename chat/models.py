from django.db import models
from accounts.models import CustomUser

class ChatRoom(models.Model):
    STATUS_CHOICES = [
        ('negotiating', 'Negotiating'),
        ('active',      'Active'),
        ('closed',      'Closed'),
    ]

    name                         = models.CharField(max_length=100)
    client                       = models.ForeignKey(CustomUser, related_name='client_rooms', on_delete=models.CASCADE)
    extra_clients                = models.ManyToManyField(CustomUser, related_name='extra_client_rooms', blank=True)
    providers                    = models.ManyToManyField(CustomUser, related_name='provider_rooms', blank=True)
    admin                        = models.ForeignKey(CustomUser, related_name='admin_rooms', on_delete=models.SET_NULL, null=True, blank=True)
    status                       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='negotiating')
    files_enabled                = models.BooleanField(default=True)
    client_files_need_approval   = models.BooleanField(default=False)
    provider_files_need_approval = models.BooleanField(default=True)
    agreed_price                 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    provider_joined_at           = models.DateTimeField(null=True, blank=True)
    created_at                   = models.DateTimeField(auto_now_add=True)

    # When True, every message sent by the CLIENT in this room is silently
    # forced to admin-only visibility (the provider never sees it), regardless
    # of content. Toggled by admin whenever they need a private pricing/
    # negotiation conversation with the client, even if a provider is already
    # in the room (e.g. re-pricing a new task in an existing, permanent room).
    negotiation_mode = models.BooleanField(default=False)

    # What the client originally signed up for. A room is permanent and can
    # outlive any single project, so this reflects the initial/most recent
    # course context rather than a strict history — good enough for admin's
    # quick reference in Room Info.
    course = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.name} [{self.status}]"

    def is_member(self, user):
        if user.role == 'admin':
            return True
        if user.id == self.client_id:
            return True
        if self.providers.filter(id=user.id).exists():
            return True
        if self.extra_clients.filter(id=user.id).exists():
            return True
        return False


class Message(models.Model):
    STATUS_CHOICES = [
        ('sent',     'Sent'),
        ('pending',  'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]


    TARGET_CHOICES = [
        ('everyone', 'Everyone'),
        ('client', 'Client only'),
        ('provider', 'Provider only'),
        ('admin', 'Admin only'),
    ]

    room        = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender      = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    body        = models.TextField()
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='sent')
    target      = models.CharField(max_length=10, choices=TARGET_CHOICES, default='everyone')
    flagged     = models.BooleanField(default=False)
    flag_reason = models.CharField(max_length=200, blank=True)
    reply_to    = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='replies')
    timestamp   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.username} → {self.room.name}: {self.body[:50]}"


class RoomCounter(models.Model):
    """
    A single-row counter used to hand out clean, gap-free 'Client N' room
    names. Deliberately separate from CustomUser.client_id (which numbers
    ALL users — admins, providers, clients — in raw signup order and has
    gaps), and separate from ChatRoom.pk (which would have gaps if any room
    were ever created for a non-client purpose, or reused after deletion).

    Use next_client_room_name() below rather than incrementing this
    directly — it wraps the read-increment-write in a row lock so two
    concurrent signups can never be handed the same number.
    """
    value = models.PositiveIntegerField(default=0)


def next_client_room_name():
    from django.db import transaction
    with transaction.atomic():
        counter, _ = RoomCounter.objects.select_for_update().get_or_create(pk=1)
        counter.value += 1
        counter.save()
        return f"Room {counter.value}"


class SharedFile(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('approved',  'Approved'),
        ('rejected',  'Rejected'),
        ('direct',    'Direct'),
    ]

    room        = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='files')
    sender      = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='sent_files')
    receiver    = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='received_files', null=True, blank=True)
    file        = models.FileField(upload_to='chat_files/')
    file_name   = models.CharField(max_length=255)
    file_size   = models.PositiveIntegerField(default=0)
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.sender.username} → {self.file_name} [{self.status}]"

