# accounts/views.py
import uuid
from django.shortcuts import render
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.throttling import AnonRateThrottle
from .email_utils import send_brevo_email
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



def get_tokens_for_user(user, platform=None):
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token

    if platform == 'mobile':
        # Only the mobile app tags its requests this way (see api.js). Each
        # mobile login gets a fresh session id embedded in both tokens, and
        # overwrites the user's active_device_token — so the previous
        # phone's tokens stop matching and get rejected on their next
        # request (see DeviceAwareJWTAuthentication). Web/browser logins
        # never pass platform='mobile', so they're unaffected and don't
        # count against the one-phone rule.
        session_id = uuid.uuid4().hex
        refresh['device_session_id'] = session_id
        access['device_session_id']  = session_id
        user.active_device_token = session_id
        user.save(update_fields=['active_device_token'])

    return {
        'refresh': str(refresh),
        'access':  str(access),
    }


def _client_platform(request):
    return request.headers.get('X-Client-Platform')


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
        tokens = get_tokens_for_user(user, platform=_client_platform(request))
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
        # ── Email verification required before login ──────────────────────
        # Account + room already exist, but no tokens are issued yet. The
        # frontend shows an "enter your code" step next, which hits
        # VerifyOTPView with this email + code to actually get logged in.
        code = OTP.generate_code()
        OTP.objects.create(user=user, code=code)
        send_brevo_email(
            to_email=user.email,
            to_name=user.display_name,
            subject='Verify your TutorJamesConnect account',
            html_content=(
                f'<p>Your verification code is: <strong>{code}</strong></p>'
                f'<p>This code expires in 10 minutes.</p>'
            ),
        )
        return Response(
            {
                'email':   user.email,
                'room_id': room.id,
                'message': 'Account created. Enter the code sent to your email to finish signing up.',
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
        # ── Email verification required before login ──────────────────────
        # See ClientSignupView for the same pattern. Account exists, but no
        # tokens are issued until the code is verified via VerifyOTPView.
        code = OTP.generate_code()
        OTP.objects.create(user=user, code=code)
        send_brevo_email(
            to_email=user.email,
            to_name=user.display_name,
            subject='Verify your TutorJamesConnect account',
            html_content=(
                f'<p>Your verification code is: <strong>{code}</strong></p>'
                f'<p>This code expires in 10 minutes.</p>'
            ),
        )
        return Response(
            {
                'email':   user.email,
                'message': 'Account created. Enter the code sent to your email to finish signing up.',
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

        # No need to ask whether the requester is a client or provider —
        # the phone number alone already identifies them. If it happens to
        # match more than one account (e.g. the same number used for both
        # a client and a provider profile), a token is created for each;
        # admin's pending-requests list shows each one by name so it's
        # obvious which is which.
        matches = CustomUser.objects.filter(phone_number=phone_number, role__in=('client', 'provider'))

        if not matches.exists():
            return Response(
                {'error': 'No account found with this phone number. Please check the number or sign up.'},
                status=404,
            )

        for user in matches:
            token = RoomAccessToken.objects.create(user=user)

            if user.email:
                send_brevo_email(
                    to_email=user.email,
                    to_name=user.display_name,
                    subject='Your TutorJamesConnect Access PIN',
                    html_content=(
                        f'<p>Your access PIN is: <strong>{token.pin}</strong></p>'
                        f'<p>Enter this along with your phone number to log back in. '
                        f'This PIN expires in 24 hours.</p>'
                    ),
                )

        return Response({
            'message': "A PIN has been sent to your email. If you dont receive it, admin can also send it manually."
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
                'pin':          t.pin,
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

        tokens = get_tokens_for_user(token.user, platform=_client_platform(request))

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


# ── PIN-based recovery (replaces the WhatsApp magic-link tap, which turned
# out to be unreliable across devices due to Android App Links verification
# not completing consistently). Admin sends the 5-digit PIN over WhatsApp
# instead of a link; the person types their phone number + PIN into the
# app/website directly. Rate-limited via VerifyAccessPinThrottle below,
# since a 5-digit space (100,000 combinations) needs real protection
# against brute-forcing once tied only to a known phone number.
class VerifyAccessPinThrottle(AnonRateThrottle):
    scope = 'pin_verify'


class VerifyAccessPinView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [VerifyAccessPinThrottle]

    def post(self, request):
        phone_number = request.data.get('phone_number', '').strip()
        pin          = request.data.get('pin', '').strip()

        if not phone_number or not pin:
            return Response({'error': 'Phone number and PIN are required.'}, status=400)

        token = RoomAccessToken.objects.filter(
            user__phone_number=phone_number,
            pin=pin,
            used_at__isnull=True,
        ).select_related('user').order_by('-created_at').first()

        if not token or not token.is_valid():
            return Response({'error': 'Incorrect PIN, or it has expired. Please request a new one.'}, status=400)

        token.used_at = timezone.now()
        token.save()

        tokens = get_tokens_for_user(token.user, platform=_client_platform(request))

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


# ── QR laptop-linking (WhatsApp-Web style companion login) ──────────────────
# Flow: browser creates a pending session -> shows QR code encoding a link
# URL -> phone (already logged in, via its own in-app camera scanner) scans
# it and confirms -> browser polls and receives an unrestricted 'web' token
# pair for that user. The phone's own session is completely untouched —
# this never counts against the single-mobile-device rule, since the
# tokens issued here never carry a device_session_id claim.

class CreateQRLinkSessionView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        from .models import QRLinkSession
        session = QRLinkSession.objects.create()
        frontend_base = getattr(settings, 'FRONTEND_URL', 'https://tutorjamesconnect.onrender.com')
        return Response({
            'token':      session.token,
            'qr_content': f'{frontend_base}/link/{session.token}',
            'expires_in': 120,
        })


class QRLinkSessionStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        from .models import QRLinkSession
        try:
            session = QRLinkSession.objects.get(token=token)
        except QRLinkSession.DoesNotExist:
            return Response({'status': 'invalid'}, status=404)

        if session.is_expired() and not session.linked_at:
            return Response({'status': 'expired'})

        if not session.linked_at:
            return Response({'status': 'pending'})

        if session.retrieved:
            return Response({'status': 'linked'})

        # Hand the tokens over exactly once, then mark retrieved so a
        # repeated poll (or anyone replaying this token) can't get them
        # again — the browser already has them stored client-side after this.
        session.retrieved = True
        session.save(update_fields=['retrieved'])

        room_id = None
        if session.user.role == 'client':
            from chat.models import ChatRoom
            room = ChatRoom.objects.filter(client=session.user).first()
            room_id = room.id if room else None

        return Response({
            'status':  'linked',
            'user':    UserSerializer(session.user).data,
            'access':  session.cached_access,
            'refresh': session.cached_refresh,
            'room_id': room_id,
        })


class LinkQRSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        from .models import QRLinkSession
        try:
            session = QRLinkSession.objects.get(token=token)
        except QRLinkSession.DoesNotExist:
            return Response({'error': 'Invalid or expired QR code.'}, status=400)

        if session.linked_at or session.is_expired():
            return Response({'error': 'This QR code has expired. Please refresh and try again.'}, status=400)

        # platform=None (default) — this is deliberately NOT tagged as
        # mobile, so it never touches active_device_token and never counts
        # against the single-mobile-device rule. The phone's own session
        # is completely unaffected.
        tokens = get_tokens_for_user(request.user)
        session.user           = request.user
        session.linked_at      = timezone.now()
        session.cached_access  = tokens['access']
        session.cached_refresh = tokens['refresh']
        session.save()

        return Response({'message': f"Linked to {request.user.display_name}'s computer."})


# ── Provider Registration ────────────────────────────────────────────────────
class ProviderRegisterView(generics.CreateAPIView):
    queryset           = CustomUser.objects.all()
    serializer_class   = ProviderRegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user   = serializer.save()
        tokens = get_tokens_for_user(user, platform=_client_platform(request))
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
        send_brevo_email(
            to_email=email,
            to_name=user.display_name,
            subject='Your TutorJamesConnect Login Code',
            html_content=(
                f'<p>Your login code is: <strong>{code}</strong></p>'
                f'<p>This code expires in 10 minutes.</p>'
            ),
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

        # Signup verification completes here too — harmless no-op for
        # already-verified users logging in via OTP normally.
        if not user.is_verified:
            user.is_verified = True
            user.save(update_fields=['is_verified'])

        tokens = get_tokens_for_user(user, platform=_client_platform(request))
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

        # Only one phone should be receiving push at a time (matches the
        # single-mobile-device login rule) — drop any other Expo push
        # subscriptions for this user so a device that lost its session
        # (kicked out by a newer login elsewhere) stops getting notified,
        # even if that old device never got a chance to unsubscribe itself.
        # Web/PWA push subscriptions are untouched — those are legitimately
        # multi-device.
        PushSubscription.objects.filter(
            user=request.user,
            endpoint__startswith='ExponentPushToken',
        ).exclude(endpoint=expo_token).delete()

        PushSubscription.objects.update_or_create(
            user     = request.user,
            endpoint = expo_token,
            defaults = {
                'p256dh': 'expo',
                'auth':   platform,
            }
        )
        return Response({'detail': 'Expo push token saved.'})
