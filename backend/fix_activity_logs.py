#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'farm_management.settings')
django.setup()

from farm_management.models import ActivityLog, Production, Sale

print("=== CORRECTION DES ACTIVITY LOGS ===")

# Corriger les logs de production qui ont un module incorrect
print("\n1. Correction des logs de Production...")
production_logs = ActivityLog.objects.filter(action__icontains='Production').exclude(module='Production')
count = 0
for log in production_logs:
    # Vérifier si c'est vraiment une production via related_id
    if log.related_id:
        if Production.objects.filter(id=log.related_id).exists():
            log.module = 'Production'
            log.save()
            count += 1
            print(f"  - Log ID {log.id}: module corrigé en 'Production'")
print(f"  Total: {count} logs de production corrigés")

# Corriger les logs de vente qui ont un module incorrect
print("\n2. Correction des logs de Vente...")
sale_logs = ActivityLog.objects.filter(action__icontains='Vente').exclude(module='Vente')
count = 0
for log in sale_logs:
    # Vérifier si c'est vraiment une vente via related_id
    if log.related_id:
        if Sale.objects.filter(id=log.related_id).exists():
            log.module = 'Vente'
            log.save()
            count += 1
            print(f"  - Log ID {log.id}: module corrigé en 'Vente'")
print(f"  Total: {count} logs de vente corrigés")

# Vérifier les logs avec des incohérences restantes
print("\n3. Vérification des incohérences restantes...")
incoherent_prod = ActivityLog.objects.filter(action__icontains='Production').exclude(module='Production')
incoherent_vente = ActivityLog.objects.filter(action__icontains='Vente').exclude(module='Vente')

if incoherent_prod.exists():
    print(f"  Attention: {incoherent_prod.count()} logs avec 'Production' dans l'action mais module != 'Production'")
    for log in incoherent_prod:
        print(f"    ID: {log.id}, Module: {log.module}, Action: {log.action}")
else:
    print("  ✓ Aucune incohérence de production détectée")

if incoherent_vente.exists():
    print(f"  Attention: {incoherent_vente.count()} logs avec 'Vente' dans l'action mais module != 'Vente'")
    for log in incoherent_vente:
        print(f"    ID: {log.id}, Module: {log.module}, Action: {log.action}")
else:
    print("  ✓ Aucune incohérence de vente détectée")

print("\n=== CORRECTION TERMINÉE ===")
