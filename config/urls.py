from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
import os

urlpatterns = [
    path('admin/',         admin.site.urls),
    path('api/accounts/',  include('accounts.urls')),
    path('api/chat/',      include('chat.urls')),
    path('api/dashboard/', include('dashboard.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# ── Serve React frontend for all non-API routes ───────────────────────────────
# In production, React is built into staticfiles/frontend/
# Django serves index.html for any route React Router handles
if not settings.DEBUG:
    from django.views.static import serve
    from django.http import FileResponse

    def serve_react(request, *args, **kwargs):
        index_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
        return FileResponse(open(index_path, 'rb'), content_type='text/html')

    urlpatterns += [
        # Serve React static assets (JS, CSS, icons)
        re_path(r'^assets/(?P<path>.*)$', serve, {
            'document_root': os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'assets'),
        }),
        # Serve all other routes to React index.html
        re_path(r'^(?!api/|admin/|media/).*$', serve_react),
    ]