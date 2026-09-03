@echo off
REM ============================================================================
REM  SolFerme — Envoi des notifications planifiees (rappels dus + retards).
REM
REM  A planifier dans le Planificateur de taches Windows :
REM   - Declencheur : repeter toutes les 10 minutes, indefiniment.
REM   - Action      : ce fichier .bat.
REM
REM  Necessite : WAMP/MySQL demarre + venv presente.
REM ============================================================================
cd /d "%~dp0.."
call venv\Scripts\activate.bat
python manage.py process_reminders
