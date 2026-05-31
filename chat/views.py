from django.shortcuts import render
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q
from .models import ChatRoom, Message, SharedFile
from .serializers import ChatRoomSerializer, MessageSerializer
from .moderation import moderate_message, ACTION_SEND, ACTION_HOLD, ACTION_BLOCK


def _format_size(n_bytes):
    if n_bytes < 1024:
        return f"{n_bytes} B"
    if n_bytes < 1024 ** 2:
        return f"{n_bytes // 1024} KB"
    return f"{n_bytes / 1024 ** 2:.1f} MB"


class ChatRoomListView(generics.ListAPIView):
    serializer_class   = ChatRoomSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return ChatRoom.objects.all()
        if user.role == 'client':
            return ChatRoom.objects.filter(
                Q(client=user) | Q(extra_clients=user)
            ).distinct()
        if user.role == 'provider':
            return ChatRoom.objects.filter(providers=user)
        return ChatRoom.objects.none()


class ChatRoomCreateView(generics.CreateAPIView):
    serializer_class   = ChatRoomSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can create rooms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        name      = request.data.get('name')
        client_id = request.data.get('client_id')
        from accounts.models import CustomUser
        client = get_object_or_404(CustomUser, pk=client_id, role='client')
        room   = ChatRoom.objects.create(
            name=name, client=client, admin=request.user
        )
        return Response(ChatRoomSerializer(room).data, status=status.HTTP_201_CREATED)


class MessageListView(generics.ListAPIView):
    serializer_class   = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        room_id = self.kwargs['room_id']
        room    = get_object_or_404(ChatRoom, pk=room_id)
        user    = self.request.user
        if not room.is_member(user):
            return Message.objects.none()
        return room.messages.filter(status__in=['sent', 'approved'])


class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        room = get_object_or_404(ChatRoom, pk=room_id)
        user = request.user
        body = request.data.get('body', '').strip()

        if room.status == 'closed':
            return Response(
                {'error': 'This room is closed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not room.is_member(user):
            return Response(
                {'error': 'You are not a member of this room.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not body:
            return Response(
                {'error': 'Message cannot be empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action, reason = moderate_message(user.role, body)

        if action == ACTION_BLOCK:
            return Response(
                {'error': reason},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == ACTION_HOLD:
            msg = Message.objects.create(
                room=room,
                sender=user,
                body=body,
                status='pending',
                flagged=True,
                flag_reason=reason,
            )
            return Response(
                {
                    'message': MessageSerializer(msg).data,
                    'warning': reason,
                },
                status=status.HTTP_201_CREATED,
            )

        msg = Message.objects.create(
            room=room,
            sender=user,
            body=body,
            status='sent',
        )
        return Response(
            MessageSerializer(msg).data,
            status=status.HTTP_201_CREATED,
        )


class PendingMessagesView(generics.ListAPIView):
    serializer_class   = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role != 'admin':
            return Message.objects.none()
        return Message.objects.filter(status='pending').order_by('-timestamp')


class PendingFilesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)
        files = SharedFile.objects.filter(
            status='pending'
        ).select_related('sender', 'room').order_by('-uploaded_at')
        data = [
            {
                'id':                f.id,
                'room':              f.room.id,
                'room_name':         f.room.name,
                'sender':            {'display_name': f.sender.display_name},
                'file_name':         f.file_name,
                'file_size_display': _format_size(f.file_size),
            }
            for f in files
        ]
        return Response(data)


class ApproveMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can approve messages.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        msg = get_object_or_404(Message, pk=message_id, status='pending')
        msg.status = 'approved'
        msg.save()
        return Response(
            {
                'message': MessageSerializer(msg).data,
                'detail':  'Message approved and delivered to client.',
            }
        )


class RejectMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can reject messages.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        msg = get_object_or_404(Message, pk=message_id, status='pending')
        msg.status = 'rejected'
        msg.save()
        return Response({'detail': 'Message rejected.'})


class InviteProviderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can invite providers.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        room = get_object_or_404(ChatRoom, pk=room_id)

        provider_id = request.data.get('provider_id')
        if not provider_id:
            return Response(
                {'error': 'provider_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from accounts.models import CustomUser
        from django.utils import timezone

        provider = get_object_or_404(CustomUser, pk=provider_id, role='provider')

        if room.providers.filter(id=provider.id).exists():
            return Response(
                {'error': 'Provider is already in this room.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        room.providers.add(provider)
        room.status           = 'active'
        room.provider_joined_at = timezone.now()
        room.save()

        Message.objects.create(
            room   = room,
            sender = request.user,
            body   = f'{provider.display_name} (Provider) has joined the room.',
            status = 'sent',
        )

        return Response(
            ChatRoomSerializer(room).data,
            status=status.HTTP_200_OK,
        )


class RemoveProviderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can remove providers.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        room = get_object_or_404(ChatRoom, pk=room_id)

        provider_id = request.data.get('provider_id')
        if not provider_id:
            return Response(
                {'error': 'provider_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from accounts.models import CustomUser

        provider = get_object_or_404(CustomUser, pk=provider_id, role='provider')

        if not room.providers.filter(id=provider.id).exists():
            return Response(
                {'error': 'Provider is not in this room.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        room.providers.remove(provider)

        if room.providers.count() == 0:
            room.status = 'negotiating'
            room.save()

        Message.objects.create(
            room   = room,
            sender = request.user,
            body   = f'{provider.display_name} (Provider) has been removed from the room.',
            status = 'sent',
        )

        return Response(
            ChatRoomSerializer(room).data,
            status=status.HTTP_200_OK,
        )


class InviteClientView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        room = get_object_or_404(ChatRoom, pk=room_id)
        user = request.user

        # Admin can use client_id, regular members use phone_number
        if user.role == 'admin':
            client_id = request.data.get('client_id')
            if not client_id:
                return Response({'error': 'client_id is required.'}, status=400)
            from accounts.models import CustomUser
            invitee = get_object_or_404(CustomUser, pk=client_id, role='client')
        else:
            # Regular members can only invite by phone number
            if not (user.id == room.client_id or
                    room.extra_clients.filter(id=user.id).exists()):
                return Response({'error': 'Not a room member.'}, status=403)

            phone_number = request.data.get('phone_number', '').strip()
            if not phone_number:
                return Response({'error': 'Phone number is required.'}, status=400)

            from accounts.models import CustomUser
            try:
                invitee = CustomUser.objects.get(
                    phone_number=phone_number,
                    role='client'
                )
            except CustomUser.DoesNotExist:
                return Response(
                    {'error': 'No client found with that phone number.'},
                    status=404
                )

        if room.status == 'closed':
            return Response({'error': 'Room is closed.'}, status=400)

        if invitee.id == room.client_id:
            return Response({'error': 'This client is already in the room.'}, status=400)

        if room.extra_clients.filter(id=invitee.id).exists():
            return Response({'error': 'This client is already in the room.'}, status=400)

        room.extra_clients.add(invitee)

        Message.objects.create(
            room   = room,
            sender = user,
            body   = f'{invitee.display_name} has been invited to the room.',
            status = 'sent',
        )

        return Response(ChatRoomSerializer(room).data, status=200)


class RemoveClientView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        room = get_object_or_404(ChatRoom, pk=room_id)

        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'error': 'client_id is required.'}, status=400)

        from accounts.models import CustomUser

        client = get_object_or_404(CustomUser, pk=client_id, role='client')

        if not room.extra_clients.filter(id=client.id).exists():
            return Response({'error': 'Client is not in this room.'}, status=400)

        room.extra_clients.remove(client)

        Message.objects.create(
            room   = room,
            sender = request.user,
            body   = f'{client.display_name} has been removed from the room.',
            status = 'sent',
        )

        return Response(ChatRoomSerializer(room).data, status=200)


class CloseRoomView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can close rooms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        room = get_object_or_404(ChatRoom, pk=room_id)
        if room.status == 'closed':
            return Response(
                {'error': 'Room is already closed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        room.status = 'closed'
        room.save()

        Message.objects.create(
            room   = room,
            sender = request.user,
            body   = 'This room has been closed by the admin. Thank you!',
            status = 'sent',
        )
        return Response(
            ChatRoomSerializer(room).data,
            status=status.HTTP_200_OK,
        )


class RoomSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, room_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        room = get_object_or_404(ChatRoom, pk=room_id)

        if 'provider_files_need_approval' in request.data:
            room.provider_files_need_approval = request.data['provider_files_need_approval']
        if 'client_files_need_approval' in request.data:
            room.client_files_need_approval = request.data['client_files_need_approval']
        if 'files_enabled' in request.data:
            room.files_enabled = request.data['files_enabled']

        room.save()
        return Response(ChatRoomSerializer(room).data)


class DeleteRoomView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, room_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)
        room = get_object_or_404(ChatRoom, pk=room_id)
        if room.status != 'closed':
            return Response(
                {'error': 'Only closed rooms can be deleted.'},
                status=400
            )
        room.delete()
        return Response({'detail': 'Room deleted.'}, status=204)