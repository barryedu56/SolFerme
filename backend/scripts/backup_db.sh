#!/bin/bash
# ============================================================================
#  SolFerme — Sauvegarde complète de la base MySQL.
#
#  Usage :
#    • Tâche planifiée PythonAnywhere (quotidienne) :
#        bash /home/ahmad5/SolFerme/backend/scripts/backup_db.sh
#    • Export manuel, à tout moment : la MÊME commande dans une console Bash.
#      Le fichier .sql.gz est ensuite téléchargeable depuis l'onglet Files.
#
#  Restauration (⚠️ ÉCRASE la base — uniquement en cas de perte de données) :
#    gunzip -c ~/solferme-backups/solferme_AAAA-MM-JJ_HHMM.sql.gz \
#      | mysql --user=ahmad5 --host=ahmad5.mysql.pythonanywhere-services.com -p 'ahmad5$solferme'
#
#  Réglages via variables d'environnement (optionnel) :
#    SOLFERME_BACKUP_DIR        (défaut : ~/solferme-backups)
#    SOLFERME_BACKUP_KEEP_DAYS  (défaut : 14)
# ============================================================================
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${SOLFERME_BACKUP_DIR:-$HOME/solferme-backups}"
KEEP_DAYS="${SOLFERME_BACKUP_KEEP_DAYS:-14}"
ENV_FILE="$BACKEND_DIR/.env"

# --- Lire les identifiants de connexion depuis backend/.env -------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "ERREUR : $ENV_FILE introuvable." >&2
  exit 1
fi
get_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d '=' -f 2-; }
DB_NAME="$(get_env DB_NAME)"
DB_USER="$(get_env DB_USER)"
DB_PASSWORD="$(get_env DB_PASSWORD)"
DB_HOST="$(get_env DB_HOST)"
DB_PORT="$(get_env DB_PORT)"; DB_PORT="${DB_PORT:-3306}"

if [ -z "${DB_NAME}" ] || [ -z "${DB_USER}" ] || [ -z "${DB_PASSWORD}" ] || [ -z "${DB_HOST}" ]; then
  echo "ERREUR : DB_NAME / DB_USER / DB_PASSWORD / DB_HOST manquants dans $ENV_FILE." >&2
  exit 1
fi

# --- Fichier d'auth temporaire (jamais de mot de passe en ligne de commande) --
CNF="$(mktemp)"
chmod 600 "$CNF"
cat > "$CNF" <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=${DB_USER}
password=${DB_PASSWORD}
EOF
trap 'rm -f "$CNF"' EXIT

# --- Dump -------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$BACKUP_DIR/solferme_${STAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M')] Sauvegarde de '${DB_NAME}' -> ${OUT}"
if mysqldump --defaults-extra-file="$CNF" \
      --no-tablespaces --single-transaction --skip-lock-tables \
      --routines --triggers \
      --default-character-set=utf8mb4 \
      "$DB_NAME" | gzip -9 > "${OUT}.part"; then
  mv "${OUT}.part" "$OUT"
else
  rm -f "${OUT}.part"
  echo "ECHEC du mysqldump — aucune sauvegarde écrite." >&2
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
LINES="$(gunzip -c "$OUT" | head -c 200000 | grep -c 'CREATE TABLE' || true)"
echo "OK — ${SIZE}, ${LINES} table(s) détectée(s)."

# --- Rotation : ne garder que les KEEP_DAYS derniers jours -------------------
find "$BACKUP_DIR" -name 'solferme_*.sql.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete \
  | sed 's/^/Supprimé (ancien) : /' || true

echo "Sauvegardes en stock :"
ls -1t "$BACKUP_DIR"/solferme_*.sql.gz 2>/dev/null | head -20 | sed 's/^/  /'
