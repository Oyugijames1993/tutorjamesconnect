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
from .models import CustomUser, OTP, RoomAccessToken, PushSubscription, Referral
from .serializers import (
    UserSerializer,
    ClientRegisterSerializer,
    ProviderRegisterSerializer,
    ClientSignupSerializer,
    ProviderSignupSerializer,
)



def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }


# ── Web Push: give the frontend the public key it needs to subscribe ────────
class VapidPublicKeyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'public_key': settings.VAPID_PUBLIC_KEY})


# ── Web Push: register a browser/device to receive notifications ────────────
class SubscribePushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get('endpoint')
        keys     = request.data.get('keys', {})
        p256dh   = keys.get('p256dh')
        auth     = keys.get('auth')

        if not (endpoint and p256dh and auth):
            return Response({'error': 'Malformed subscription.'}, status=400)

        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={'user': request.user, 'p256dh': p256dh, 'auth': auth},
        )
        return Response({'detail': 'Subscribed.'}, status=201)


# ── Web Push: stop notifying a specific browser/device ───────────────────────
class UnsubscribePushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get('endpoint')
        if endpoint:
            PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({'detail': 'Unsubscribed.'})


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

        # ── Handle referral code ──────────────────────────────────────────────
        ref_code = request.data.get('ref') or request.query_params.get('ref')
        if ref_code:
            try:
                from .models import Referral
                referrer = CustomUser.objects.get(client_id=ref_code, role='client')
                if referrer != user:
                    Referral.objects.get_or_create(referrer=referrer, referred=user)
            except CustomUser.DoesNotExist:
                pass

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

# ── Passwordless provider signup ──────────────────────────────────────────
# No auto-created room — providers get manually added to whichever rooms
# need them by admin, after reviewing their profile. Otherwise identical
# philosophy to ClientSignupView: no password, logged straight in.
class ProviderSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ProviderSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        tokens = get_tokens_for_user(user)
        return Response(
            {
                'user':    UserSerializer(user).data,
                'access':  tokens['access'],
                'refresh': tokens['refresh'],
                'message': 'Welcome to TutorJamesConnect! Your profile is ready for admin to review.',
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
        role         = request.data.get('role', 'client').strip()

        if not phone_number:
            return Response({'error': 'Phone number is required.'}, status=400)
        if role not in ('client', 'provider'):
            role = 'client'

        # Phone numbers are only guaranteed unique among clients — a
        # provider could share a number with a client (or, in principle,
        # with another provider). Asking which role the requester is
        # resolves that ambiguity instead of guessing. If more than one
        # account still matches, a token is created for each; admin's
        # pending-requests list shows each one by name so it's obvious
        # which is which.
        matches = CustomUser.objects.filter(phone_number=phone_number, role=role)
        for user in matches:
            RoomAccessToken.objects.create(user=user)

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

        frontend_base = getattr(settings, 'FRONTEND_URL', 'https://tutorjamesconnect.onrender.com')
        data = [
            {
                'id':           t.id,
                'user_display': t.user.display_name,
                'role':         t.user.role,
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

        # Clients have exactly one permanent room — hand it straight to the
        # frontend so it can route there directly. Providers can be in
        # several (or none), so there's no single "their room" to name;
        # the frontend sends them to the general chat view instead.
        room_id = None
        if token.user.role == 'client':
            from chat.models import ChatRoom
            room = ChatRoom.objects.filter(client=token.user).first()
            room_id = room.id if room else None

        return Response({
            'user':    UserSerializer(token.user).data,
            'access':  tokens['access'],
            'refresh': tokens['refresh'],
            'room_id': room_id,
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

# ── Referral system ───────────────────────────────────────────────────────────

class ReferralListView(APIView):
    """Admin only — list all referrals with discount status."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)


        referrals = Referral.objects.select_related(
            'referrer', 'referred', 'discount_given_by'
        ).all()

        data = [
            {
                'id':                r.id,
                'referrer':          r.referrer.display_name,
                'referrer_id':       r.referrer.id,
                'referrer_client_id':r.referrer.client_id,
                'referred':          r.referred.display_name,
                'referred_id':       r.referred.id,
                'referred_client_id':r.referred.client_id,
                'created_at':        r.created_at,
                'discount_given':    r.discount_given,
                'discount_given_at': r.discount_given_at,
                'discount_given_by': r.discount_given_by.display_name if r.discount_given_by else None,
            }
            for r in referrals
        ]
        return Response(data)


class MarkDiscountGivenView(APIView):
    """Admin only — toggle discount given for a referral."""
    permission_classes = [IsAuthenticated]

    def post(self, request, referral_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only.'}, status=403)

        from .models import Referral
        from django.utils import timezone

        referral = get_object_or_404(Referral, pk=referral_id)
        referral.discount_given    = not referral.discount_given
        referral.discount_given_at = timezone.now() if referral.discount_given else None
        referral.discount_given_by = request.user if referral.discount_given else None
        referral.save()

        return Response({
            'id':             referral.id,
            'discount_given': referral.discount_given,
        })


class MyReferralLinkView(APIView):
    """Client — get their own referral link and stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import Referral
        from django.conf import settings

        user     = request.user
        base_url = getattr(settings, 'FRONTEND_URL', 'https://tutorjamesconnect.onrender.com')

        referrals = Referral.objects.filter(referrer=user).select_related('referred')
        data = [
            {
                'referred':       r.referred.display_name,
                'joined':         r.created_at,
                'discount_given': r.discount_given,
            }
            for r in referrals
        ]

        return Response({
            'referral_link':      f'{base_url}/ref/{user.client_id}',
            'total_referrals':    referrals.count(),
            'discounts_earned':   referrals.filter(discount_given=True).count(),
            'referrals':          data,
        })

class SubscribeExpoPushView(APIView):
    """Save Expo push token for native app notifications."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import PushSubscription
        expo_token = request.data.get('expo_token')
        platform   = request.data.get('platform', 'android')

        if not expo_token:
            return Response({'error': 'expo_token is required.'}, status=400)

        PushSubscription.objects.update_or_create(
            user     = request.user,
            endpoint = expo_token,
            defaults = {
                'p256dh': 'expo',
                'auth':   platform,
            }
        )
        return Response({'detail': 'Expo push token saved.'})
