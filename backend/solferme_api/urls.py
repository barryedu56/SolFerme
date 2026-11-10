"""
URL configuration for solferme_api project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.urls import re_path
from django.views.static import serve
import os

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('farm_management.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# En production (DEBUG=False), `static()` ne sert rien. Sur le serveur Hetzner,
# le reverse-proxy (Caddy de Bénef) n'a pas accès aux fichiers de SolFerme :
# Django sert donc lui-même les photos de profil (trafic très faible).
if not settings.DEBUG and os.environ.get('SERVE_MEDIA') == 'True':
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
