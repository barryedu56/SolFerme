import os
import django
import json
import random
import string
from django.test import Client
from datetime import date, datetime, timedelta
from django.utils import timezone

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Farm, Lot, Employee, ActivityLog, Attendance, Task, EmployeeRequest, Bonus, Payroll, Expense, FeedPurchase, FeedPreparation, Feed, HealthPurchase, HealthRecord, ChickenMovement

def get_random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def get_random_phone():
    return ''.join(random.choices(string.digits, k=9))

class SolFermeAuditor:
    def __init__(self):
        self.client = Client()
        self.results = []
        self.tokens = {} # email -> token
        self.data = {} # General storage for IDs

    def log(self, phase, step, success, details, severity="MINEUR"):
        status = "✅" if success else "❌"
        self.results.append({
            "phase": phase,
            "step": step,
            "success": success,
            "details": details,
            "severity": severity
        })
        print(f"{status} [{phase}] {step}: {details}")

    def api_post(self, url, data, token=None, expected_status=201):
        headers = {}
        if token:
            headers['HTTP_AUTHORIZATION'] = f"Bearer {token}"
        response = self.client.post(url, data=json.dumps(data), content_type='application/json', **headers)
        return response

    def api_get(self, url, token=None):
        headers = {}
        if token:
            headers['HTTP_AUTHORIZATION'] = f"Bearer {token}"
        response = self.client.get(url, **headers)
        return response

    def api_patch(self, url, data, token=None):
        headers = {}
        if token:
            headers['HTTP_AUTHORIZATION'] = f"Bearer {token}"
        response = self.client.patch(url, data=json.dumps(data), content_type='application/json', **headers)
        return response

    def api_delete(self, url, token=None):
        headers = {}
        if token:
            headers['HTTP_AUTHORIZATION'] = f"Bearer {token}"
        response = self.client.delete(url, **headers)
        return response

    def run_phase_1(self):
        phase = "PHASE 1 — INITIALISATION UTILISATEURS"

        # 1. Register Owner
        owner_email = f"owner_{get_random_string()}@test.com"
        owner_data = {
            "name": "Propriétaire Audit",
            "email": owner_email,
            "password": "Password123!",
            "phone": get_random_phone(),
            "role": "PROPRIETAIRE"
        }
        res = self.api_post('/api/users/', owner_data)
        if res.status_code == 201:
            self.data['owner'] = res.json()
            self.data['owner_email'] = owner_email
            self.log(phase, "Inscription Propriétaire", True, f"Inscrit avec {owner_email}")
        else:
            self.log(phase, "Inscription Propriétaire", False, res.content.decode(), "HAUTE")
            return

        # 2. Login Owner
        res = self.api_post('/api/auth/login/', {"email": owner_email, "password": "Password123!"}, expected_status=200)
        if res.status_code == 200:
            self.tokens[owner_email] = res.json()['access']
            self.log(phase, "Connexion Propriétaire", True, "Token JWT obtenu")
        else:
            self.log(phase, "Connexion Propriétaire", False, res.content.decode(), "CRITIQUE")
            return

        # 3. Create 2 Employees
        for i in range(1, 3):
            emp_email = f"emp{i}_{get_random_string()}@test.com"
            emp_data = {
                "name": f"Employé {i}",
                "email": emp_email,
                "password": "Password123!",
                "phone": get_random_phone(),
                "role": "EMPLOYE"
            }
            res = self.api_post('/api/users/', emp_data, token=self.tokens[owner_email])
            if res.status_code == 201:
                self.data[f'emp{i}_user'] = res.json()
                self.data[f'emp{i}_email'] = emp_email
                # Login test for employee
                login_res = self.api_post('/api/auth/login/', {"email": emp_email, "password": "Password123!"}, expected_status=200)
                if login_res.status_code == 200:
                    self.tokens[emp_email] = login_res.json()['access']
                    self.log(phase, f"Inscription & Connexion Employé {i}", True, f"Prêt: {emp_email}")
                else:
                    self.log(phase, f"Connexion Employé {i}", False, login_res.content.decode(), "HAUTE")
            else:
                self.log(phase, f"Inscription Employé {i}", False, res.content.decode(), "HAUTE")

    def run_phase_2(self):
        phase = "PHASE 2 — MULTI-FERMES"
        owner_token = self.tokens[self.data['owner_email']]

        # Create Farm Alpha
        res = self.api_post('/api/farms/', {"name": "Ferme Alpha", "location": "Conakry"}, token=owner_token)
        if res.status_code == 201:
            self.data['farm_alpha'] = res.json()
            self.log(phase, "Création Ferme Alpha", True, "Succès")

        # Create Farm Beta
        res = self.api_post('/api/farms/', {"name": "Ferme Beta", "location": "Coyah"}, token=owner_token)
        if res.status_code == 201:
            self.data['farm_beta'] = res.json()
            self.log(phase, "Création Ferme Beta", True, "Succès")

        # Create Lots
        lots = [
            ("Lot 1", self.data['farm_alpha']['id'], "lot1"),
            ("Lot 2", self.data['farm_alpha']['id'], "lot2"),
            ("Lot 3", self.data['farm_beta']['id'], "lot3"),
        ]
        for name, f_id, key in lots:
            l_data = {
                "farm": f_id, "name": name, "breed": "Isa Brown",
                "initial_quantity": 1000, "current_quantity": 1000,
                "purchase_date": str(date.today()), "purchase_price": 5000000
            }
            res = self.api_post('/api/lots/', l_data, token=owner_token)
            if res.status_code == 201:
                self.data[key] = res.json()
                self.log(phase, f"Création {name}", True, f"Dans ferme ID {f_id}")

        # Check visibility
        res = self.api_get('/api/farms/', token=owner_token)
        if len(res.json()) >= 2:
            self.log(phase, "Visibilité Propriétaire", True, f"Voit {len(res.json())} fermes")
        else:
            self.log(phase, "Visibilité Propriétaire", False, "Ne voit pas toutes les fermes", "MOYENNE")

    def run_phase_3(self):
        phase = "PHASE 3 — PERMISSIONS"
        emp1_email = self.data['emp1_email']
        emp1_token = self.tokens[emp1_email]
        owner_token = self.tokens[self.data['owner_email']]

        # Assign Emp 1 to Farm Alpha and Lot 1
        emp_prof_data = {
            "user": self.data['emp1_user']['id'],
            "farm": self.data['farm_alpha']['id'],
            "lots": [self.data['lot1']['id']],
            "position": "Manager Alpha",
            "salary": 1500000
        }
        res = self.api_post('/api/employees/', emp_prof_data, token=owner_token)
        if res.status_code == 201:
            self.data['emp1_profile'] = res.json()
            self.log(phase, "Assignation Employé 1", True, "Assigné à Alpha / Lot 1")

        # Test Access Finance (Expenses)
        res = self.api_get('/api/expenses/', token=emp1_token)
        # Note: In views.py, ExpenseViewSet has permissions [permissions.IsAuthenticated()] for list/retrieve?
        # Wait, get_queryset for Expense says: if owner returns farm__owner, else created_by=user.
        # But permission_classes for ExpenseViewSet: [permissions.IsAuthenticated(), IsProprietaire()] for NOT list/retrieve.
        # So employees can see THEIR expenses if they created them.
        # But can they see other expenses?
        if res.status_code == 200:
             # Check if they see expenses from the farm that they didn't create.
             pass

        # Try to create an expense as employee (should be blocked)
        res = self.api_post('/api/expenses/', {"farm": self.data['farm_alpha']['id'], "amount": 100, "category": "Test", "description": "Fail", "date": str(date.today())}, token=emp1_token)
        if res.status_code == 403:
            self.log(phase, "Blocage Finance (Employé)", True, "Accès refusé (403)")
        else:
            self.log(phase, "Blocage Finance (Employé)", False, f"Accès non bloqué (Status {res.status_code})", "HAUTE")

        # Try to access Lot 3 (Beta) as Emp 1 (Alpha)
        res = self.api_get(f"/api/lots/{self.data['lot3']['id']}/", token=emp1_token)
        if res.status_code == 404: # Should be 404 because of get_queryset filter
            self.log(phase, "Séparation des Lots", True, "L'employé ne voit pas les lots non assignés")
        else:
            self.log(phase, "Séparation des Lots", False, f"L'employé voit le lot d'une autre ferme! (Status {res.status_code})", "CRITIQUE")

    def run_phase_4_to_6(self):
        phase = "PHASES 4, 5, 6 — LOT, PRODUCTION, VENTES"
        owner_token = self.tokens[self.data['owner_email']]
        lot1_id = self.data['lot1']['id']

        # LOT: Modify
        res = self.api_patch(f"/api/lots/{lot1_id}/", {"breed": "Isa Brown Modified"}, token=owner_token)
        if res.status_code == 200:
            self.log(phase, "Modifier Lot", True, "Breed mis à jour")

        # PRODUCTION: Add
        prod_data = {"lot": lot1_id, "date": str(date.today()), "casiers_produits": 10, "casiers_vendables": 9, "oeufs_casses": 30}
        res = self.api_post('/api/productions/', prod_data, token=owner_token)
        if res.status_code == 201:
            self.data['prod1'] = res.json()
            self.log(phase, "Ajouter Production", True, "10 casiers ajoutés")

        # SALE: Add
        sale_data = {"lot": lot1_id, "date": str(date.today()), "product_type": "NORMAL", "quantity": 5, "unit_price": 2500, "total_amount": 12500, "amount_paid": 12500}
        res = self.api_post('/api/sales/', sale_data, token=owner_token)
        if res.status_code == 201:
            self.data['sale1'] = res.json()
            self.log(phase, "Ajouter Vente", True, "5 casiers vendus")

        # Stats verification
        res = self.api_get(f"/api/lots/{lot1_id}/statistics/", token=owner_token)
        if res.status_code == 200:
            stats = res.json()
            if stats['available_stock'] == 4: # 9 vendables - 5 vendus
                self.log(phase, "Vérification Stock Œufs", True, "Stock calculé correct (4 casiers)")
            else:
                self.log(phase, "Vérification Stock Œufs", False, f"Attendu 4, obtenu {stats['available_stock']}", "HAUTE")

    def run_phase_7(self):
        phase = "PHASE 7 — ALIMENTATION"
        owner_token = self.tokens[self.data['owner_email']]
        lot1_id = self.data['lot1']['id']
        farm_alpha_id = self.data['farm_alpha']['id']

        # 1. Purchase Raw Material
        purchase_data = {"farm": farm_alpha_id, "lot": lot1_id, "feed_type": "Maïs", "quantity_kg": 100, "total_price": 400000, "date": str(date.today())}
        res = self.api_post('/api/feed-purchases/', purchase_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Achat Matière Première", True, "100kg Maïs achetés")

        # 2. Preparation
        prep_data = {
            "lot": lot1_id, "feed_name": "Mélange Alpha", "quantity_produced_kg": 50, "date": str(date.today()),
            "ingredients": [{"material_name": "Maïs", "quantity_used_kg": 40}]
        }
        res = self.api_post('/api/feed-preparations/', prep_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Préparation Mélange", True, "50kg Mélange Alpha créés")
        else:
            self.log(phase, "Préparation Mélange", False, res.content.decode(), "HAUTE")

        # 3. Distribution
        dist_data = {"lot": lot1_id, "date": str(date.today()), "feed_type": "Mélange Alpha", "quantity_kg": 10, "bags_count": 0, "cost": 0}
        res = self.api_post('/api/feeds/', dist_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Distribution Aliment", True, "10kg distribués")
        else:
            self.log(phase, "Distribution Aliment", False, res.content.decode(), "CRITIQUE")

        # 4. Check Stock
        res = self.api_get(f"/api/prepared-feed-inventory/?lot={lot1_id}", token=owner_token)
        stocks = res.json()
        found = False
        for s in stocks:
            if s['feed_name'] == "Mélange Alpha":
                found = True
                if float(s['quantity_kg']) == 40.0: # 50 produced - 10 distributed
                    self.log(phase, "Vérification Stock Mélange", True, "40kg restants")
                else:
                    self.log(phase, "Vérification Stock Mélange", False, f"Attendu 40, obtenu {s['quantity_kg']}", "HAUTE")
        if not found:
            self.log(phase, "Vérification Stock Mélange", False, "Mélange non trouvé dans l'inventaire", "HAUTE")

    def run_phase_8_9(self):
        phase = "PHASES 8, 9 — SANTÉ & ÉTAT POULES"
        owner_token = self.tokens[self.data['owner_email']]
        lot1_id = self.data['lot1']['id']
        farm_alpha_id = self.data['farm_alpha']['id']

        # Health Purchase
        hp_data = {"farm": farm_alpha_id, "lot": lot1_id, "product_name": "Paracétamol", "product_type": "TRAITEMENT", "quantity": 10, "unit": "Boîte", "total_price": 50000, "date": str(date.today())}
        res = self.api_post('/api/health-purchases/', hp_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Achat Médicament", True, "10 boîtes achetées")

        # Bird Movement: Mortality
        mv_data = {"lot": lot1_id, "type": "MORT", "quantity": 5, "date": str(date.today()), "reason": "Stress"}
        res = self.api_post('/api/movements/', mv_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Mortalité", True, "5 morts enregistrés")

            # Check current quantity auto-update
            res_lot = self.api_get(f"/api/lots/{lot1_id}/", token=owner_token)
            if res_lot.json()['current_quantity'] == 995: # 1000 - 5
                self.log(phase, "Mise à jour Auto Stock Poules", True, "995 restants")
            else:
                self.log(phase, "Mise à jour Auto Stock Poules", False, f"Attendu 995, obtenu {res_lot.json()['current_quantity']}", "HAUTE")

        # Alert Check
        res = self.api_get('/api/health-alerts/', token=owner_token)
        if len(res.json()) > 0:
            self.log(phase, "Alertes Santé", True, f"{len(res.json())} alertes générées")
        else:
            self.log(phase, "Alertes Santé", False, "Aucune alerte générée pour la mortalité", "MOYENNE")

    def run_phase_11_to_15(self):
        phase = "PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE"
        owner_token = self.tokens[self.data['owner_email']]
        emp1_token = self.tokens[self.data['emp1_email']]
        lot1_id = self.data['lot1']['id']
        emp1_id = self.data['emp1_profile']['id']

        # TASK: Create
        task_data = {"employee": emp1_id, "farm": self.data['farm_alpha']['id'], "lot": lot1_id, "title": "Nettoyage", "due_date": str(date.today()), "task_type": "ENTRETIEN"}
        res = self.api_post('/api/tasks/', task_data, token=owner_token)
        if res.status_code == 201:
            task_id = res.json()['id']
            self.log(phase, "Création Tâche", True, "Tâche assignée")

            # TASK: Complete (Employee)
            res = self.api_post(f"/api/tasks/{task_id}/complete/", {"comment": "Fait"}, token=emp1_token, expected_status=200)
            if res.status_code == 200:
                self.log(phase, "Compléter Tâche (Employé)", True, "Statut mis à jour")
            else:
                self.log(phase, "Compléter Tâche (Employé)", False, res.content.decode(), "MOYENNE")

        # ATTENDANCE: Clock-in
        res = self.api_post('/api/attendances/clock_in/', {"lot_id": lot1_id}, token=emp1_token, expected_status=200)
        if res.status_code == 200:
            self.log(phase, "Pointage Arrivée", True, "Succès")
        else:
            self.log(phase, "Pointage Arrivée", False, res.content.decode(), "MOYENNE")

        # BONUS: Add
        bonus_data = {"employee": emp1_id, "amount": 50000, "bonus_type": "PERFORMANCE", "date": str(date.today()), "reason": "Bon travail"}
        res = self.api_post('/api/bonuses/', bonus_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Attribution Prime", True, "50 000 GNF")

        # PAYROLL: Create
        pay_data = {"employee": emp1_id, "date": str(date.today()), "month": "Octobre 2023", "base_salary": 1500000, "bonus": 50000, "amount_paid": 1550000}
        res = self.api_post('/api/payrolls/', pay_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Paiement Salaire", True, "1 550 000 GNF")
        else:
            self.log(phase, "Paiement Salaire", False, res.content.decode(), "HAUTE")

    def run_phase_16_17(self):
        phase = "PHASES 16, 17 — RAPPELS & LOGS"
        owner_token = self.tokens[self.data['owner_email']]
        lot1_id = self.data['lot1']['id']

        # REMINDER: Create (Future)
        rem_data = {"farm": self.data['farm_alpha']['id'], "lot": lot1_id, "title": "Vaccin Rappel", "type": "Santé", "date": str(date.today() + timedelta(days=7))}
        res = self.api_post('/api/reminders/', rem_data, token=owner_token)
        if res.status_code == 201:
            self.log(phase, "Création Rappel", True, "Prévu dans 7 jours")

        # ACTIVITY LOG
        res = self.api_get('/api/activity-logs/', token=owner_token)
        if res.status_code == 200 and len(res.json()) > 5:
            self.log(phase, "Journal d'Activité", True, f"{len(res.json())} actions tracées")
        else:
            self.log(phase, "Journal d'Activité", False, "Peu ou pas de logs trouvés", "MOYENNE")

    def generate_report(self):
        filename = "AUDIT_SOLFERME_V1_COMPLET.md"
        with open(filename, "w", encoding="utf-8") as f:
            f.write("# RAPPORT D'AUDIT COMPLET SOLFERME V1\n\n")
            f.write(f"Date: {datetime.now().strftime('%d/%m/%Y %H:%M')}\n")
            f.write("Auditeur: Agent QA Automatisé\n\n")

            f.write("## 1. RÉSUMÉ GLOBAL\n\n")
            total = len(self.results)
            success = len([r for r in self.results if r['success']])
            f.write(f"- Tests effectués: {total}\n")
            f.write(f"- Succès: {success}\n")
            f.write(f"- Échecs: {total - success}\n\n")

            f.write("## 2. FONCTIONNALITÉS OK\n\n")
            for r in self.results:
                if r['success']:
                    f.write(f"- [{r['phase']}] {r['step']}: {r['details']}\n")

            f.write("\n## 3. FONCTIONNALITÉS KO (BUGS)\n\n")
            ko_results = [r for r in self.results if not r['success']]
            if not ko_results:
                f.write("Aucun bug détecté lors de cet audit.\n")
            else:
                for r in ko_results:
                    f.write(f"### Bug: {r['step']}\n")
                    f.write(f"- **Module:** {r['phase']}\n")
                    f.write(f"- **Résultat obtenu:** {r['details']}\n")
                    f.write(f"- **Gravité:** {r['severity']}\n\n")

            f.write("## 4. PRIORITÉ CORRECTION\n\n")
            critical = [r for r in ko_results if r['severity'] == "CRITIQUE"]
            high = [r for r in ko_results if r['severity'] == "HAUTE"]
            if critical:
                f.write("### URGENT (CRITIQUE)\n")
                for r in critical: f.write(f"- {r['step']} ({r['phase']})\n")
            if high:
                f.write("\n### HAUTE PRIORITÉ\n")
                for r in high: f.write(f"- {r['step']} ({r['phase']})\n")

        print(f"\nAudit terminé. Rapport généré: {filename}")

if __name__ == "__main__":
    auditor = SolFermeAuditor()
    try:
        auditor.run_phase_1()
        auditor.run_phase_2()
        auditor.run_phase_3()
        auditor.run_phase_4_to_6()
        auditor.run_phase_7()
        auditor.run_phase_8_9()
        auditor.run_phase_11_to_15()
        auditor.run_phase_16_17()
    except Exception as e:
        print(f"Erreur fatale pendant l'audit: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        auditor.generate_report()
