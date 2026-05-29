# accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models
import random
from django.utils import timezone


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ('admin',    'Admin'),
        ('client',   'Client'),
        ('provider', 'Provider'),
    ]

    role         = models.CharField(max_length=10, choices=ROLE_CHOICES, default='client')
    phone_number = models.CharField(max_length=20, blank=True)
    email        = models.EmailField(unique=True)
    client_id    = models.CharField(max_length=20, unique=True, blank=True, null=True)
    is_verified  = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Auto-assign client_id when a client registers
        if self.role == 'client' and not self.client_id:
            super().save(*args, **kwargs)  # save first to get a primary key
            self.client_id = f'client{100 + self.pk}'
            CustomUser.objects.filter(pk=self.pk).update(client_id=self.client_id)
        else:
            super().save(*args, **kwargs)

    @property
    def display_name(self):
        # Clients show as client100, client101 etc.
        # Providers and admins show their first name
        if self.role == 'client' and self.client_id:
            return self.client_id
        return self.first_name or self.username

    def __str__(self):
        return f"{self.display_name} ({self.role})"


class ProviderProfile(models.Model):
    user           = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='provider_profile')
    specialisation = models.CharField(max_length=200)
    bio            = models.TextField()
    rate_min       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    rate_max       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    portfolio_url  = models.URLField(blank=True)
    is_available   = models.BooleanField(default=True)

    def __str__(self):
        return f'{self.user.display_name} — {self.specialisation}'


class OTP(models.Model):
    user       = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    code       = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used    = models.BooleanField(default=False)

    def is_valid(self):
        expiry_time = self.created_at + timezone.timedelta(minutes=10)
        return not self.is_used and timezone.now() < expiry_time

    @staticmethod
    def generate_code():
        return str(random.randint(100000, 999999))

    def __str__(self):
        return f"{self.user.display_name} - {self.code}"
