from django.core.management.base import BaseCommand
from django.utils import timezone
from farm_management.models import PasswordResetCode


class Command(BaseCommand):
    help = 'Supprime les codes de réinitialisation de mot de passe expirés'

    def handle(self, *args, **options):
        deleted, _ = PasswordResetCode.objects.filter(expires_at__lt=timezone.now()).delete()
        self.stdout.write(self.style.SUCCESS(f'{deleted} code(s) expiré(s) supprimé(s).'))