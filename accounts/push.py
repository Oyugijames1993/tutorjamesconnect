# accounts/push.py
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

def send_push_to_user(user, title, body, sound_type='message', url=None):
    from .models import PushSubscription
    subs = PushSubscription.objects.filter(user=user)
    if not subs.exists():
        return

    for sub in subs:
        # Expo push token (native app)
        if sub.endpoint.startswith('ExponentPushToken'):
            send_expo_push(sub.endpoint, title, body, sound_type, url)
        else:
            # Web push (PWA)
            send_web_push(sub, title, body, sound_type, url)

def send_expo_push(token, title, body, sound_type='message', url=None):
    """
    Send push notification via Expo's push service. Android reads the
    notification sound from the channel, not this payload's 'sound' field —
    so 'channelId' is what actually determines which sound plays; see the
    two channels ('default'/'urgent') set up in services/notifications.js
    on the app side. iOS does use the 'sound' field directly.
    """
    channel_id = 'urgent' if sound_type == 'pending' else 'default'
    ios_sound  = 'urgent.wav' if sound_type == 'pending' else 'default'
    try:
        response = requests.post(
            'https://exp.host/--/api/v2/push/send',
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            json={
                'to':        token,
                'title':     title,
                'body':      body,
                'sound':     ios_sound,
                'channelId': channel_id,
                'data':      { 'url': url or '/' },
                'priority':  'high',
            },
            timeout=10,
        )
        result = response.json()
        logger.info('Expo push sent: %s', result)
    except Exception as e:
        logger.warning('Expo push failed: %s', e)

def send_web_push(sub, title, body, sound_type='message', url=None):
    """Send web push notification via VAPID."""
    from pywebpush import webpush, WebPushException
    payload = json.dumps({
        'title':      title,
        'body':       body,
        'sound_type': sound_type,
        'url':        url or '/',
    })
    private_key = getattr(settings, 'VAPID_PRIVATE_KEY', settings.VAPID_PRIVATE_KEY_PEM).strip()
    try:
        webpush(
            subscription_info={
                'endpoint': sub.endpoint,
                'keys': {
                    'p256dh': sub.p256dh,
                    'auth':   sub.auth,
                },
            },
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={'sub': settings.VAPID_ADMIN_EMAIL},
        )
        logger.info('Web push sent to %s', sub.user.display_name)
    except WebPushException as e:
        status_code = getattr(e.response, 'status_code', None)
        if status_code in (404, 410):
            sub.delete()
        else:
            logger.warning('Web push failed for %s: %s', sub.user.display_name, e)
    except Exception as e:
        logger.warning('Unexpected push error for %s: %s', sub.user.display_name, e)

def send_push_to_users(users, title, body, sound_type='message', url=None):
    for user in users:
        send_push_to_user(user, title, body, sound_type=sound_type, url=url)
