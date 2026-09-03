"""
Envoi de notifications push via l'API Expo Push.

- Aucune dépendance à FCM/APNs directement : on passe par le service Expo
  (https://exp.host/--/api/v2/push/send) qui route vers FCM/APNs.
- 100% défensif : toute erreur (réseau, jeton invalide, service indisponible)
  est absorbée et ne doit JAMAIS faire échouer la requête métier appelante.
- Les jetons morts (« DeviceNotRegistered ») sont purgés automatiquement.
"""
import logging

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_BATCH = 100
_TIMEOUT = 10


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def send_to_tokens(tokens, title, body, data=None):
    """Envoie une notification à une liste de jetons Expo. Retourne l'ensemble
    des jetons signalés comme invalides par Expo (à purger)."""
    tokens = [t for t in {t for t in tokens} if t and t.startswith("ExponentPushToken")]
    if not tokens:
        return set()

    try:
        import requests
    except Exception:  # pragma: no cover
        logger.warning("push: bibliothèque 'requests' indisponible")
        return set()

    dead = set()
    for batch in _chunks(tokens, _BATCH):
        messages = [{
            "to": tok,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "channelId": "default",
            "data": data or {},
        } for tok in batch]
        try:
            resp = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=_TIMEOUT,
            )
            payload = resp.json()
        except Exception as exc:  # réseau, JSON, timeout…
            logger.warning("push: envoi échoué (%s)", exc)
            continue

        results = payload.get("data") or []
        for tok, result in zip(batch, results):
            if not isinstance(result, dict):
                continue
            if result.get("status") == "error":
                err = (result.get("details") or {}).get("error")
                if err in ("DeviceNotRegistered", "InvalidCredentials"):
                    dead.add(tok)
                logger.info("push: erreur pour un jeton (%s)", err)
    return dead


def notify_users(users, title, body, data=None):
    """Notifie une liste d'utilisateurs (tous leurs appareils). Purge les jetons
    morts. Ne lève jamais d'exception."""
    try:
        from .models import DeviceToken
        user_ids = [u.id for u in users if getattr(u, "id", None)]
        if not user_ids:
            return
        qs = DeviceToken.objects.filter(user_id__in=user_ids)
        tokens = list(qs.values_list("token", flat=True))
        if not tokens:
            return
        dead = send_to_tokens(tokens, title, body, data)
        if dead:
            DeviceToken.objects.filter(token__in=dead).delete()
    except Exception as exc:  # pragma: no cover - filet de sécurité absolu
        logger.warning("push: notify_users a échoué (%s)", exc)
