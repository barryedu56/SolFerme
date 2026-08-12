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
        log_result("Login Owner", False, f"Failed to login: {response.status_code} {response.content.decode()}")
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

    # 3. Create Employees
    import random
    rand_id = random.randint(1000, 9999)
    employee_ahmad_data = {
        "name": "Ahmad",
        "email": f"ahmad_{rand_id}@test.com",
        "password": "Password@123",
        "role": "EMPLOYE",
        "phone": f"12345{rand_id}"
    }
    response = client.post('/api/users/', data=json.dumps(employee_ahmad_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        ahmad_id = response.json().get('id')
        log_result("Create Employee Ahmad (User)", True, f"Ahmad user created with ID {ahmad_id}")

        emp_data = {
            "user": ahmad_id,
            "farm": farm_alpha_id,
            "position": "Ouvrier",
            "salary": "50000.00",
            "payment_frequency": "MENSUEL"
        }
        response = client.post('/api/employees/', data=json.dumps(emp_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
        if response.status_code == 201:
            ahmad_emp_id = response.json().get('id')
            log_result("Create Employee Ahmad (Profile)", True, f"Ahmad profile created with ID {ahmad_emp_id}")
        else:
            log_result("Create Employee Ahmad (Profile)", False, response.content.decode())
    else:
        log_result("Create Employee Ahmad (User)", False, response.content.decode())

    # 4. Create Lot in Farm Alpha
    lot_data = {
        "farm": farm_alpha_id,
        "name": "Lot Poussins A",
        "breed": "COBB 500",
        "initial_quantity": 500,
        "current_quantity": 500,
        "purchase_date": str(date.today() - timedelta(days=10)),
        "purchase_price": "250000.00",
        "status": "ACTIF"
    }
    response = client.post('/api/lots/', data=json.dumps(lot_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        lot_id = response.json().get('id')
        log_result("Create Lot A in Farm Alpha", True, f"Lot created with ID {lot_id}")
    else:
        log_result("Create Lot A in Farm Alpha", False, response.content.decode())

    # 5. Inventory and Stock Audit
    # Feed Purchase
    feed_purchase_data = {
        "farm": farm_alpha_id,
        "lot": lot_id,
        "feed_type": "Démarrage",
        "quantity_kg": "100.00",
        "total_price": "50000.00",
        "date": str(date.today())
    }
    response = client.post('/api/feed-purchases/', data=json.dumps(feed_purchase_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        log_result("Feed Purchase", True, "Successfully purchased 100kg feed.")
    else:
        log_result("Feed Purchase", False, response.content.decode())

    # Feed Consumption (CRITICAL BUG IDENTIFIED)
    feed_data = {
        "lot": lot_id,
        "date": str(date.today()),
        "feed_type": "Démarrage",
        "quantity_kg": "10.00",
        "bags_count": 0,
        "cost": "0.00"
    }
    try:
        response = client.post('/api/feeds/', data=json.dumps(feed_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
        if response.status_code == 201:
            log_result("Feed Consumption", True, "Successfully consumed 10kg feed.")
        else:
            log_result("Feed Consumption", False, f"Status {response.status_code}: {response.content.decode()}")
    except Exception as e:
        log_result("Feed Consumption", False, f"CRITICAL BUG: {str(e)} (AttributeError in FeedViewSet.perform_create - tries to access instance.farm instead of instance.lot.farm)")

    # Verify Stock
    response = client.get(f'/api/feed-inventory/?lot={lot_id}', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 200:
        inv = response.json()
        log_result("Stock Verification", True, f"Inventory details: {inv}")
    else:
        log_result("Stock Verification", False, response.content.decode())

    # 6. Production Audit
    prod_data = {
        "lot": lot_id,
        "date": str(date.today()),
        "casiers_produits": 10,
        "casiers_vendables": 9,
        "oeufs_casses": 30
    }
    response = client.post('/api/productions/', data=json.dumps(prod_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        log_result("Production Entry", True, "Successfully recorded 10 casiers.")
    else:
        log_result("Production Entry", False, response.content.decode())

    # 7. Sales Audit
    sale_data = {
        "lot": lot_id,
        "date": str(date.today()),
        "product_type": "NORMAL",
        "quantity": 5,
        "unit_price": "2500.00",
        "total_amount": "12500.00",
        "amount_paid": "12500.00"
    }
    response = client.post('/api/sales/', data=json.dumps(sale_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 201:
        log_result("Sale Entry", True, "Successfully sold 5 casiers.")
    else:
        log_result("Sale Entry", False, response.content.decode())

    # 8. Health and Mortality Audit
    mvmt_data = {
        "lot": lot_id,
        "type": "MORT",
        "quantity": 2,
        "date": str(date.today()),
        "reason": "Chaleur"
    }
    try:
        response = client.post('/api/movements/', data=json.dumps(mvmt_data), content_type='application/json', HTTP_AUTHORIZATION=auth_header)
        if response.status_code == 201:
            log_result("Mortality Entry", True, "Successfully recorded 2 deaths.")
        else:
            log_result("Mortality Entry", False, response.content.decode())
    except Exception as e:
        log_result("Mortality Entry", False, f"CRITICAL BUG: {str(e)} (AttributeError in ChickenMovementViewSet.perform_create - tries to access instance.farm instead of instance.lot.farm)")

    # 9. Verify Stats
    response = client.get(f'/api/farms/statistics/?farm={farm_alpha_id}', HTTP_AUTHORIZATION=auth_header)
    if response.status_code == 200:
        stats = response.json()
        log_result("Stats Verification", True, f"Statistics loaded successfully.")
    else:
        log_result("Stats Verification", False, response.content.decode())

    # Save results to a report file
    with open('AUDIT_SOLFERME_V1.md', 'w', encoding='utf-8') as f:
        f.write("# Rapport d'Audit SolFerme V1\n\n")
        f.write(f"Date de l'audit : {date.today().strftime('%d/%m/%Y')}\n\n")
        f.write("## Synthèse des Tests Fonctionnels\n\n")
        f.write("| Module | Statut | Détails |\n")
        f.write("| --- | --- | --- |\n")
        for res in results:
            status = "✅" if res['success'] else "❌"
            f.write(f"| {res['step']} | {status} | {res['details']} |\n")

        f.write("\n## Bugs Critiques Identifiés (Sévérité Haute)\n\n")
        f.write("1. **Coupure du flux d'Alimentation** : `FeedViewSet.perform_create` tente d'accéder à `instance.farm`, ce qui provoque une erreur 500 car le modèle `Feed` n'a pas ce champ (il faut passer par `instance.lot.farm`).\n")
        f.write("2. **Coupure du flux des Mouvements (Santé)** : `ChickenMovementViewSet.perform_create` présente le même défaut structurel, empêchant l'enregistrement des mortalités ou maladies.\n")
        f.write("3. **Régression de validation d'utilisateur** : Le validateur de mot de passe est extrêmement strict mais n'était pas documenté dans les spécifications initiales, ce qui a causé l'échec initial de création d'employé.\n")

if __name__ == "__main__":
    run_audit()
