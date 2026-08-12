import os
import django
import sys
from datetime import date, timedelta
from django.utils import timezone
from django.db import transaction

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_backend.settings')
django.setup()

from farm_management.models import (
    User, Farm, FarmUser, Lot, Production, Sale, Feed, HealthRecord,
    ChickenMovement, Employee, Expense, FeedInventory, PreparedFeedInventory,
    FeedPreparation, FeedPreparationIngredient, HealthInventory, FeedPurchase,
    HealthPurchase, Reminder, ActivityLog, Payroll, Bonus, Task, Attendance,
    EmployeeRequest, HealthAlert
)

def clear_data():
    print("PHASE 1: Nettoyage de la base de données...")
    # Order matters due to foreign keys if not using CASCADE, but here we just delete all.
    # We avoid deleting Users if they are superusers, but the prompt says "vider les anciennes données".
    # Let's delete everything except maybe the structure.

    models_to_clear = [
        ActivityLog, HealthAlert, EmployeeRequest, Attendance, Task, Bonus, Payroll,
        Reminder, HealthPurchase, FeedPurchase, HealthInventory, FeedPreparationIngredient,
        FeedPreparation, PreparedFeedInventory, FeedInventory, Expense, Employee,
        ChickenMovement, HealthRecord, Feed, Sale, Production, Lot, FarmUser, Farm, User
    ]

    for model in models_to_clear:
        model.objects.all().delete()
    print("Nettoyage terminé.")

def create_owner():
    print("PHASE 2: Création compte propriétaire...")
    owner = User.objects.create_user(
        email='owner@test.com',
        password='Test12345@',
        name='Amadou Barry',
        role='PROPRIETAIRE'
    )
    print(f"Propriétaire créé: {owner.email}")
    return owner

def create_farms(owner):
    print("PHASE 3: Création des fermes...")
    farm_alpha = Farm.objects.create(owner=owner, name='Ferme Alpha', location='Conakry')
    lot_alpha1 = Lot.objects.create(
        farm=farm_alpha,
        name='Lot Alpha 1',
        breed='ISA Brown',
        initial_quantity=1000,
        current_quantity=1000,
        purchase_date=date.today() - timedelta(days=60),
        purchase_price=10000000,
        status='ACTIF'
    )

    farm_beta = Farm.objects.create(owner=owner, name='Ferme Beta', location='Kindia')
    lot_beta1 = Lot.objects.create(
        farm=farm_beta,
        name='Lot Beta 1',
        breed='Leghorn',
        initial_quantity=500,
        current_quantity=500,
        purchase_date=date.today() - timedelta(days=30),
        purchase_price=5000000,
        status='ACTIF'
    )
    print("Fermes et lots créés.")
    return lot_alpha1, lot_beta1

def create_alpha_actions(lot, owner):
    print("PHASE 4: Actions complètes Lot Alpha...")

    # Production
    Production.objects.create(lot=lot, date=date.today() - timedelta(days=2), casiers_produits=30, casiers_vendables=29, oeufs_casses=30, created_by=owner)
    Production.objects.create(lot=lot, date=date.today() - timedelta(days=1), casiers_produits=31, casiers_vendables=30, oeufs_casses=30, created_by=owner)

    # Vente
    Sale.objects.create(lot=lot, date=date.today() - timedelta(days=1), product_type='NORMAL', quantity=20, unit_price=50000, total_amount=1000000, amount_paid=1000000, customer_name='Client A', created_by=owner)
    Sale.objects.create(lot=lot, date=date.today(), product_type='BROKEN', quantity=2, unit_price=30000, total_amount=60000, amount_paid=60000, customer_name='Client B', created_by=owner)

    # Alimentation (Achat + Distribution)
    exp_feed = Expense.objects.create(farm=lot.farm, category='ALIMENTATION', description='Achat Maïs', amount=2000000, date=date.today() - timedelta(days=5), created_by=owner)
    FeedPurchase.objects.create(farm=lot.farm, lot=lot, date=date.today() - timedelta(days=5), feed_type='Maïs', quantity_kg=500, total_price=2000000, expense=exp_feed, created_by=owner)
    Feed.objects.create(lot=lot, date=date.today() - timedelta(days=1), feed_type='Mélange Alpha', quantity_kg=50, bags_count=1, cost=200000, created_by=owner)

    # Santé
    HealthRecord.objects.create(lot=lot, type='VACCIN', product_name='Newcastle', quantity=1, unit='Flacon', date=date.today() - timedelta(days=10), cost=150000, created_by=owner)
    HealthRecord.objects.create(lot=lot, type='TRAITEMENT', product_name='Anti-stress', quantity=500, unit='ml', date=date.today() - timedelta(days=5), cost=75000, created_by=owner)

    # Mouvement
    ChickenMovement.objects.create(lot=lot, type='MALADE', quantity=5, date=date.today() - timedelta(days=3), reason='Léthargie', created_by=owner)
    ChickenMovement.objects.create(lot=lot, type='MORT', quantity=2, date=date.today() - timedelta(days=2), reason='Inconnue', created_by=owner)
    lot.current_quantity -= 2
    lot.save()

    # Rappel
    Reminder.objects.create(farm=lot.farm, lot=lot, title='Vaccin Rappel Gumboro', type='VACCIN', date=date.today() + timedelta(days=7), created_by=owner)

    # Tâches
    Task.objects.create(farm=lot.farm, lot=lot, title='Nettoyage poulailler', task_type='ENTRETIEN', due_date=date.today(), priority='HIGH', created_by=owner)
    Task.objects.create(farm=lot.farm, lot=lot, title='Ramassage œufs soir', task_type='PRODUCTION', due_date=date.today(), priority='MEDIUM', created_by=owner)

    # Finance (Autres dépenses)
    Expense.objects.create(farm=lot.farm, category='AUTRE', description='Réparation clôture', amount=300000, date=date.today() - timedelta(days=4), created_by=owner)

def create_stocks(lot_alpha, lot_beta):
    print("PHASE 5: Stock...")
    FeedInventory.objects.create(lot=lot_alpha, feed_type='Maïs', quantity_kg=450)
    FeedInventory.objects.create(lot=lot_alpha, feed_type='Soja', quantity_kg=10) # Stock faible
    FeedInventory.objects.create(lot=lot_alpha, feed_type='Concentré', quantity_kg=0) # Rupture

    HealthInventory.objects.create(lot=lot_alpha, product_name='Newcastle', quantity=2, unit='Flacon')
    HealthInventory.objects.create(lot=lot_alpha, product_name='Vitamines', quantity=0.5, unit='Litre')

def create_employees(owner, farm_alpha):
    print("PHASE 6: Employés...")
    u1 = User.objects.create_user(email='mamadou@test.com', password='Test12345@', name='Mamadou', role='EMPLOYE')
    e1 = Employee.objects.create(user=u1, farm=farm_alpha, position='Ouvrier', salary=750000, hired_at=date.today() - timedelta(days=90))
    e1.lots.add(Farm.objects.get(name='Ferme Alpha').lots.first())

    u2 = User.objects.create_user(email='ibrahima@test.com', password='Test12345@', name='Ibrahima', role='EMPLOYE')
    e2 = Employee.objects.create(user=u2, farm=farm_alpha, position='Gardien', salary=600000, hired_at=date.today() - timedelta(days=60))

    FarmUser.objects.create(farm=farm_alpha, user=u1, role='Worker')
    FarmUser.objects.create(farm=farm_alpha, user=u2, role='Worker')

    return e1, e2

def create_employee_scenarios(employee):
    print("PHASE 7: Scénarios employé...")
    lot = employee.lots.first()
    # Tâche terminée
    Task.objects.create(
        farm=employee.farm, lot=lot, employee=employee, title='Contrôle eau',
        task_type='ENTRETIEN', due_date=date.today() - timedelta(days=1),
        status='COMPLETED', completed_at=timezone.now(), created_by=employee.user
    )

    # Production par employé
    Production.objects.create(lot=lot, date=date.today(), casiers_produits=32, casiers_vendables=32, oeufs_casses=0, created_by=employee.user)

    # Pointage
    Attendance.objects.create(employee=employee, lot=lot, date=date.today(), clock_in='08:00:00', clock_out='17:00:00', status='PRESENT')

    # Demandes
    EmployeeRequest.objects.create(employee=employee, farm=employee.farm, type='CONGE', description='Demande de congé pour Tabaski', status='PENDING')
    EmployeeRequest.objects.create(employee=employee, farm=employee.farm, type='MATERIEL', description='Besoin de nouvelles bottes', status='APPROVED')

def create_payroll_bonuses(employee, owner):
    print("PHASE 8: Paie et Prime...")
    # Prime performance
    Bonus.objects.create(employee=employee, amount=100000, bonus_type='PERFORMANCE', reason='Excellente gestion du lot Alpha', date=date.today() - timedelta(days=5), created_by=owner)
    # Prime annulée
    Bonus.objects.create(employee=employee, amount=50000, bonus_type='AUTRE', reason='Test annulation', date=date.today() - timedelta(days=10), status='ANNULEE', created_by=owner)

    # Paie
    exp_pay = Expense.objects.create(farm=employee.farm, category='HR', description=f'Salaire {employee.user.name}', amount=750000, date=date.today() - timedelta(days=1), created_by=owner)
    Payroll.objects.create(employee=employee, date=date.today() - timedelta(days=1), month='Janvier 2024', base_salary=750000, amount_paid=750000, expense=exp_pay)

def main():
    try:
        with transaction.atomic():
            clear_data()
            owner = create_owner()
            lot_alpha, lot_beta = create_farms(owner)
            create_alpha_actions(lot_alpha, owner)
            create_stocks(lot_alpha, lot_beta)
            e1, e2 = create_employees(owner, lot_alpha.farm)
            create_employee_scenarios(e1)
            create_payroll_bonuses(e1, owner)

            print("\nTOUTES LES PHASES TERMINEES AVEC SUCCES.")

            # Generate MD Deliverable
            with open('SEED_TEST_SOLFERME_V1.md', 'w', encoding='utf-8') as f:
                f.write("# SEED_TEST_SOLFERME_V1\n\n")
                f.write("## COMPTES DE TEST\n")
                f.write("- **Propriétaire** : owner@test.com / Test12345@\n")
                f.write("- **Employé 1** : mamadou@test.com / Test12345@\n")
                f.write("- **Employé 2** : ibrahima@test.com / Test12345@\n\n")
                f.write("## FERMES ET LOTS\n")
                f.write("- **Ferme Alpha** : Lot Alpha 1 (1000 ISA Brown)\n")
                f.write("- **Ferme Beta** : Lot Beta 1 (500 Leghorn)\n\n")
                f.write("## DONNÉES DISPONIBLES\n")
                f.write("- **Production** : 3 entrées sur Lot Alpha 1.\n")
                f.write("- **Ventes** : 2 ventes (Œufs normaux et cassés).\n")
                f.write("- **Stocks** : Maïs (450kg), Soja (10kg - Faible), Concentré (0kg - Rupture).\n")
                f.write("- **HR** : Paie générée pour Mamadou, une prime active, une prime annulée.\n")
                f.write("- **Tâches** : Tâches en cours et terminées.\n")
                f.write("- **Demandes** : 1 en attente, 1 approuvée.\n")
                f.write("- **Santé** : Vaccins et traitements enregistrés.\n")
                f.write("- **Mouvements** : Poules malades et mortes enregistrées.\n")
                f.write("\nBase prête pour tests manuels.")

    except Exception as e:
        print(f"ERREUR : {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
