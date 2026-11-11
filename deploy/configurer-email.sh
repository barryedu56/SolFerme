#!/bin/sh
# Réglages d'envoi d'e-mails (Brevo) pour SolFerme : « mot de passe oublié »,
# formulaire de contact. Met les réglages dans deploy/.env, redémarre l'API et
# envoie un e-mail d'essai. À lancer sur le serveur, de façon interactive :
#   sh /root/SolFerme/deploy/configurer-email.sh
# Par défaut, il réutilise le compte Brevo de Bénef (/root/B-nef/deploy/.env),
# sans jamais afficher la clé. Sinon, la clé est tapée sans s'afficher.
set -eu
cd "$(dirname "$0")"
BENEF_ENV=/root/B-nef/deploy/.env

get() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- ; }

LOGIN=""; KEY=""
if [ -n "$(get EMAIL_HOST_PASSWORD "$BENEF_ENV")" ]; then
  printf 'Réutiliser le compte Brevo de Bénef (%s) ? [O/n] ' "$(get EMAIL_HOST_USER "$BENEF_ENV")"
  IFS= read -r REP
  case "$REP" in
    n|N|non|NON) ;;
    *) LOGIN=$(get EMAIL_HOST_USER "$BENEF_ENV"); KEY=$(get EMAIL_HOST_PASSWORD "$BENEF_ENV") ;;
  esac
fi
if [ -z "$KEY" ]; then
  printf 'Identifiant SMTP Brevo (xxx@smtp-brevo.com) : '
  IFS= read -r LOGIN
  printf 'Colle la clé SMTP Brevo puis Entrée (rien ne s affiche) : '
  stty -echo 2>/dev/null || true
  IFS= read -r KEY
  stty echo 2>/dev/null || true
  echo
fi
case "$KEY" in
  xsmtpsib-*) ;;
  *) echo "Ce n'est pas une clé SMTP Brevo (elle commence par xsmtpsib-). Rien n'a été changé."; exit 1 ;;
esac

printf 'Ton adresse e-mail pour recevoir l essai : '
IFS= read -r DEST
case "$DEST" in
  *@*.*) ;;
  *) echo "Adresse invalide. Rien n'a été changé."; exit 1 ;;
esac
printf 'Adresse qui reçoit les messages du formulaire de contact [%s] : ' "$DEST"
IFS= read -r INBOX
INBOX=${INBOX:-$DEST}

umask 077
cp -p .env .env.avant-email
TMP=$(mktemp .env.XXXXXX)
grep -vE '^(DEFAULT_FROM_EMAIL|EMAIL_HOST|EMAIL_PORT|EMAIL_HOST_USER|EMAIL_HOST_PASSWORD|EMAIL_USE_TLS|CONTACT_INBOX)=' .env > "$TMP" || true
{
  # monbenef.com est le domaine authentifié chez Brevo (SPF/DKIM).
  echo "DEFAULT_FROM_EMAIL=SolFerme <noreply@monbenef.com>"
  echo "EMAIL_HOST=smtp-relay.brevo.com"
  echo "EMAIL_PORT=587"
  echo "EMAIL_HOST_USER=$LOGIN"
  echo "EMAIL_HOST_PASSWORD=$KEY"
  echo "EMAIL_USE_TLS=True"
  echo "CONTACT_INBOX=$INBOX"
} >> "$TMP"
cat "$TMP" > .env
rm -f "$TMP"
KEY=

echo "Redémarrage de l'API…"
docker compose up -d --no-build --no-deps --force-recreate api scheduler >/dev/null 2>&1
sleep 10

echo "Envoi de l'e-mail d'essai…"
if docker compose exec -T -e DEST="$DEST" api python manage.py shell -c "
import os
from django.core.mail import send_mail
send_mail('SolFerme : e-mail d essai', 'Si tu lis ce message, l envoi des e-mails de SolFerme fonctionne (mot de passe oublié, contact).', None, [os.environ['DEST']])
" >/dev/null 2>.email-erreur; then
  rm -f .env.avant-email .email-erreur
  echo "OK : e-mail d'essai envoyé à $DEST. Regarde ta boîte (et les spams)."
else
  tail -n 1 .email-erreur | sed 's/xsmtpsib-[^ ]*/[clé masquée]/g'
  rm -f .email-erreur
  mv .env.avant-email .env
  docker compose up -d --no-build --no-deps --force-recreate api scheduler >/dev/null 2>&1
  echo "ÉCHEC : l'envoi n'a pas marché. Les anciens réglages sont remis."
  exit 1
fi
