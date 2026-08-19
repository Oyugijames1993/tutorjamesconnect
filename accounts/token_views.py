import uuid
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView


class DeviceAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Same as the default username/password login, except: when the request
    comes from the mobile app (X-Client-Platform: mobile header), it issues
    a fresh token pair carrying a device_session_id claim and updates the
    user's active_device_token — same single-mobile-device mechanism used
    by ClientSignupView, ProviderSignupView, RedeemAccessTokenView, etc.
    Web/browser logins are untouched.
    """
    def validate(self, attrs):
        data = super().validate(attrs)

        request = self.context.get('request')
        platform = request.headers.get('X-Client-Platform') if request else None

        if platform == 'mobile':
            refresh = RefreshToken.for_user(self.user)
            access = refresh.access_token
            session_id = uuid.uuid4().hex
            refresh['device_session_id'] = session_id
            access['device_session_id']  = session_id
            self.user.active_device_token = session_id
            self.user.save(update_fields=['active_device_token'])
            data['refresh'] = str(refresh)
            data['access']  = str(access)

        return data


class DeviceAwareTokenObtainPairView(TokenObtainPairView):
    serializer_class = DeviceAwareTokenObtainPairSerializer
