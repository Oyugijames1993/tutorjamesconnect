import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatRoom, Message, SharedFile
from .moderation import moderate_message, ACTION_SEND, ACTION_HOLD, ACTION_BLOCK


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

        messages = await self.get_messages()
        for msg in messages:
            await self.send(text_data=json.dumps(msg))

        await self.channel_layer.group_send(
            self.room_group,
            {
                'type':           'system_message',
                'message':        f'{self.user.display_name} has joined the room.',
                'sender_channel': self.channel_name,
            }
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive(self, text_data):
        data   = json.loads(text_data)
        body   = data.get('body', '').strip()
        target = data.get('target', 'everyone') if self.user.role == 'admin' else 'everyone'

        if not body:
            return

        user = self.user
        room = await self.get_room()

        if not room or room.status == 'closed':
            await self.send(text_data=json.dumps({
                'type':  'error',
                'error': 'This room is closed.',
            }))
            return

        action, reason = moderate_message(user.role, body)

        if action == ACTION_BLOCK:
            await self.send(text_data=json.dumps({
                'type':  'error',
                'error': reason,
            }))
            return

        if action == ACTION_HOLD:
            msg = await self.save_message(room, body, 'pending', reason, target)
            await self.send(text_data=json.dumps({
                'type':   'pending',
                'id':     msg.id,
                'body':   body,
                'status': 'pending',
                'reason': reason,
                'sender': user.display_name,
                'role':   user.role,
                'target': target,
                'time':   msg.timestamp.strftime('%H:%M'),
            }))
            await self.channel_layer.group_send(
                'admin_pending',
                {
                    'type':      'pending_message',
                    'id':        msg.id,
                    'body':      body,
                    'reason':    reason,
                    'sender':    user.display_name,
                    'room_id':   self.room_id,
                    'room_name': room.name,
                    'target':    target,
                }
            )
            await self.channel_layer.group_send(
                self.room_group,
                {
                    'type':   'flagged_message',
                    'id':     msg.id,
                    'body':   body,
                    'status': 'pending',
                    'reason': reason,
                    'sender': user.display_name,
                    'role':   user.role,
                    'target': target,
                    'time':   msg.timestamp.strftime('%H:%M'),
                }
            )
            return

        msg = await self.save_message(room, body, 'sent', '', target)
        await self.channel_layer.group_send(
            self.room_group,
            {
                'type':   'chat_message',
                'id':     msg.id,
                'body':   body,
                'sender': user.display_name,
                'role':   user.role,
                'target': target,
                'time':   msg.timestamp.strftime('%H:%M'),
            }
        )

    # ── Event handlers ────────────────────────────────────────────────────────

    async def chat_message(self, event):
        target = event.get('target', 'everyone')
        role   = self.user.role
        print(f"DEBUG: user={self.user.username}, role={role}, target={target}")

        if target == 'client' and role == 'provider':
            return
        if target == 'provider' and role == 'client':
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

    async def flagged_message(self, event):
        target = event.get('target', 'everyone')
        role   = self.user.role

        if target == 'client' and role == 'provider':
            return
        if target == 'provider' and role == 'client':
            return

        await self.send(text_data=json.dumps({
            'type':   'message',
            'id':     event['id'],
            'body':   event['body'],
            'status': 'pending',
            'reason': event['reason'],
            'sender': event['sender'],
            'role':   event['role'],
            'target': target,
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
        target = event.get('target', 'everyone')
        role   = self.user.role

        if target == 'client' and role == 'provider':
            return
        if target == 'provider' and role == 'client':
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

    async def file_approved(self, event):
        await self.send(text_data=json.dumps({
            'type':      'file',
            'id':        f"file_{event['id']}",
            'file_name': event['file_name'],
            'file_size': event['file_size'],
            'file_url':  event['file_url'],
            'sender':    event['sender'],
            'role':      event['role'],
            'time':      event['time'],
        }))

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
    def get_messages(self):
        from django.conf import settings

        room = ChatRoom.objects.get(pk=self.room_id)
        role = self.user.role

        if role == 'admin':
            msgs = list(
                room.messages.filter(status__in=['sent', 'approved', 'pending'])
                .select_related('sender')
                .order_by('timestamp')[:50]
            )
        else:
            msgs = list(
                room.messages.filter(status__in=['sent', 'approved'])
                .exclude(target='provider' if role == 'client' else 'client')
                .select_related('sender')
                .order_by('timestamp')[:50]
            )

        text_events = [
            {
                'type':   'message',
                'id':     m.id,
                'body':   m.body,
                'sender': m.sender.display_name,
                'role':   m.sender.role,
                'status': m.status,
                'target': m.target,
                'time':   m.timestamp.strftime('%H:%M'),
                '_ts':    m.timestamp,
            }
            for m in msgs
        ]

        if role == 'admin':
            files = list(
                room.files.filter(status__in=['approved', 'direct', 'pending'])
                .select_related('sender')
                .order_by('uploaded_at')[:20]
            )
        else:
            files = list(
                room.files.filter(status__in=['approved', 'direct'])
                .select_related('sender')
                .order_by('uploaded_at')[:20]
            )

        file_events = []
        for f in files:
            try:
                url = 'http://localhost:8000' + settings.MEDIA_URL + f.file.name
            except Exception:
                url = ''
            file_events.append({
                'type':      'file',
                'id':        f'file_{f.id}',
                'file_id':   f.id,
                'file_name': f.file_name,
                'file_size': _fmt_size(f.file_size),
                'file_url':  url,
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
    def save_message(self, room, body, msg_status, flag_reason, target='everyone'):
        return Message.objects.create(
            room        = room,
            sender      = self.user,
            body        = body,
            status      = msg_status,
            target      = target,
            flagged     = bool(flag_reason),
            flag_reason = flag_reason,
        )


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
            'sender':    event['sender'],
            'room_id':   event['room_id'],
            'room_name': event['room_name'],
        }))