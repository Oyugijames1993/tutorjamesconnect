# accounts/urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    ClientRegisterView,
    ProviderRegisterView,
    MeView,
    UserListView,
    SendOTPView,
    VerifyOTPView,
    LogoutView,
)

urlpatterns = [
    # Registration — returns token immediately (persistent login)
    path('register/client/',   ClientRegisterView.as_view(),   name='register-client'),
    path('register/provider/', ProviderRegisterView.as_view(), name='register-provider'),

    # Login
    path('login/', TokenObtainPairView.as_view(), name='login'),

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
]
