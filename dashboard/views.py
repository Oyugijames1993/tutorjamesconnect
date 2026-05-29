from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.models import CustomUser
from chat.models import ChatRoom, Message, SharedFile


class DashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can access the dashboard.'},
                status=403,
            )
        return Response({
            'total_users':    CustomUser.objects.count(),
            'total_clients':  CustomUser.objects.filter(role='client').count(),
            'total_providers': CustomUser.objects.filter(role='provider').count(),
            'total_rooms':    ChatRoom.objects.count(),
            'active_rooms':   ChatRoom.objects.filter(status='active').count(),
            'closed_rooms':   ChatRoom.objects.filter(status='closed').count(),
            'total_messages': Message.objects.count(),
            'pending_messages': Message.objects.filter(status='pending').count(),
            'total_files':    SharedFile.objects.count(),
            'pending_files':  SharedFile.objects.filter(status='pending').count(),
        })
