"""Validation de robustesse de mot de passe — partagée par l'inscription,
le changement de mot de passe et la réinitialisation."""
import re

from django.contrib.auth.password_validation import validate_password as _django_validate
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

_SPECIAL_RE = re.compile(r'[!@#$%^&*(),.?":{}|<>_\-\[\]/\\+=;\'`~]')


def validate_password_strength(value: str, user=None) -> str:
    """Lève rest_framework.serializers.ValidationError si le mot de passe est trop faible.

    Règles : ≥ 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial,
    plus les validateurs Django (mot de passe commun, similarité, 100% numérique)."""
    if not value or len(value) < 8:
        raise serializers.ValidationError("Le mot de passe doit contenir au moins 8 caractères.")
    if not re.search(r'[A-Z]', value):
        raise serializers.ValidationError("Le mot de passe doit contenir au moins une lettre majuscule.")
    if not re.search(r'[a-z]', value):
        raise serializers.ValidationError("Le mot de passe doit contenir au moins une lettre minuscule.")
    if not re.search(r'[0-9]', value):
        raise serializers.ValidationError("Le mot de passe doit contenir au moins un chiffre.")
    if not _SPECIAL_RE.search(value):
        raise serializers.ValidationError("Le mot de passe doit contenir au moins un caractère spécial.")

    try:
        _django_validate(value, user=user)
    except DjangoValidationError as e:
        raise serializers.ValidationError(list(e.messages))

    return value
