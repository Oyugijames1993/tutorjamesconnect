from django.contrib import admin
from .models import ChatRoom, Message, SharedFile


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'client', 'status',
        'files_enabled',
        'client_files_need_approval',
        'provider_files_need_approval',
        'agreed_price',
        'created_at',
    ]
    list_filter   = ['status', 'files_enabled']
    list_editable = [
        'files_enabled',
        'client_files_need_approval',
        'provider_files_need_approval',
    ]
    search_fields = ['name']
    filter_horizontal = ['providers']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display  = ['sender', 'room', 'body', 'status', 'flagged', 'timestamp']
    list_filter   = ['status', 'flagged']
    search_fields = ['body', 'sender__username']


@admin.register(SharedFile)
class SharedFileAdmin(admin.ModelAdmin):
    list_display = [
        'sender', 'receiver', 'room',
        'file_name', 'file_size', 'status',
        'uploaded_at', 'approved_at',
    ]
    list_filter   = ['status']
    search_fields = ['file_name', 'sender__username']
