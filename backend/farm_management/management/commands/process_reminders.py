from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from farm_management.models import Reminder, SyncIdempotencyKey
from farm_management.notifications import notify_due_reminders


class Command(BaseCommand):
    help = (
        "Traite les rappels : envoie une notification push pour les rappels échus "
        "non encore notifiés, puis marque comme OVERDUE ceux dont la date est passée. "
        "À planifier toutes les 10-15 min (cron / Planificateur de tâches Windows)."
    )

    def handle(self, *args, **kwargs):
        # 1. Notifications push « rappel dû » (rappels PENDING/OVERDUE, échéance
        #    atteinte, push_sent=False).
        try:
            sent = notify_due_reminders()
        except Exception as exc:  # pragma: no cover
            sent = 0
            self.stderr.write(self.style.WARNING(f"Notifications push ignorées : {exc}"))
        self.stdout.write(self.style.SUCCESS(f"{sent} rappel(s) notifié(s) par push."))

        # 2. Marquage des rappels en retard.
        today = timezone.now().date()
        count = Reminder.objects.filter(status='PENDING', date__lt=today).update(status='OVERDUE')
        self.stdout.write(self.style.SUCCESS(f"{count} rappel(s) marqué(s) en retard."))

        # 3. Purge des clés d'idempotence de synchro devenues inutiles (> 14 j).
        #    Le client ne rejoue jamais un CREATE au-delà de sa fenêtre de synchro.
        cutoff = timezone.now() - timedelta(days=14)
        purged, _ = SyncIdempotencyKey.objects.filter(created_at__lt=cutoff).delete()
        if purged:
            self.stdout.write(self.style.SUCCESS(f"{purged} clé(s) d'idempotence purgée(s)."))
