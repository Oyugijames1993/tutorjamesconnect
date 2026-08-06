# accounts/push.py
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

def send_push_to_user(user, title, body, sound_type='message', url=None):
    from pywebpush import webpush, WebPushException
    from .models import PushSubscription

    subs = PushSubscription.objects.filter(user=user)
    if not subs.exists():
        return

    payload = json.dumps({
        'title':      title,
        'body':       body,
        'sound_type': sound_type,
        'url':        url or '/',
    })

    # pywebpush 2.x expects the raw PEM string directly
    private_key = settings.VAPID_PRIVATE_KEY_PEM.strip()

    for sub in subs:
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
                vapid_claims={
                    'sub': settings.VAPID_ADMIN_EMAIL,
                    'aud': sub.endpoint.split('/')[0] + '//' + sub.endpoint.split('/')[2],
                },
            )
            logger.info('Push sent to %s', user.display_name)
        except WebPushException as e:
            status_code = getattr(e.response, 'status_code', None)
            if status_code in (404, 410):
                sub.delete()
                logger.info('Deleted expired subscription for %s', user.display_name)
            else:
                logger.warning('Push failed for %s: %s', user.display_name, e)
                if hasattr(e, 'response') and e.response:
                    logger.warning('Response: %s', e.response.text)
        except Exception as e:
            logger.warning('Unexpected push error for %s: %s', user.display_name, e)


def send_push_to_users(users, title, body, sound_type='message', url=None):
    for user in users:
        send_push_to_user(user, title, body, sound_type=sound_type, url=url)
