# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, ProviderProfile, OTP


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display  = ['display_name', 'client_id', 'username', 'email', 'phone_number', 'role', 'is_verified', 'is_staff']
    list_filter   = ['role', 'is_verified']
    search_fields = ['username', 'email', 'phone_number', 'client_id']
    ordering      = ['-created_at']
    readonly_fields = ['client_id', 'created_at']

    fieldsets = UserAdmin.fieldsets + (
        ('TutorJamesConnect', {
            'fields': ('role', 'phone_number', 'client_id', 'is_verified'),
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('TutorJamesConnect', {
            'fields': ('role', 'phone_number', 'is_verified'),
        }),
    )


@admin.register(ProviderProfile)
class ProviderProfileAdmin(admin.ModelAdmin):
    list_display  = ['user', 'specialisation', 'rate_min', 'rate_max', 'is_available']
    search_fields = ['user__username', 'user__email', 'specialisation']
    list_filter   = ['is_available']


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display  = ['user', 'code', 'created_at', 'is_used']
    list_filter   = ['is_used']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['created_at']
