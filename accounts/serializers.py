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
