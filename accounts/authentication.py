from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class DeviceAwareJWTAuthentication(JWTAuthentication):
    """
    Standard JWT auth, plus a single-mobile-device check.

    Only mobile-app-issued tokens carry a 'device_session_id' claim (see
    get_tokens_for_user and DeviceAwareTokenObtainPairSerializer). If a
    token has that claim, it must match the user's current
    active_device_token — logging in on a new phone overwrites that field,
    so an older phone's token stops matching and gets rejected here on its
    next request.

    Web/browser-issued tokens never carry the claim, so they're completely
    unaffected by this check — the single-device rule only applies among
    the mobile app's own logins.
    """
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        session_id = validated_token.get('device_session_id')
        if session_id and user.active_device_token != session_id:
            raise AuthenticationFailed(
                'You have been logged out because your account was used on another device.',
                code='device_session_superseded',
            )
        return user
