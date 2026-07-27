import os
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import ChatRoom, SharedFile
from accounts.push import send_push_to_user, send_push_to_users


def _format_size(n_bytes):
    if n_bytes < 1024:
        return f"{n_bytes} B"
    if n_bytes < 1024 ** 2:
        return f"{n_bytes // 1024} KB"
    return f"{n_bytes / 1024 ** 2:.1f} MB"


def _push_to_group(group_name, payload):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(group_name, payload)


def _is_room_member(room, user):
    if user.role == 'admin':
        return True
    if user.id == room.client_id:
        return True
    if room.providers.filter(id=user.id).exists():
        return True
    if room.extra_clients.filter(id=user.id).exists():
        return True
    return False


def _room_everyone(room, exclude_id=None):
    """Everyone who can see an approved/direct file in this room: all
    admins, the client, any extra clients, and any providers — minus
    whoever the caller wants excluded (typically the person who just
    acted, so they don't get notified about their own action)."""
    from accounts.models import CustomUser
    people = list(CustomUser.objects.filter(role='admin'))
    if room.client_id:
        people.append(room.client)
    people.extend(room.extra_clients.all())
    people.extend(room.providers.all())
    if exclude_id is not None:
        people = [p for p in people if p.id != exclude_id]
    return people


class UploadFileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, room_id):
        room = get_object_or_404(ChatRoom, pk=room_id)
        user = request.user

        if not _is_room_member(room, user):
            return Response({'error': 'Not a room member.'}, status=403)

        if room.status == 'closed':
            return Response({'error': 'Room is closed.'}, status=400)

        if not room.files_enabled:
            return Response({'error': 'File sharing is disabled for this room.'}, status=400)

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'No file provided.'}, status=400)

        needs_approval = True
        if user.role == 'admin':
            needs_approval = False
        elif user.role == 'client' and not room.client_files_need_approval:
            needs_approval = False
        elif user.role == 'provider' and not room.provider_files_need_approval:
            needs_approval = False

        file_status = 'pending' if needs_approval else 'direct'

        shared = SharedFile.objects.create(
            room      = room,
            sender    = user,
            file      = uploaded,
            file_name = uploaded.name,
            file_size = uploaded.size,
            status    = file_status,
        )

        if needs_approval:
            # Admin-only URL — safe, this group only ever has admin sockets in it.
            admin_preview_url = request.build_absolute_uri(shared.file.url)

            # Global admin notification (badge/pending list, regardless of which room they're viewing)
            _push_to_group('admin_pending', {
                'type':      'pending_file',
                'id':        shared.id,
                'file_name': shared.file_name,
                'file_size': _format_size(shared.file_size),
                'file_url':  admin_preview_url,
                'sender':    user.display_name,
                'room_id':   room.id,
                'room_name': room.name,
            })

            # Notify the room itself — visible only to the uploader (their own bubble)
            # and any admin currently viewing this room. Everyone else's socket
            # will silently ignore this event (see ChatConsumer.pending_file_room).
            _push_to_group(f'chat_{room.id}', {
                'type':      'pending_file_room',
                'id':        shared.id,
                'file_name': shared.file_name,
                'file_size': _format_size(shared.file_size),
                'sender':    user.display_name,
                'sender_id': user.id,
                'role':      user.role,
                'time':      shared.uploaded_at.strftime('%H:%M'),
            })

            from accounts.models import CustomUser
            send_push_to_users(
                CustomUser.objects.filter(role='admin').exclude(id=user.id),
                title=f'File needs approval — {room.name}',
                body=f'{user.display_name} uploaded {shared.file_name}',
                sound_type='pending',
                url=f'/chat/{room.id}',
            )

            return Response({
                'detail':  'File uploaded and pending admin approval.',
                'file_id': shared.id,
                'status':  'pending',
            }, status=status.HTTP_201_CREATED)

        _push_to_group(f'chat_{room.id}', {
            'type':      'file_approved',
            'id':        shared.id,
            'file_name': shared.file_name,
            'file_size': _format_size(shared.file_size),
            'file_url':  request.build_absolute_uri(shared.file.url),
            'sender':    user.display_name,
            'role':      user.role,
            'time':      shared.uploaded_at.strftime('%H:%M'),
        })
        send_push_to_users(
            _room_everyone(room, exclude_id=user.id),
            title=f'{user.display_name} — {room.name}',
            body=f'Shared a file: {shared.file_name}',
            sound_type='message',
            url=f'/chat/{room.id}',
        )
        return Response({
            'detail':  'File shared.',
            'file_id': shared.id,
            'status':  'direct',
        }, status=status.HTTP_201_CREATED)


class ApproveFileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, file_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        shared = get_object_or_404(SharedFile, pk=file_id, status='pending')
        shared.status      = 'approved'
        shared.approved_at = timezone.now()
        shared.save()

        try:
            file_url = request.build_absolute_uri(shared.file.url)
        except Exception:
            file_url = ''

        _push_to_group(f'chat_{shared.room_id}', {
            'type':      'file_approved',
            'id':        shared.id,
            'file_name': shared.file_name,
            'file_size': _format_size(shared.file_size),
            'file_url':  file_url,
            'sender':    shared.sender.display_name,
            'role':      shared.sender.role,
            'time':      shared.approved_at.strftime('%H:%M'),
        })
        send_push_to_users(
            _room_everyone(shared.room, exclude_id=request.user.id),
            title=f'File approved — {shared.room.name}',
            body=f'{shared.file_name} is now visible in the room',
            sound_type='message',
            url=f'/chat/{shared.room_id}',
        )

        return Response({'detail': 'File approved and delivered to room.'})


class RejectFileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, file_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        shared = get_object_or_404(SharedFile, pk=file_id, status='pending')
        shared.status = 'rejected'
        shared.save()

        _push_to_group(f'chat_{shared.room_id}', {
            'type':    'system_message',
            'message': f'A file from {shared.sender.display_name} was not approved.',
        })

        # Lets the uploader's (and admin's) pending bubble actually resolve
        # instead of sitting in "Awaiting approval" forever.
        _push_to_group(f'chat_{shared.room_id}', {
            'type':      'file_rejected',
            'id':        shared.id,
            'sender_id': shared.sender_id,
        })
        send_push_to_user(
            shared.sender,
            title=f'File rejected — {shared.room.name}',
            body=f'{shared.file_name} was not approved',
            sound_type='message',
            url=f'/chat/{shared.room_id}',
        )

        return Response({'detail': 'File rejected.'})

