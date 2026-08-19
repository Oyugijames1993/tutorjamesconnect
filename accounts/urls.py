# accounts/urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .token_views import DeviceAwareTokenObtainPairView
from .views import (
    ClientRegisterView,
    ProviderRegisterView,
    MeView,
    UserListView,
    SendOTPView,
    VerifyOTPView,
    LogoutView,
    ClientSignupView,
    ProviderSignupView,
    RequestAccessView,
    PendingAccessRequestsView,
    RedeemAccessTokenView,
    VapidPublicKeyView,
    SubscribePushView,
    UnsubscribePushView,
    ReferralListView,
    MarkDiscountGivenView,
    MyReferralLinkView,
    SubscribeExpoPushView,
)

urlpatterns = [
    # Registration — returns token immediately (persistent login)
    path('register/client/',   ClientRegisterView.as_view(),   name='register-client'),
    path('register/provider/', ProviderRegisterView.as_view(), name='register-provider'),

    # New frictionless signup — phone, email, full name, and role-specific
    # details. No password. Client signup also creates their permanent
    # room; provider signup does not (admin assigns them manually).
    path('signup/client/',   ClientSignupView.as_view(),   name='signup-client'),
    path('signup/provider/', ProviderSignupView.as_view(), name='signup-provider'),

    # Web Push — real notifications even when the app isn't open
    path('push/vapid-public-key/', VapidPublicKeyView.as_view(), name='vapid-public-key'),
    path('push/subscribe/',        SubscribePushView.as_view(),  name='push-subscribe'),
    path('push/unsubscribe/',      UnsubscribePushView.as_view(), name='push-unsubscribe'),

    # Lost-access recovery — client requests a link by phone number, admin
    # sees it and sends it manually over WhatsApp.
    path('request-access/',          RequestAccessView.as_view(),          name='request-access'),
    path('admin/access-requests/',   PendingAccessRequestsView.as_view(),  name='pending-access-requests'),
    path('redeem-access/',           RedeemAccessTokenView.as_view(),      name='redeem-access'),

    # Login
    path('login/', DeviceAwareTokenObtainPairView.as_view(), name='login'),

    # OTP login — for new device or after logout
    path('send-otp/',   SendOTPView.as_view(),   name='send-otp'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),

    # Logout
    path('logout/', LogoutView.as_view(), name='logout'),

    # Token refresh — persistent login
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),

    # Profile
    path('me/',    MeView.as_view(),       name='me'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('referrals/',                          ReferralListView.as_view(),     name='referral-list'),
    path('referrals/<int:referral_id>/toggle/', MarkDiscountGivenView.as_view(), name='mark-discount'),
    path('my-referral/',                        MyReferralLinkView.as_view(),   name='my-referral'),
    path('push/subscribe/expo/',                SubscribeExpoPushView.as_view(), name='expo-push-subscribe'),
]



