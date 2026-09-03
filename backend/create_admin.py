"""
Création du compte SuperAdmin unique de SolFerme.

Usage :
    DJANGO_SUPERADMIN_EMAIL=admin@exemple.com \
    DJANGO_SUPERADMIN_PASSWORD='...' \
    DJANGO_SUPERADMIN_NAME='Super Admin' \
    python create_admin.py

Le mot de passe n'est JAMAIS écrit en dur : il est lu depuis l'environnement.
"""
import os
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from farm_management.models import User

email = os.environ.get('DJANGO_SUPERADMIN_EMAIL')
password = os.environ.get('DJANGO_SUPERADMIN_PASSWORD')
name = os.environ.get('DJANGO_SUPERADMIN_NAME', 'Super Admin')

if not email or not password:
    sys.exit(
        "Définissez DJANGO_SUPERADMIN_EMAIL et DJANGO_SUPERADMIN_PASSWORD "
        "dans l'environnement avant de lancer ce script."
    )

if User.objects.filter(is_superuser=True).exists():
    print("Un compte SuperAdmin existe déjà — aucune action.")
    sys.exit(0)

if User.objects.filter(email=email).exists():
    sys.exit(f"Un utilisateur existe déjà avec l'email {email}.")

try:
    validate_password(password)
except ValidationError as e:
    sys.exit("Mot de passe refusé : " + " ".join(e.messages))

User.objects.create_superuser(email=email, password=password, name=name)
print(f"SuperAdmin créé : {email}")
