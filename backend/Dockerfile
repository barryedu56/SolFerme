# API SolFerme (Django + Gunicorn). Utilisé par deploy/docker-compose.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# Les fichiers statiques (admin, DRF) sont servis par WhiteNoise.
RUN DJANGO_DEBUG=False DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput

EXPOSE 8000
# Les migrations s'appliquent à chaque démarrage (sans effet si rien de neuf).
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn solferme_api.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 60 --access-logfile -"]
