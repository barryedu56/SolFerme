#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'farm_management.settings')
django.setup()

from farm_management.models import ActivityLog

# Analyser les logs récents pour identifier les incohérences
logs = ActivityLog.objects.filter(module__in=['Production', 'Vente']).order_by('-date')[:20]

print("=== ANALYSE DES ACTIVITY LOGS ===")
print(f"{'ID':<5} {'Module':<12} {'Action':<25} {'Related_ID':<12} {'Description'}")
print("-" * 100)

for log in logs:
    print(f"{log.id:<5} {log.module:<12} {log.action:<25} {log.related_id or 'N/A':<12} {log.description[:50]}")

# Chercher spécifiquement des logs avec des incohérences possibles
print("\n=== RECHERCHE D'INCOHÉRENCES ===")
print("Logs avec 'Production' dans l'action mais module != 'Production':")
prod_incoherent = ActivityLog.objects.filter(action__icontains='Production').exclude(module='Production')
for log in prod_incoherent:
    print(f"ID: {log.id}, Module: {log.module}, Action: {log.action}")

print("\nLogs avec 'Vente' dans l'action mais module != 'Vente':")
vente_incoherent = ActivityLog.objects.filter(action__icontains='Vente').exclude(module='Vente')
for log in vente_incoherent:
    print(f"ID: {log.id}, Module: {log.module}, Action: {log.action}")
