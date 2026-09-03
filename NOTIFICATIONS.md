# SolFerme — Système de notifications & alertes

## Vue d'ensemble

| Canal | Portée | Fonctionne quand… |
|---|---|---|
| **Notification locale** (rappels) | Appareil de l'utilisateur | App installée (build EAS), même hors-ligne. Pas dans Expo Go ni sur Web. |
| **Notification push distante** | Serveur → FCM/APNs → appareil | App fermée. Nécessite un `projectId` EAS. |
| **Alerte santé in-app** | Écran de l'app | App ouverte (bannière Dashboard + écran « Alertes santé »). |
| **Email** | Boîte mail | Mortalité enregistrée (+ mot de passe modifié). Nécessite `EMAIL_HOST`. |

L'interrupteur **Paramètres → Notifications** coupe/rétablit réellement les
notifications **locales** (annule les planifications, redemande la permission OS).

---

## 1. Rappels (`Reminder`)

- **Local** : `frontend/src/utils/notifications.ts` → `scheduleReminderNotification`
  (triggers SDK 54 : `DATE` / `DAILY` / `WEEKLY` / `MONTHLY` / `TIME_INTERVAL`).
  Planifié à la création/édition + resynchronisé à l'ouverture de l'écran Rappels
  (`reminderSync.ts`), avec déduplication.
- **Push distant (backup, app fermée)** : la commande
  `python manage.py process_reminders` :
  1. envoie une push aux destinataires des rappels échus non notifiés (`push_sent=False`) ;
  2. marque `OVERDUE` les rappels dont la date est passée.
  → **À planifier toutes les ~10 min** (voir `backend/scripts/run_notifications.bat`
  + Planificateur de tâches Windows, ou cron).

## 2. Alertes santé (`HealthAlert`)

Créées automatiquement par signal Django à chaque `ChickenMovement`
(MORT / MALADE / GUÉRI / AJOUT / VENTE).

Pour **MORT** et **MALADE** : après commit, `notify_health_alert()` envoie
- une **push** au propriétaire de la ferme ;
- un **email** au propriétaire (uniquement pour la mortalité).

Toujours **in-app** : bannière Dashboard + écran « Alertes santé ».

## 3. Notifications push distantes — mise en service

1. `cd frontend && npx eas init` → génère un `projectId`.
2. Renseigner `EXPO_PUBLIC_EAS_PROJECT_ID=<projectId>` dans `frontend/.env`.
3. Builder l'app : `eas build -p android` (et iOS). Les notifications push ne
   fonctionnent **pas en Expo Go**.
4. Backend : rien à configurer, l'envoi passe par l'API Expo Push
   (`https://exp.host/--/api/v2/push/send`) — aucune clé requise.

Sans `projectId` : l'app fonctionne normalement, seules les **notifications
locales** de rappel sont actives.

### Endpoints
- `POST /api/devices/` `{ token, platform }` — enregistre l'appareil (à la connexion).
- `DELETE /api/devices/` `{ token }` — désenregistre (à la déconnexion).

Les jetons morts (« DeviceNotRegistered ») sont purgés automatiquement à l'envoi.

## 4. Emails

- SMTP : renseigner `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
  `DEFAULT_FROM_EMAIL` dans l'environnement du backend.
- Sans `EMAIL_HOST` → backend console (les emails s'affichent dans les logs, dev uniquement).
