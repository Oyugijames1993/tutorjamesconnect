# config/asgi.py
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
import chat.routing

django_asgi_app = get_asgi_application()


@database_sync_to_async
def get_user_from_token(token):
    from rest_framework_simplejwt.tokens import AccessToken
    from accounts.models import CustomUser
    from django.contrib.auth.models import AnonymousUser
    try:
        access_token = AccessToken(token)
        user_id = access_token['user_id']
        user = CustomUser.objects.get(id=user_id)

        # Same single-mobile-device check as DeviceAwareJWTAuthentication —
        # a token with a device_session_id claim (mobile-issued) that no
        # longer matches the user's active_device_token means this phone
        # was logged out by a newer login elsewhere; treat as anonymous so
        # the chat connection gets rejected.
        session_id = access_token.get('device_session_id')
        if session_id and user.active_device_token != session_id:
            return AnonymousUser()

        return user
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        from urllib.parse import parse_qs
        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        token_list = params.get('token', [None])
        token = token_list[0] if token_list else None
        if token:
            scope['user'] = await get_user_from_token(token)
        else:
            from django.contrib.auth.models import AnonymousUser
            scope['user'] = AnonymousUser()
        return await super().__call__(scope, receive, send)


application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddleware(
        URLRouter(chat.routing.websocket_urlpatterns)
    ),
})
