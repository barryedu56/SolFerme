#!/bin/sh
# Boucle de sauvegarde : un dump compressé par jour vers 2 h (heure du serveur),
# les plus vieux que KEEP_DAYS jours sont supprimés.
#   Sauvegarde immédiate : docker compose exec backup sh /backup.sh now
set -eu

dump() {
  file="/backups/solferme_$(date +%Y-%m-%d_%H%M).sql.gz"
  if mysqldump -h solferme-db -u "$DB_USER" --no-tablespaces --single-transaction \
       --routines --triggers --default-character-set=utf8mb4 "$DB_NAME" \
       | gzip -9 > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "Sauvegarde OK : $file"
  else
    rm -f "$file.tmp"
    echo "ECHEC de la sauvegarde" >&2
    return 1
  fi
  find /backups -name 'solferme_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
}

if [ "${1:-}" = "now" ]; then
  dump
  exit $?
fi

while true; do
  if [ "$(date +%H)" = "02" ]; then
    dump || true
    sleep 3600
  fi
  sleep 600
done
