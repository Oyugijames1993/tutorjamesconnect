# accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models
import random
import secrets
from django.utils import timezone


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ('admin',    'Admin'),
        ('client',   'Client'),
        ('provider', 'Provider'),
    ]

    role         = models.CharField(max_length=10, choices=ROLE_CHOICES, default='client')
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    email        = models.EmailField(unique=True)
    client_id    = models.CharField(max_length=20, unique=True, blank=True, null=True)
    is_verified  = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)
    active_device_token = models.CharField(max_length=64, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['phone_number'],
                condition=models.Q(role='client'),
                name='unique_phone_number_per_client',
            )
        ]

    def save(self, *args, **kwargs):
        # Auto-assign client_id when a client registers
        if self.role == 'client' and not self.client_id:
            super().save(*args, **kwargs)  # save first to get a primary key
            self.client_id = f'client{100 + self.pk}'
            CustomUser.objects.filter(pk=self.pk).update(client_id=self.client_id)
        else:
            super().save(*args, **kwargs)

    @property
    def display_name(self):
        # Clients show as client100, client101 etc.
        # Providers and admins show their first name
        if self.role == 'client' and self.client_id:
            return self.client_id
        return self.first_name or self.username

    def __str__(self):
        return f"{self.display_name} ({self.role})"


class ProviderProfile(models.Model):
    user           = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='provider_profile')
    specialisation = models.CharField(max_length=200)
    bio            = models.TextField()
    rate_min       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    rate_max       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    portfolio_url  = models.URLField(blank=True)
    is_available   = models.BooleanField(default=True)

    def __str__(self):
        return f'{self.user.display_name} — {self.specialisation}'


class OTP(models.Model):
    user       = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    code       = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used    = models.BooleanField(default=False)

    def is_valid(self):
        expiry_time = self.created_at + timezone.timedelta(minutes=10)
        return not self.is_used and timezone.now() < expiry_time

    @staticmethod
    def generate_code():
        return str(random.randint(100000, 999999))

    def __str__(self):
        return f"{self.user.display_name} - {self.code}"


class RoomAccessToken(models.Model):
    """
    Passwordless recovery for clients who've lost their session (new device,
    cleared browser, etc). A client requests access with just their phone
    number; this token is generated server-side and handed to admin to send
    over WhatsApp — never sent automatically, and never shown to anyone but
    admin. Single-use, short-lived.
    """
    user       = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='access_tokens')
    token      = models.CharField(max_length=64, unique=True, editable=False)
    pin        = models.CharField(max_length=5, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at    = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.pin:
            self.pin = ''.join(secrets.choice('0123456789') for _ in range(5))
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=24)
        super().save(*args, **kwargs)

    def is_valid(self):
        return self.used_at is None and timezone.now() < self.expires_at

    def __str__(self):
        return f"{self.user.display_name} access token ({'used' if self.used_at else 'active'})"


class QRLinkSession(models.Model):
    """
    WhatsApp-Web-style companion login: the browser creates a pending
    session and shows a QR code; the phone (already logged in) scans it
    and confirms the link; the browser then polls and picks up a fresh,
    unrestricted ('web') token pair for that user. Single-use, short-lived
    — a scanned-but-unretrieved session is still only good for one poll.
    """
    token          = models.CharField(max_length=64, unique=True, editable=False)
    user           = models.ForeignKey(CustomUser, null=True, blank=True, on_delete=models.CASCADE, related_name='qr_link_sessions')
    created_at     = models.DateTimeField(auto_now_add=True)
    linked_at      = models.DateTimeField(null=True, blank=True)
    retrieved      = models.BooleanField(default=False)
    cached_access  = models.TextField(blank=True)
    cached_refresh = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.created_at + timezone.timedelta(minutes=2)

    def __str__(self):
        return f"QR link session ({'linked to ' + self.user.display_name if self.user else 'pending'})"


class PushSubscription(models.Model):
    """
    One row per browser/device a user has granted notification permission
    on. A user can have several (phone + laptop, multiple browsers, etc).
    `endpoint` is unique per browser subscription — re-subscribing the same
    device just updates its keys rather than creating a duplicate row.
    """
    user       = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint   = models.URLField(max_length=500, unique=True)
    p256dh     = models.CharField(max_length=200)
    auth       = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.display_name} push subscription ({self.endpoint[:40]}…)"
class Referral(models.Model):
    referrer          = models.ForeignKey(
        CustomUser,
        on_delete    = models.CASCADE,
        related_name = 'referrals_made',
    )
    referred          = models.ForeignKey(
        CustomUser,
        on_delete    = models.CASCADE,
        related_name = 'referral_source',
    )
    created_at        = models.DateTimeField(auto_now_add=True)
    discount_given    = models.BooleanField(default=False)
    discount_given_at = models.DateTimeField(null=True, blank=True)
    discount_given_by = models.ForeignKey(
        CustomUser,
        on_delete    = models.SET_NULL,
        null         = True,
        blank        = True,
        related_name = 'discounts_given',
    )

    class Meta:
        unique_together = ('referrer', 'referred')
        ordering        = ['-created_at']

    def __str__(self):
        return f'{self.referrer.display_name} → {self.referred.display_name}'


