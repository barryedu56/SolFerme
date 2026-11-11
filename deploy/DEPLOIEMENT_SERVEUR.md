# SolFerme sur le serveur de Bénef (Hetzner)

Remplace PythonAnywhere depuis novembre 2026.

| | |
|---|---|
| API | https://solferme.monbenef.com/api/ |
| Admin Django | https://solferme.monbenef.com/admin/ |
| Serveur | Hetzner « benef », 49.13.173.243 (`ssh root@49.13.173.243`) |
| Code | `/root/SolFerme` (backend + deploy) |
| Secrets | `/root/SolFerme/deploy/.env` (générés sur le serveur, jamais affichés) |

## Ce qui tourne

`cd /root/SolFerme/deploy && docker compose ps`

- **db** : MySQL 8.0 (port 3306 sur 127.0.0.1 seulement)
- **api** : Django + Gunicorn. Les migrations s'appliquent au démarrage
- **scheduler** : `process_reminders` toutes les 10 minutes (notifications push)
- **backup** : un dump par nuit vers 2 h dans `deploy/backups/`, 14 jours gardés

Le HTTPS est fait par le **Caddy de Bénef** (`/root/B-nef/deploy/Caddyfile`, bloc
`solferme.monbenef.com`), qui joint l'API par le réseau Docker `deploy_default`.
Bénef et SolFerme ont chacun leur base, leurs secrets et leurs conteneurs.

## Mettre à jour le code

Depuis le PC (dossier `SolFerme-main`) :

```bash
rsync -az --delete --exclude venv --exclude .env --exclude media --exclude staticfiles \
  --exclude __pycache__ --exclude 'deploy/backups' --exclude 'deploy/.env' \
  ./backend ./deploy root@49.13.173.243:/root/SolFerme/
ssh root@49.13.173.243 'cd /root/SolFerme/deploy && docker compose up -d --build'
```

## Sauvegardes

- Locales : `/root/SolFerme/deploy/backups/solferme_AAAA-MM-JJ_HHMM.sql.gz`
- Sauvegarde immédiate : `docker compose exec backup sh /backup.sh now`
- Google Drive : `/root/B-nef/deploy/sauvegarde-drive.sh` (cron 02:45) copie
  les sauvegardes de Bénef **et** de SolFerme sur Drive, dans les dossiers
  `Benef-Backups` et `SolFerme-Backups`, avec 90 jours gardés.

### Restaurer (⚠️ écrase la base en ligne)

```bash
cd /root/SolFerme/deploy
docker compose stop api scheduler
gunzip -c backups/solferme_AAAA-MM-JJ_HHMM.sql.gz \
  | docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
docker compose start api scheduler
```

## E-mails (mot de passe oublié, formulaire de contact)

Envoyés via **Brevo**, avec l'expéditeur `SolFerme <noreply@monbenef.com>` (le domaine est
authentifié chez Brevo). Pour configurer ou changer les réglages, sur le serveur :

```bash
sh /root/SolFerme/deploy/configurer-email.sh
```

Le script propose de réutiliser le compte Brevo de Bénef, ce qui évite de retaper la clé. Il
envoie ensuite un e-mail d'essai. Si l'essai échoue, il remet les anciens réglages.
