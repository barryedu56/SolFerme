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
#  Copie hors-site : si rclone est installé et qu'un remote 'gdrive' existe,
#  chaque sauvegarde est aussi envoyée sur Google Drive (voir ADMIN_PYTHONANYWHERE.md § 5).
#
#  Réglages via variables d'environnement (optionnel) :
#    SOLFERME_BACKUP_DIR         (défaut : ~/solferme-backups)
#    SOLFERME_BACKUP_KEEP_DAYS   (défaut : 14)
#    SOLFERME_RCLONE_REMOTE      (défaut : gdrive:SolFerme-Backups)
#    SOLFERME_RCLONE_KEEP_DAYS   (défaut : 90)
# ============================================================================
set -euo pipefail
export PATH="$HOME/bin:$PATH"   # rclone installé sans droits admin dans ~/bin

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${SOLFERME_BACKUP_DIR:-$HOME/solferme-backups}"
KEEP_DAYS="${SOLFERME_BACKUP_KEEP_DAYS:-14}"
RCLONE_REMOTE="${SOLFERME_RCLONE_REMOTE:-gdrive:SolFerme-Backups}"
RCLONE_KEEP_DAYS="${SOLFERME_RCLONE_KEEP_DAYS:-90}"
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

# --- Rotation locale : ne garder que les KEEP_DAYS derniers jours -----------
find "$BACKUP_DIR" -name 'solferme_*.sql.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete \
  | sed 's/^/Supprimé (local, ancien) : /' || true

echo "Sauvegardes locales en stock :"
ls -1t "$BACKUP_DIR"/solferme_*.sql.gz 2>/dev/null | head -20 | sed 's/^/  /'

# --- Copie hors-site vers Google Drive (rclone) — si configuré --------------
REMOTE_NAME="${RCLONE_REMOTE%%:*}"
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx "${REMOTE_NAME}:"; then
  echo "Envoi hors-site -> ${RCLONE_REMOTE}"
  if rclone copy "$OUT" "$RCLONE_REMOTE" --no-traverse --transfers 1 2>&1 | sed 's/^/  /'; then
    # Rotation côté Drive : supprimer les fichiers de plus de RCLONE_KEEP_DAYS jours
    rclone delete "$RCLONE_REMOTE" --min-age "${RCLONE_KEEP_DAYS}d" 2>/dev/null || true
    echo "  Copie hors-site OK (rétention ${RCLONE_KEEP_DAYS} j)."
  else
    echo "AVERTISSEMENT : copie hors-site échouée — la sauvegarde locale, elle, est OK." >&2
  fi
else
  echo "(copie hors-site désactivée : rclone/remote '${REMOTE_NAME}' non configuré — voir le guide § 5)"
fi
