"""
Orchestration des notifications métier (push + email).

Deux points d'entrée :
  - notify_health_alert(movement)  → appelé par un signal après création d'un
    mouvement MORT/MALADE (via transaction.on_commit).
  - notify_due_reminders()         → appelé par la commande `send_due_reminders`
    (à planifier en cron / tâche planifiée).

Toutes les fonctions sont défensives : une erreur ici ne doit jamais casser
une opération métier.
"""
import logging
from datetime import datetime, time as dtime

from django.conf import settings
from django.utils import timezone

from .push import notify_users

logger = logging.getLogger(__name__)

_TYPE_LABEL = {
    "MORT": "Mortalité",
    "MALADE": "Maladie",
    "GUERI": "Guérison",
    "AJOUT": "Ajout",
    "VENTE": "Vente",
}


def _farm_recipients(farm):
    """Propriétaire de la ferme (destinataire principal des alertes)."""
    recipients = []
    owner = getattr(farm, "owner", None)
    if owner and owner.is_active:
        recipients.append(owner)
    return recipients


def notify_health_alert(movement):
    try:
        if movement.type not in ("MORT", "MALADE"):
            return
        lot = movement.lot
        farm = lot.farm
        recipients = _farm_recipients(farm)
        if not recipients:
            return

        label = _TYPE_LABEL.get(movement.type, movement.type)
        qty = movement.quantity or 0
        title = f"⚠️ {label} — {lot.name}"
        body = f"{qty} sujet(s) · Ferme {farm.name}"
        data = {"screen": "HealthAlerts", "lotId": lot.id, "farmId": farm.id}

        notify_users(recipients, title, body, data)

        # Email uniquement pour la mortalité (événement critique).
        if movement.type == "MORT":
            _email_mortality(recipients, farm, lot, qty)
    except Exception as exc:  # pragma: no cover
        logger.warning("notify_health_alert a échoué (%s)", exc)


def _email_mortality(recipients, farm, lot, qty):
    try:
        from django.core.mail import send_mail
        emails = [u.email for u in recipients if u.email]
        if not emails:
            return
        when = timezone.now().strftime("%d/%m/%Y à %H:%M")
        send_mail(
            subject=f"SolFerme — Alerte mortalité : {lot.name}",
            message=(
                f"Une mortalité vient d'être enregistrée sur votre exploitation.\n\n"
                f"Ferme : {farm.name}\n"
                f"Lot : {lot.name}\n"
                f"Nombre de sujets : {qty}\n"
                f"Date : {when}\n\n"
                f"Consultez l'application SolFerme (section « Alertes santé ») "
                f"pour le détail et les actions recommandées."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=emails,
            fail_silently=True,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("_email_mortality a échoué (%s)", exc)


def notify_due_reminders():
    """Envoie une push pour chaque rappel échu non encore notifié. Retourne le
    nombre de rappels traités."""
    from .models import Reminder

    now = timezone.now()
    today = timezone.localdate()
    due = Reminder.objects.filter(
        status__in=["PENDING", "OVERDUE"], push_sent=False, date__lte=today,
    ).select_related("farm", "lot", "created_by")

    sent = 0
    for r in due:
        # L'échéance exacte = date + heure (ou 08:00 par défaut).
        trigger_time = r.time or dtime(8, 0)
        naive = datetime.combine(r.date, trigger_time)
        trigger_dt = timezone.make_aware(naive) if settings.USE_TZ else naive
        if trigger_dt > now:
            continue

        recipients = []
        if r.created_by and r.created_by.is_active:
            recipients.append(r.created_by)
        else:
            recipients = _farm_recipients(r.farm)
        if recipients:
            lot_txt = f" · {r.lot.name}" if r.lot else ""
            notify_users(
                recipients,
                f"🔔 {r.title}",
                f"{r.type}{lot_txt}",
                {"screen": "Reminders", "reminderId": r.id},
            )
        r.push_sent = True
        r.save(update_fields=["push_sent"])
        sent += 1
    return sent
