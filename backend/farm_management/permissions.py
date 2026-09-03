from rest_framework.permissions import BasePermission

class IsSuperAdmin(BasePermission):
    """
    Permet l'acces uniquement aux superutilisateurs (SuperAdmin).
    Verifie request.user.is_superuser cote serveur.
    La securite ne depend jamais d'une valeur provenant du frontend.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_superuser
        )
