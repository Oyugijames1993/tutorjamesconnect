# chat/urls.py
from django.urls import path
from .views import (
    ChatRoomListView,
    ChatRoomCreateView,
    MessageListView,
    SendMessageView,
    PendingMessagesView,
    PendingFilesView,
    ApproveMessageView,
    RejectMessageView,
    InviteProviderView,
    CloseRoomView,
    RemoveProviderView,
    RoomSettingsView,
    DeleteRoomView,
    InviteClientView,
    RemoveClientView,
)
from .file_sharing_views import UploadFileView, ApproveFileView, RejectFileView

urlpatterns = [
    path('rooms/',        ChatRoomListView.as_view(),   name='room-list'),
    path('rooms/create/', ChatRoomCreateView.as_view(), name='room-create'),

    path('rooms/<int:room_id>/invite-provider/', InviteProviderView.as_view(), name='invite-provider'),
    path('rooms/<int:room_id>/remove-provider/', RemoveProviderView.as_view(), name='remove-provider'),
    path('rooms/<int:room_id>/close/',           CloseRoomView.as_view(),      name='close-room'),
    path('rooms/<int:room_id>/settings/',        RoomSettingsView.as_view(),   name='room-settings'),
    path('rooms/<int:room_id>/delete/',          DeleteRoomView.as_view(),     name='delete-room'),

    path('rooms/<int:room_id>/messages/',    MessageListView.as_view(), name='message-list'),
    path('rooms/<int:room_id>/send/',        SendMessageView.as_view(), name='send-message'),
    path('rooms/<int:room_id>/upload-file/', UploadFileView.as_view(),  name='upload-file'),

    path('admin/pending/',                           PendingMessagesView.as_view(), name='pending-messages'),
    path('admin/files/',                             PendingFilesView.as_view(),    name='pending-files'),
    path('admin/messages/<int:message_id>/approve/', ApproveMessageView.as_view(), name='approve-message'),
    path('admin/messages/<int:message_id>/reject/',  RejectMessageView.as_view(),  name='reject-message'),
    path('admin/files/<int:file_id>/approve/',       ApproveFileView.as_view(),    name='approve-file'),
    path('admin/files/<int:file_id>/reject/',        RejectFileView.as_view(),     name='reject-file'),
    # Add to urlpatterns:
    path('rooms/<int:room_id>/invite-client/', InviteClientView.as_view(), name='invite-client'),
    path('rooms/<int:room_id>/remove-client/', RemoveClientView.as_view(), name='remove-client'),
]