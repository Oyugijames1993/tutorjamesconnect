# accounts/email_utils.py
"""
Sends transactional email via Brevo's REST API (not SMTP). Used in place of
Django's send_mail() for OTP codes and PIN-recovery emails — Brevo handles
deliverability/reputation for us, and the API is more reliable than SMTP
relays for single-recipient transactional sends.

Requires these environment variables to be set (e.g. on Render):
    BREVO_API_KEY      — from Brevo dashboard → Settings → SMTP & API → API keys
    BREVO_SENDER_EMAIL — must be a verified sender in Brevo
    BREVO_SENDER_NAME  — display name shown to recipients, e.g. "TutorJamesConnect"
"""

import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'


def send_brevo_email(to_email, subject, html_content, to_name=None):
    """
    Sends a single transactional email via Brevo's API.

    Returns True on success, False on failure. Never raises — a failed
    email should not crash the request that triggered it.
    """
    api_key      = getattr(settings, 'BREVO_API_KEY', None)
    sender_email = getattr(settings, 'BREVO_SENDER_EMAIL', None)
    sender_name  = getattr(settings, 'BREVO_SENDER_NAME', 'TutorJamesConnect')

    if not api_key or not sender_email:
        logger.warning(
            'Brevo not configured (missing BREVO_API_KEY or BREVO_SENDER_EMAIL) — '
            'skipped sending email to %s', to_email
        )
        return False

    payload = {
        'sender':      {'name': sender_name, 'email': sender_email},
        'to':          [{'email': to_email, 'name': to_name or to_email}],
        'subject':     subject,
        'htmlContent': html_content,
    }
    headers = {
        'accept':       'application/json',
        'api-key':      api_key,
        'content-type': 'application/json',
    }

    try:
        response = requests.post(BREVO_API_URL, json=payload, headers=headers, timeout=10)
        if response.status_code in (200, 201):
            return True
        logger.error(
            'Brevo send failed (%s) for %s: %s',
            response.status_code, to_email, response.text
        )
        return False
    except requests.RequestException as exc:
        logger.error('Brevo send raised an exception for %s: %s', to_email, exc)
        return False
