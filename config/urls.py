from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.http import HttpResponse
import os

def empty_sw(request):
    """Return empty service worker to prevent MIME type error."""
    return HttpResponse('// no-op service worker', content_type='application/javascript')

urlpatterns = [
    path('admin/',         admin.site.urls),
    path('api/accounts/',  include('accounts.urls')),
    path('api/chat/',      include('chat.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('sw.js',          empty_sw),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# ── Serve React frontend for all non-API routes ───────────────────────────────
if not settings.DEBUG:
    from django.views.static import serve
    from django.http import FileResponse

    def serve_react(request, *args, **kwargs):
        index_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
        return FileResponse(open(index_path, 'rb'), content_type='text/html')

    urlpatterns += [
        re_path(r'^assets/(?P<path>.*)$', serve, {
            'document_root': os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'assets'),
        }),
        re_path(r'^(?!api/|admin/|media/|sw\.js).*$', serve_react),
    ]