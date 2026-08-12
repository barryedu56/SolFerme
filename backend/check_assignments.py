import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Employee, Farm, Lot

print("--- Farm Assignments ---")
for farm in Farm.objects.all():
    print(f"Farm: {farm.name}, Owner: {farm.owner.email}")
    for emp in farm.employees.all():
        print(f"  - Employee: {emp.user.name} ({emp.user.email}), Status: {emp.status}")
    for lot in farm.lots.all():
        print(f"  - Lot: {lot.name}, Qty: {lot.current_quantity}")

print("\n--- Employee Detailed ---")
for emp in Employee.objects.all():
    print(f"Employee: {emp.user.name}")
    print(f"  Farm: {emp.farm.name if emp.farm else 'None'}")
    print(f"  Lots: {[lot.name for lot in emp.lots.all()]}")
