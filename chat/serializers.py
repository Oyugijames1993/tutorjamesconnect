from rest_framework import serializers
from accounts.serializers import UserSerializer
from .models import ChatRoom, Message

class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    room   = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = Message
        fields = ['id', 'room', 'sender', 'body', 'status', 'flagged', 'flag_reason', 'timestamp']

class ChatRoomSerializer(serializers.ModelSerializer):
    client        = UserSerializer(read_only=True)
    providers     = UserSerializer(many=True, read_only=True)
    extra_clients = UserSerializer(many=True, read_only=True)

    class Meta:
        model  = ChatRoom
        fields = [
            'id', 'name', 'client', 'extra_clients', 'providers',
            'status', 'files_enabled', 'client_files_need_approval',
            'provider_files_need_approval', 'negotiation_mode', 'created_at'
        ]

