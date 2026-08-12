import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Employee

print("--- Users ---")
for user in User.objects.all():
    print(f"ID: {user.id}, Email: {user.email}, Role: {user.role}, Is Active: {user.is_active}")

print("\n--- Employees ---")
for emp in Employee.objects.all():
    print(f"ID: {emp.id}, Name: {emp.user.name}, Status: {emp.status}, User Active: {emp.user.is_active}")
