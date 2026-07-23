# accounts/views.py
from django.shortcuts import render
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import CustomUser, OTP, RoomAccessToken
from .serializers import (
    UserSerializer,
    ClientRegisterSerializer,
    ProviderRegisterSerializer,
    ClientSignupSerializer,
)


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }


# ── Client Registration ──────────────────────────────────────────────────────
class ClientRegisterView(generics.CreateAPIView):
    queryset           = CustomUser.objects.all()
    serializer_class   = ClientRegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user   = serializer.save()
        tokens = get_tokens_for_user(user)
        return Response(
            {
                'user':    UserSerializer(user).data,
                'access':  tokens['access'],
                'refresh': tokens['refresh'],
                'message': f'Welcome to TutorJamesConnect!',
            },
            status=status.HTTP_201_CREATED,
        )


# ── New frictionless client signup: phone, email, full name, course ─────────
# No password. Creates the account AND its permanent room in one step, then
# logs the client straight in — they're already at the keyboard, so there's
# nothing to verify yet that a long-lived session doesn't already cover.
class ClientSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        from chat.models import ChatRoom, next_client_room_name

        serializer = ClientSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        room = ChatRoom.objects.create(
            name   = next_client_room_name(),
            client = user,
            course = serializer.validated_data.get('course', ''),
        )

        tokens = get_tokens_for_user(user)
        return Response(
            {
                'user':    UserSerializer(user).data,
                'room_id': room.id,
                'access':  tokens['access'],
                'refresh': tokens['refresh'],
                'message': 'Welcome to TutorJamesConnect!',
            },
            status=status.HTTP_201_CREATED,
        )


# ── Lost-access recovery: client requests a link by phone number ────────────
# Deliberately does NOT send anything automatically, and deliberately does
# NOT reveal whether a given phone number is registered (same response
# either way) — the actual link only ever reaches admin, who sends it
# manually over WhatsApp after confirming it's really their client.
class RequestAccessView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        phone_number = request.data.get('phone_number', '').strip()
        if not phone_number:
            return Response({'error': 'Phone number is required.'}, status=400)

        try:
            user = CustomUser.objects.get(phone_number=phone_number, role='client')
            RoomAccessToken.objects.create(user=user)
        except CustomUser.DoesNotExist:
            pass

        return Response({
            'message': 'If this number is registered, an access request has been sent to the admin.'
        })


# ── Admin's view of pending access requests, with a ready-to-use link ───────
class PendingAccessRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        tokens = RoomAccessToken.objects.filter(
            used_at__isnull=True
        ).select_related('user').order_by('-created_at')

        frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        data = [
            {
                'id':           t.id,
                'user_display': t.user.display_name,
                'phone_number': t.user.phone_number,
                'is_valid':     t.is_valid(),
                'created_at':   t.created_at,
                'magic_link':   f'{frontend_base}/access/{t.token}',
            }
            for t in tokens
        ]
        return Response(data)


# ── Client clicks the WhatsApp link → redeem the token → get logged in ──────
class RedeemAccessTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token_str = request.data.get('token', '')
        try:
            token = RoomAccessToken.objects.get(token=token_str)
        except RoomAccessToken.DoesNotExist:
            return Response({'error': 'Invalid or expired link.'}, status=400)

        if not token.is_valid():
            return Response({'error': 'This link has expired or already been used.'}, status=400)

        token.used_at = timezone.now()
        token.save()

        tokens = get_tokens_for_user(token.user)
        return Response({
            'user':    UserSerializer(token.user).data,
            'access':  tokens['access'],
            'refresh': tokens['refresh'],
            'message': 'Welcome back!',
        })


# ── Provider Registration ────────────────────────────────────────────────────
class ProviderRegisterView(generics.CreateAPIView):
    queryset           = CustomUser.objects.all()
    serializer_class   = ProviderRegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user   = serializer.save()
        tokens = get_tokens_for_user(user)
        return Response(
            {
                'user':    UserSerializer(user).data,
                'access':  tokens['access'],
                'refresh': tokens['refresh'],
                'message': 'Welcome to TutorJamesConnect! Your provider account is ready.',
            },
            status=status.HTTP_201_CREATED,
        )


# ── Current User ─────────────────────────────────────────────────────────────
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


# ── All Users (admin only) ───────────────────────────────────────────────────
class UserListView(generics.ListAPIView):
    queryset           = CustomUser.objects.all()
    serializer_class   = UserSerializer
    permission_classes = [IsAuthenticated]


# ── Send OTP ─────────────────────────────────────────────────────────────────
class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            return Response(
                {'error': 'No account found with this email.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        code = OTP.generate_code()
        OTP.objects.create(user=user, code=code)

        send_mail(
            subject='Your TutorJamesConnect Login Code',
            message=f'Your login code is: {code}\n\nThis code expires in 10 minutes.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
        )

        return Response({'message': 'OTP sent to your email.'})


# ── Verify OTP ───────────────────────────────────────────────────────────────
class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        code  = request.data.get('code')

        try:
            user = CustomUser.objects.get(email=email)
            otp  = OTP.objects.filter(
                user=user, code=code, is_used=False
            ).latest('created_at')
        except (CustomUser.DoesNotExist, OTP.DoesNotExist):
            return Response(
                {'error': 'Invalid OTP or email.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not otp.is_valid():
            return Response(
                {'error': 'OTP has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp.is_used = True
        otp.save()

        tokens = get_tokens_for_user(user)
        return Response({
            'user':    UserSerializer(user).data,
            'access':  tokens['access'],
            'refresh': tokens['refresh'],
            'message': 'Login successful!',
        })


# ── Logout ───────────────────────────────────────────────────────────────────
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Successfully logged out.'},
                status=status.HTTP_200_OK,
            )
        except Exception:
            return Response(
                {'error': 'Invalid token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

