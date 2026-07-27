# accounts/push.py
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def send_push_to_user(user, title, body, sound_type='message', url=None):
    """
    Sends a Web Push notification to every device `user` has subscribed on.
    Safe to call from anywhere — never raises; a failed push (or a user
    with zero subscriptions, e.g. they've never granted permission) is
    silently skipped rather than breaking whatever triggered it.

    sound_type: 'message' (routine — new message/file delivered, nothing
    to act on) or 'pending' (urgent — needs admin's approve/reject).
    The service worker on the frontend reads this to pick which sound
    file to actually play, since Web Push itself has no audio API.

    NOTE: this makes a blocking HTTP call per device (pywebpush uses
    `requests`). Fine at pilot scale called from a sync DRF view. If
    calling from an async context (e.g. a Channels consumer), wrap this
    in `asgiref.sync.sync_to_async` rather than awaiting it directly.
    """
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
                vapid_private_key=settings.VAPID_PRIVATE_KEY_PEM,
                vapid_claims={'sub': settings.VAPID_ADMIN_EMAIL},
            )
        except WebPushException as e:
            status_code = getattr(e.response, 'status_code', None)
            if status_code in (404, 410):
                # Subscription expired or was revoked by the browser —
                # stop trying it, and clean it up so it doesn't pile up.
                sub.delete()
            else:
                logger.warning('Push failed for %s: %s', user.display_name, e)
        except Exception as e:
            # Never let a push failure break the caller's actual request.
            logger.warning('Unexpected push error for %s: %s', user.display_name, e)


def send_push_to_users(users, title, body, sound_type='message', url=None):
    """Convenience wrapper for notifying several people about the same event."""
    for user in users:
        send_push_to_user(user, title, body, sound_type=sound_type, url=url)
