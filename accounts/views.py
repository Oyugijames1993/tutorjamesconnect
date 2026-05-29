# accounts/views.py
from django.shortcuts import render
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.mail import send_mail
from django.conf import settings
from .models import CustomUser, OTP
from .serializers import (
    UserSerializer,
    ClientRegisterSerializer,
    ProviderRegisterSerializer,
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
