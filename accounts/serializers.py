# accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import CustomUser, ProviderProfile


class ProviderProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProviderProfile
        fields = ['specialisation', 'bio', 'rate_min', 'rate_max', 'is_available']


class UserSerializer(serializers.ModelSerializer):
    display_name     = serializers.ReadOnlyField()
    provider_profile = ProviderProfileSerializer(read_only=True)

    class Meta:
        model  = CustomUser
        fields = ['id', 'display_name', 'client_id', 'email', 'phone_number',
                  'role', 'is_verified', 'created_at', 'provider_profile']


class ClientRegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model  = CustomUser
        fields = [
            'first_name', 'last_name', 'email',
            'phone_number', 'password', 'password2'
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        if CustomUser.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({'email': 'This email is already registered.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = CustomUser(
            username     = validated_data['email'],
            email        = validated_data['email'],
            first_name   = validated_data.get('first_name', ''),
            last_name    = validated_data.get('last_name', ''),
            phone_number = validated_data.get('phone_number', ''),
            role         = 'client',
        )
        user.set_password(password)
        user.save()
        return user


class ProviderRegisterSerializer(serializers.ModelSerializer):
    password       = serializers.CharField(write_only=True, validators=[validate_password])
    password2      = serializers.CharField(write_only=True)
    specialisation = serializers.CharField()
    bio            = serializers.CharField()
    rate_min       = serializers.DecimalField(max_digits=10, decimal_places=2)
    rate_max       = serializers.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        model  = CustomUser
        fields = [
            'first_name', 'last_name', 'email', 'phone_number',
            'password', 'password2',
            'specialisation', 'bio', 'rate_min', 'rate_max',
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        if CustomUser.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({'email': 'This email is already registered.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        password       = validated_data.pop('password')
        specialisation = validated_data.pop('specialisation')
        bio            = validated_data.pop('bio')
        rate_min       = validated_data.pop('rate_min')
        rate_max       = validated_data.pop('rate_max')

        user = CustomUser(
            username     = validated_data['email'],
            email        = validated_data['email'],
            first_name   = validated_data.get('first_name', ''),
            last_name    = validated_data.get('last_name', ''),
            phone_number = validated_data.get('phone_number', ''),
            role         = 'provider',
        )
        user.set_password(password)
        user.save()

        ProviderProfile.objects.create(
            user           = user,
            specialisation = specialisation,
            bio            = bio,
            rate_min       = rate_min,
            rate_max       = rate_max,
        )
        return user


class ClientSignupSerializer(serializers.Serializer):
    """
    The new frictionless client signup: phone, email, full name, course.
    No password — this account is only ever accessed via a persistent
    session or a WhatsApp-delivered access link (see RoomAccessToken).
    Deliberately a plain Serializer, not a ModelSerializer, since this
    creates BOTH a CustomUser and a ChatRoom together and doesn't map
    cleanly onto either model alone.
    """
    full_name    = serializers.CharField(max_length=150)
    email        = serializers.EmailField()
    phone_number = serializers.CharField(max_length=20)
    course       = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_email(self, value):
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError('This email is already registered.')
        return value

    def validate_phone_number(self, value):
        if CustomUser.objects.filter(phone_number=value, role='client').exists():
            raise serializers.ValidationError(
                'This phone number is already registered. Use "Lost access?" to get back into your room.'
            )
        return value

    def create(self, validated_data):
        user = CustomUser(
            username     = validated_data['email'],
            email        = validated_data['email'],
            first_name   = validated_data['full_name'],
            phone_number = validated_data['phone_number'],
            role         = 'client',
        )
        user.set_unusable_password()
        user.save()
        return user


class ProviderSignupSerializer(serializers.Serializer):
    """
    Passwordless provider signup — same philosophy as ClientSignupSerializer.
    Providers don't get an auto-created room (admin adds them to whichever
    rooms need them, manually, after reviewing their profile); this just
    creates the account + their ProviderProfile.

    Rate range isn't collected at signup — ProviderProfile defaults both
    to 0, and admin can set real figures later once rates are actually
    negotiated (rate range was originally part of this flow; dropped per
    request since pricing isn't something a provider should be setting
    for themselves up front).
    """
    full_name      = serializers.CharField(max_length=150)
    email          = serializers.EmailField()
    phone_number   = serializers.CharField(max_length=20)
    specialisation = serializers.CharField(max_length=200)
    bio            = serializers.CharField()
    portfolio_url  = serializers.URLField(required=False, allow_blank=True)

    def validate_email(self, value):
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError('This email is already registered.')
        return value

    def validate_phone_number(self, value):
        if CustomUser.objects.filter(phone_number=value, role='provider').exists():
            raise serializers.ValidationError(
                'This phone number is already registered. Use "Lost access?" to get back in.'
            )
        return value

    def create(self, validated_data):
        user = CustomUser(
            username     = validated_data['email'],
            email        = validated_data['email'],
            first_name   = validated_data['full_name'],
            phone_number = validated_data['phone_number'],
            role         = 'provider',
        )
        user.set_unusable_password()
        user.save()

        ProviderProfile.objects.create(
            user           = user,
            specialisation = validated_data['specialisation'],
            bio            = validated_data['bio'],
            portfolio_url  = validated_data.get('portfolio_url', ''),
        )
        return user

