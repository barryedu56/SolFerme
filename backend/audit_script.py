import os
import django
from django.test import Client
import json
from datetime import date, timedelta

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Farm, Lot, Employee, FeedInventory, HealthInventory

def run_audit():
    client = Client()
    results = []

    def log_result(step, success, details):
        results.append({
            "step": step,
            "success": success,
            "details": details
        })
        print(f"{'[OK]' if success else '[FAIL]'} {step}")

    # 1. Login Test
    login_data = {
        "email": "owner@test.com",
        "password": "Test123456"
    }
    response = client.post('/api/auth/login/', data=json.dumps(login_data), content_type='application/json')
    if response.status_code == 200:
        token = response.json().get('access')
        auth_header = f"Bearer {token}"
        log_result("Login Owner", True, "Successfully logged in and received JWT.")
    else:
        log_result("Login Owner", False, f"Failed to login: {response.status_code} {response.content}")
        return

    # 2. Create Farms
    farm_alpha_data = {"name": "Ferme Alpha", "location": "Zone A"}
    response = client.post('/api/farms/', data=json.dumps(farm_alpha_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        farm_alpha_id = response.json().get('id')
        log_result("Create Farm Alpha", True, f"Farm Alpha created with ID {farm_alpha_id}")
    else:
        log_result("Create Farm Alpha", False, response.content.decode())
        return

    farm_beta_data = {"name": "Ferme Beta", "location": "Zone B"}
    response = client.post('/api/farms/', data=json.dumps(farm_beta_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        farm_beta_id = response.json().get('id')
        log_result("Create Farm Beta", True, f"Farm Beta created with ID {farm_beta_id}")
    else:
        log_result("Create Farm Beta", False, response.content.decode())
        return

    # 3. Create Employees
    employee_ahmad_data = {
        "name": "Ahmad",
        "email": "ahmad@test.com",
        "password": "Password123",
        "role": "EMPLOYE",
        "phone": "123456789"
    }
    response = client.post('/api/users/', data=json.dumps(employee_ahmad_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        ahmad_id = response.json().get('id')
        log_result("Create Employee Ahmad", True, f"Ahmad created with ID {ahmad_id}")

        # Create Employee profile (usually handled by signals or manual step if not automatic)
        # Checking if employee record is needed
        emp_data = {"user": ahmad_id, "position": "Ouvrier"}
        response = client.post('/api/employees/', data=json.dumps(emp_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
        ahmad_emp_id = response.json().get('id')
    else:
        log_result("Create Employee Ahmad", False, response.content.decode())

    # 4. Create Lot in Farm Alpha
    lot_data = {
        "farm": farm_alpha_id,
        "name": "Lot Poussins A",
        "species": "POULET_CHAIR",
        "initial_quantity": 500,
        "birth_date": str(date.today() - timedelta(days=10)),
        "status": "ACTIF"
    }
    response = client.post('/api/lots/', data=json.dumps(lot_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        lot_id = response.json().get('id')
        log_result("Create Lot A in Farm Alpha", True, f"Lot created with ID {lot_id}")
    else:
        log_result("Create Lot A in Farm Alpha", False, response.content.decode())

    # Save results to a report file
    with open('AUDIT_SOLFERME_V1.md', 'w', encoding='utf-8') as f:
        f.write("# Rapport d'Audit SolFerme V1\n\n")
        for res in results:
            status = "✅" if res['success'] else "❌"
            f.write(f"## {status} {res['step']}\n")
            f.write(f"{res['details']}\n\n")

if __name__ == "__main__":
    run_audit()
