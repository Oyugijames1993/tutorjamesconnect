from rest_framework import serializers
from accounts.serializers import UserSerializer
from .models import ChatRoom, Message

class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)

    class Meta:
        model  = Message
        fields = ['id', 'sender', 'body', 'status', 'flagged', 'timestamp']

class ChatRoomSerializer(serializers.ModelSerializer):
    client    = UserSerializer(read_only=True)
    providers = UserSerializer(many=True, read_only=True)

    class Meta:
        model  = ChatRoom
        fields = ['id', 'name', 'client', 'providers', 'status', 'files_enabled', 'created_at']
