import json
from collections import defaultdict
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from .models import ChatRoom, Message, SharedFile
from .moderation import moderate_message, ACTION_SEND, ACTION_HOLD, ACTION_BLOCK, ACTION_REDIRECT_ADMIN
from accounts.push import send_push_to_users

# ── In-memory presence tracking ───────────────────────────────────────────────
# room_id -> { user_id: number_of_open_sockets }
# A counter (not a plain set) so a user with the room open in two tabs doesn't
# get marked offline when just one of those tabs closes.
# NOTE: this lives in process memory. Fine for a single Daphne process (local
# dev / a single server). If you ever run multiple worker processes or
# machines, this needs to move to Redis (or your channel layer's backing
# store) so all processes see the same presence state.
ROOM_ONLINE_COUNTS = defaultdict(lambda: defaultdict(int))


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_id    = self.scope['url_route']['kwargs']['room_id']
        self.room_group = f'chat_{self.room_id}'
        self.user       = self.scope['user']

        if not self.user.is_authenticated:
            await self.close()
            return

        room = await self.get_room()
        if not room:
            await self.close()
            return

        is_member = await self.check_membership(room)
        if not is_member:
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

        # ── Presence: mark this user online in this room ──────────────────────
        counts = ROOM_ONLINE_COUNTS[str(self.room_id)]
        was_offline = counts[self.user.id] == 0
        counts[self.user.id] += 1

        messages = await self.get_messages()
        for msg in messages:
            await self.send(text_data=json.dumps(msg))

        # Tell the newly-connected client who's currently online
        online_ids = [uid for uid, c in counts.items() if c > 0]
        await self.send(text_data=json.dumps({
            'type':            'presence_snapshot',
            'online_user_ids': online_ids,
        }))

        if was_offline:
            await self.channel_layer.group_send(
                self.room_group,
                {'type': 'presence_update', 'user_id': self.user.id, 'online': True}
            )

        # No join announcement — WebSocket reconnects should be invisible to users

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

        counts = ROOM_ONLINE_COUNTS[str(self.room_id)]
        counts[self.user.id] = max(0, counts[self.user.id] - 1)
        if counts[self.user.id] == 0:
            await self.channel_layer.group_send(
                self.room_group,
                {'type': 'presence_update', 'user_id': self.user.id, 'online': False}
            )


    async def receive(self, text_data):
        data = json.loads(text_data)
        body = data.get('body', '').strip()
        role = self.user.role
        reply_to_id = data.get('reply_to')

        if role == 'admin':
            target = data.get('target', 'everyone')
            if target not in ('everyone', 'client', 'provider'):
                target = 'everyone'
        elif role == 'provider':
            requested = data.get('target', 'everyone')
            target = requested if requested in ('everyone', 'admin') else 'everyone'
        else:
            target = 'everyone'

        if not body:
            return

        room = await self.get_room()

        if not room or room.status == 'closed':
            await self.send(text_data=json.dumps({
                'type':  'error',
                'error': 'This room is closed.',
            }))
            return

        # ── Negotiation mode: admin has toggled a private pricing/negotiation
        # conversation with the client. Every client message is forced
        # admin-only, regardless of content — the provider never sees it.
        if role == 'client' and room.negotiation_mode:
            target = 'admin'

        action, reason = moderate_message(self.user.role, body)

        if action == ACTION_BLOCK:
            await self.send(text_data=json.dumps({
                'type':  'error',
                'error': reason,
            }))
            return

        if action == ACTION_REDIRECT_ADMIN:
            # Price/payment talk — deliver immediately, but silently force
            # this message to admin-only visibility. No approval needed;
            # this just keeps money talk between the sender and admin,
            # out of the general project conversation everyone else sees.
            # _can_see() already restricts target='admin' to admin + the
            # original sender, so a normal chat_message broadcast is safe.
            msg, reply_preview = await self.save_message(room, body, 'sent', reason, 'admin', reply_to_id)
            await self.channel_layer.group_send(
                self.room_group,
                {
                    'type':           'chat_message',
                    'id':             msg.id,
                    'body':           body,
                    'sender':         self.user.display_name,
                    'sender_channel': self.channel_name,
                    'role':           self.user.role,
                    'target':         'admin',
                    'redirected':     True,
                    'reply_to':       reply_preview,
                    'time':           msg.timestamp.strftime('%H:%M'),
                }
            )
            recipients = await self.get_push_recipients(room, 'admin', self.user.id)
            await sync_to_async(send_push_to_users)(
                recipients,
                title=f'Private message — {room.name}',
                body=f'{self.user.display_name}: {body[:100]}',
                sound_type='pending',
                url=f'/chat/{room.id}',
            )
            return

        if action == ACTION_HOLD:
            msg, reply_preview = await self.save_message(room, body, 'pending', reason, target, reply_to_id)

            # ── Sender sees their own pending bubble immediately ──────────────
            await self.send(text_data=json.dumps({
                'type':   'message',
                'id':     msg.id,
                'body':   body,
                'status': 'pending',
                'reason': reason,
                'sender': self.user.display_name,
                'role':   self.user.role,
                'target': target,
                'reply_to': reply_preview,
                'time':   msg.timestamp.strftime('%H:%M'),
            }))

            # ── Notify admin panel ────────────────────────────────────────────
            await self.channel_layer.group_send(
                'admin_pending',
                {
                    'type':      'pending_message',
                    'id':        msg.id,
                    'body':      body,
                    'reason':    reason,
                    'sender':    self.user.display_name,
                    'room_id':   self.room_id,
                    'room_name': room.name,
                    'target':    target,
                }
            )

            # ── Show flagged bubble in room to admin only ─────────────────────
            # (sender already got it directly above — no double send)
            await self.channel_layer.group_send(
                self.room_group,
                {
                    'type':           'flagged_message',
                    'id':             msg.id,
                    'body':           body,
                    'status':         'pending',
                    'reason':         reason,
                    'sender':         self.user.display_name,
                    'sender_channel': self.channel_name,
                    'role':           self.user.role,
                    'target':         target,
                    'reply_to':       reply_preview,
                    'time':           msg.timestamp.strftime('%H:%M'),
                }
            )
            recipients = await self.get_push_recipients(room, 'admin', self.user.id)
            await sync_to_async(send_push_to_users)(
                recipients,
                title=f'Needs your approval — {room.name}',
                body=f'{self.user.display_name}: {body[:100]}',
                sound_type='pending',
                url=f'/chat/{room.id}',
            )
            return

        msg, reply_preview = await self.save_message(room, body, 'sent', '', target, reply_to_id)
        await self.channel_layer.group_send(
            self.room_group,
            {
                'type':           'chat_message',
                'id':             msg.id,
                'body':           body,
                'sender':         self.user.display_name,
                'sender_channel': self.channel_name,   # ← added so sender can be identified
                'role':           self.user.role,
                'target':         target,
                'reply_to':       reply_preview,
                'time':           msg.timestamp.strftime('%H:%M'),
            }
        )
        recipients = await self.get_push_recipients(room, target, self.user.id)
        await sync_to_async(send_push_to_users)(
            recipients,
            title=(f'Private message — {room.name}' if target == 'admin' else f'{self.user.display_name} — {room.name}'),
            body=body[:120],
            sound_type=('pending' if target == 'admin' else 'message'),
            url=f'/chat/{room.id}',
        )

    # ── Visibility helper ─────────────────────────────────────────────────────

    def _can_see(self, target, role, is_sender=False):
        """
        - Admin always sees everything
        - Sender always sees their own message (even target=admin for provider)
        - 'everyone'  → all roles
        - 'client'    → only clients
        - 'provider'  → only providers
        - 'admin'     → only admin (and original sender)
        """
        if role == 'admin':
            return True
        if is_sender:
            return True         # sender always sees their own message
        if target == 'everyone':
            return True
        if target == 'client'   and role == 'client':   return True
        if target == 'provider' and role == 'provider': return True
        return False

    # ── Event handlers ────────────────────────────────────────────────────────

    async def chat_message(self, event):
        target    = event.get('target', 'everyone')
        role      = self.user.role
        is_sender = event.get('sender_channel') == self.channel_name

        if not self._can_see(target, role, is_sender):
            return

        await self.send(text_data=json.dumps({
            'type':       'message',
            'id':         event['id'],
            'body':       event['body'],
            'sender':     event['sender'],
            'role':       event['role'],
            'target':     target,
            'redirected': event.get('redirected', False),
            'reply_to':   event.get('reply_to'),
            'time':       event['time'],
        }))

    async def flagged_message(self, event):
        """
        Pending message in room — only admin sees this group event.
        The sender already received their bubble directly in receive().
        """
        role      = self.user.role
        is_sender = event.get('sender_channel') == self.channel_name

        # Sender already got it directly — skip to avoid double bubble
        if is_sender:
            return

        # Only admin sees flagged bubbles in the room
        if role != 'admin':
            return

        await self.send(text_data=json.dumps({
            'type':   'message',
            'id':     event['id'],
            'body':   event['body'],
            'status': 'pending',
            'reason': event['reason'],
            'sender': event['sender'],
            'role':   event['role'],
            'target': event.get('target', 'everyone'),
            'reply_to': event.get('reply_to'),
            'time':   event['time'],
        }))

    async def system_message(self, event):
        if event.get('sender_channel') == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            'type':    'system',
            'message': event['message'],
        }))

    async def pending_message(self, event):
        await self.send(text_data=json.dumps({
            'type':      'pending',
            'id':        event['id'],
            'body':      event['body'],
            'reason':    event['reason'],
            'sender':    event['sender'],
            'room_id':   event['room_id'],
            'room_name': event['room_name'],
            'target':    event.get('target', 'everyone'),
        }))

    async def approved_message(self, event):
        target    = event.get('target', 'everyone')
        role      = self.user.role
        is_sender = event.get('sender_channel') == self.channel_name

        if not self._can_see(target, role, is_sender):
            return

        await self.send(text_data=json.dumps({
            'type':   'message',
            'id':     event['id'],
            'body':   event['body'],
            'sender': event['sender'],
            'role':   event['role'],
            'target': target,
            'time':   event['time'],
        }))

    async def presence_update(self, event):
        await self.send(text_data=json.dumps({
            'type':    'presence',
            'user_id': event['user_id'],
            'online':  event['online'],
        }))

    async def pending_file_room(self, event):
        """
        A file was just uploaded and needs approval. Only the uploader
        (so their own bubble shows 'pending' immediately) and any admin
        currently viewing this room should see it. Everyone else ignores it.
        """
        role     = self.user.role
        is_admin = role == 'admin'
        is_owner = event.get('sender_id') == self.user.id

        if not (is_admin or is_owner):
            return

        file_url = None
        if is_admin or is_owner:
            # Admin gets a real preview/download link before deciding.
            # The uploader can also re-check what they just sent.
            file_url = await self.get_file_url(event['id'])

        await self.send(text_data=json.dumps({
            'type':      'file',
            'id':        f"file_pending_{event['id']}",
            'file_id':   event['id'],
            'file_name': event['file_name'],
            'file_size': event['file_size'],
            'file_url':  file_url,
            'sender':    event['sender'],
            'role':      event['role'],
            'status':    'pending',
            'time':      event['time'],
        }))

    async def file_approved(self, event):
        await self.send(text_data=json.dumps({
            'type':      'file',
            'id':        f"file_{event['id']}",
            'file_id':   event['id'],
            'file_name': event['file_name'],
            'file_size': event['file_size'],
            'file_url':  event['file_url'],
            'sender':    event['sender'],
            'role':      event['role'],
            'status':    'approved',
            'time':      event['time'],
        }))

    async def file_rejected(self, event):
        """
        Lets the uploader's (and admin's) pending bubble resolve/disappear
        instead of hanging in 'Awaiting approval' forever.
        """
        role     = self.user.role
        is_admin = role == 'admin'
        is_owner = event.get('sender_id') == self.user.id

        if not (is_admin or is_owner):
            return

        await self.send(text_data=json.dumps({
            'type': 'file:rejected',
            'id':   event['id'],
        }))

    @database_sync_to_async
    def get_push_recipients(self, room, target, sender_id):
        """
        Who should get a push notification for a message with this target,
        excluding the sender themselves. Mirrors _can_see()'s visibility
        rules: admin always sees everything, so admins are always included
        (minus the sender, if the sender happens to be an admin).
        """
        from accounts.models import CustomUser

        recipients = list(CustomUser.objects.filter(role='admin').exclude(id=sender_id))

        def add_client_side():
            if room.client_id and room.client_id != sender_id:
                recipients.append(room.client)
            recipients.extend(room.extra_clients.exclude(id=sender_id))

        def add_provider_side():
            recipients.extend(room.providers.exclude(id=sender_id))

        if target == 'client':
            add_client_side()
        elif target == 'provider':
            add_provider_side()
        elif target == 'admin':
            pass  # admins already included above
        else:  # 'everyone'
            add_client_side()
            add_provider_side()

        return recipients

    # ── Database helpers ──────────────────────────────────────────────────────

    @database_sync_to_async
    def check_membership(self, room):
        user = self.user
        if user.role == 'admin':
            return True
        if user.id == room.client_id:
            return True
        if room.providers.filter(id=user.id).exists():
            return True
        if room.extra_clients.filter(id=user.id).exists():
            return True
        return False

    @database_sync_to_async
    def get_room(self):
        try:
            return ChatRoom.objects.get(pk=self.room_id)
        except ChatRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def get_file_url(self, file_id):
        from django.conf import settings
        try:
            f = SharedFile.objects.get(pk=file_id)
            frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:8000')
            return frontend_base + settings.MEDIA_URL + f.file.name
        except SharedFile.DoesNotExist:
            return None

    @database_sync_to_async
    def get_messages(self):
        from django.conf import settings
        from django.db.models import Q

        room = ChatRoom.objects.get(pk=self.room_id)
        role = self.user.role

        if role == 'admin':
            msgs = list(
                room.messages.filter(status__in=['sent', 'approved', 'pending'])
                .select_related('sender', 'reply_to__sender')
                .order_by('timestamp')[:50]
            )

        elif role == 'provider':
            # Messages visible to provider:
            # 1. everyone/provider-targeted messages (sent/approved)
            # 2. admin-targeted messages sent BY this provider (their own)
            # 3. pending messages sent BY this provider
            msgs = list(
                room.messages.filter(
                    Q(status__in=['sent', 'approved'], target__in=['everyone', 'provider']) |
                    Q(sender=self.user)  # all own messages regardless of target/status
                )
                .select_related('sender', 'reply_to__sender')
                .order_by('timestamp')[:50]
            )
            # Deduplicate
            seen = set(); unique = []
            for m in msgs:
                if m.id not in seen:
                    seen.add(m.id); unique.append(m)
            msgs = unique

        else:
            # Client
            msgs = list(
                room.messages.filter(
                    Q(status__in=['sent', 'approved'], target__in=['everyone', 'client']) |
                    Q(sender=self.user)  # always see own messages, regardless of target/status
                )
                .select_related('sender', 'reply_to__sender')
                .order_by('timestamp')[:50]
            )
            # Deduplicate
            seen = set(); unique = []
            for m in msgs:
                if m.id not in seen:
                    seen.add(m.id); unique.append(m)
            msgs = unique

        text_events = [
            {
                'type':       'message',
                'id':         m.id,
                'body':       m.body,
                'sender':     m.sender.display_name,
                'role':       m.sender.role,
                'status':     m.status,
                'target':     m.target,
                'redirected': bool(m.flagged and m.target == 'admin' and m.status != 'pending'),
                'reply_to':   ({'id': m.reply_to.id, 'sender': m.reply_to.sender.display_name, 'body': m.reply_to.body[:120]} if m.reply_to_id else None),
                'time':       m.timestamp.strftime('%H:%M'),
                '_ts':        m.timestamp,
            }
            for m in msgs
        ]

        if role == 'admin':
            # Admin sees every file in the room, pending included.
            files = list(
                room.files.filter(status__in=['approved', 'direct', 'pending'])
                .select_related('sender')
                .order_by('uploaded_at')[:20]
            )
        else:
            # Everyone else sees approved/direct files, plus their OWN pending
            # uploads (so a refresh doesn't make their own pending file vanish).
            files = list(
                room.files.filter(
                    Q(status__in=['approved', 'direct']) |
                    Q(sender=self.user, status='pending')
                )
                .select_related('sender')
                .order_by('uploaded_at')[:20]
            )

        file_events = []
        for f in files:
            try:
                url = 'http://localhost:8000' + settings.MEDIA_URL + f.file.name
            except Exception:
                url = ''

            if f.status in ('approved', 'direct'):
                file_url = url
            elif role == 'admin' or f.sender_id == self.user.id:
                # Admin can preview any pending file; the uploader can
                # re-check their own pending file. No one else gets the URL.
                file_url = url
            else:
                file_url = None

            file_events.append({
                'type':      'file',
                'id':        f'file_{f.id}',
                'file_id':   f.id,
                'file_name': f.file_name,
                'file_size': _fmt_size(f.file_size),
                'file_url':  file_url,
                'sender':    f.sender.display_name,
                'role':      f.sender.role,
                'status':    f.status,
                'time':      f.uploaded_at.strftime('%H:%M'),
                '_ts':       f.uploaded_at,
            })

        combined = sorted(text_events + file_events, key=lambda e: e['_ts'])
        for e in combined:
            e.pop('_ts', None)
        return combined

    @database_sync_to_async
    def save_message(self, room, body, msg_status, flag_reason, target='everyone', reply_to_id=None):
        reply_to = None
        reply_preview = None
        if reply_to_id:
            # Only allow replying to a message that's actually in this room —
            # ignore anything else rather than erroring, so a stale/bad
            # reply_to_id just silently sends as a normal message.
            reply_to = Message.objects.filter(id=reply_to_id, room=room).select_related('sender').first()
            if reply_to:
                reply_preview = {
                    'id':     reply_to.id,
                    'sender': reply_to.sender.display_name,
                    'body':   reply_to.body[:120],
                }

        msg = Message.objects.create(
            room        = room,
            sender      = self.user,
            body        = body,
            status      = msg_status,
            target      = target,
            flagged     = bool(flag_reason),
            flag_reason = flag_reason,
            reply_to    = reply_to,
        )
        return msg, reply_preview


def _fmt_size(n):
    if n < 1024:      return f"{n} B"
    if n < 1024 ** 2: return f"{n // 1024} KB"
    return f"{n / 1024 ** 2:.1f} MB"


class AdminConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.user = self.scope['user']
        if not self.user.is_authenticated or self.user.role != 'admin':
            await self.close()
            return
        await self.channel_layer.group_add('admin_pending', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard('admin_pending', self.channel_name)

    async def pending_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def pending_file(self, event):
        await self.send(text_data=json.dumps({
            'type':      'file:pending',
            'id':        event['id'],
            'file_name': event['file_name'],
            'file_size': event['file_size'],
            'file_url':  event.get('file_url'),
            'sender':    event['sender'],
            'room_id':   event['room_id'],
            'room_name': event['room_name'],
        }))
