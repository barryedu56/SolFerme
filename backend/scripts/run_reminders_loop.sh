#!/bin/bash
# ============================================================================
#  SolFerme — Traitement des rappels (notifications push + marquage retard).
#
#  Équivalent Linux de run_notifications.bat, pensé pour une tâche
#  « Always-on » PythonAnywhere (plan Hacker : 1 tâche always-on incluse).
#
#  Onglet « Tasks » → « Always-on tasks » → commande :
#     bash /home/VOTRE_USER/SolFerme/backend/scripts/run_reminders_loop.sh
#
#  Hypothèses (adaptez si vos noms diffèrent) :
#   - virtualenv nommé « solferme »  ->  ~/.virtualenvs/solferme
#   - dépôt cloné dans               ->  ~/SolFerme
#
#  Alternative sans always-on : une tâche planifiée HORAIRE qui lance
#  simplement « python manage.py process_reminders » (granularité 1 h).
# ============================================================================
set -u

VENV="${SOLFERME_VENV:-$HOME/.virtualenvs/solferme}"
PROJECT_DIR="${SOLFERME_DIR:-$HOME/SolFerme/backend}"
INTERVAL="${SOLFERME_INTERVAL:-600}"   # secondes entre deux passages (10 min)

source "$VENV/bin/activate"
cd "$PROJECT_DIR" || exit 1

while true; do
    python manage.py process_reminders
    sleep "$INTERVAL"
done
