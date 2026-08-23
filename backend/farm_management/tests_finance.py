"""Tests du flux financier (Expense, FeedPurchase, HealthPurchase, Payroll).

Couvre les règles métier de la comptabilité :
  - Pas de double comptage (une opération = une Expense);
  - Annulation d'une opération = annulation de l'Expense lié;
  - Isolation des opérations par ferme.
"""
from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from .models import User, Farm, Lot, Expense, FeedPurchase, HealthPurchase, Payroll, Production


class FinanceDoubleCountingTestCase(TestCase):
    """Vérifie qu'il n'existe pas de double comptage d'Expense."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='owner@example.com', name='Owner', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm', capacity=1000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='ISA Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=10000,
        )

    def test_feed_purchase_creates_single_expense(self):
        """Vérifier qu'un achat d'aliment crée une seule Expense."""
        expense_count_before = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        
        feed_purchase = FeedPurchase.objects.create(
            farm=self.farm, lot=self.lot, feed_type='Standard', quantity_kg=100,
            date=timezone.now().date(), total_price=1000, status='ACTIVE', supplier='S1',
            created_by=self.user
        )
        
        expense_count_after = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        self.assertEqual(expense_count_after, expense_count_before + 1, 
                        "Un achat d'aliment doit créer exactement une Expense.")
        
        # Vérifier que l'Expense est lié à la FeedPurchase
        feed_purchase.refresh_from_db()
        self.assertIsNotNone(feed_purchase.expense)
        self.assertEqual(float(feed_purchase.expense.amount), 1000.0)

    def test_feed_purchase_cancellation_cancels_expense(self):
        """Vérifier que l'annulation d'un achat annule l'Expense."""
        feed_purchase = FeedPurchase.objects.create(
            farm=self.farm, lot=self.lot, feed_type='Standard', quantity_kg=100,
            date=timezone.now().date(), total_price=1000, status='ACTIVE', supplier='S1',
            created_by=self.user
        )
        feed_purchase.refresh_from_db()
        expense_id = feed_purchase.expense.id
        
        # Annuler l'achat
        feed_purchase.status = 'ANNULEE'
        feed_purchase.save()
        
        # Vérifier que l'Expense est aussi annulée
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ANNULEE', 
                        "Annuler un achat d'aliment doit annuler l'Expense lié.")

    def test_health_purchase_creates_single_expense(self):
        """Vérifier qu'un achat de santé crée une seule Expense."""
        expense_count_before = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        
        health_purchase = HealthPurchase.objects.create(
            farm=self.farm, lot=self.lot, product_name='Antibiotique', quantity=10,
            date=timezone.now().date(), total_price=500, status='ACTIVE', supplier='S2',
            created_by=self.user
        )
        
        expense_count_after = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        self.assertEqual(expense_count_after, expense_count_before + 1,
                        "Un achat de santé doit créer exactement une Expense.")

    def test_health_purchase_cancellation_cancels_expense(self):
        """Vérifier que l'annulation d'un achat de santé annule l'Expense."""
        health_purchase = HealthPurchase.objects.create(
            farm=self.farm, lot=self.lot, product_name='Antibiotique', quantity=10,
            date=timezone.now().date(), total_price=500, status='ACTIVE', supplier='S2',
            created_by=self.user
        )
        health_purchase.refresh_from_db()
        expense_id = health_purchase.expense.id
        
        # Annuler l'achat
        health_purchase.status = 'ANNULEE'
        health_purchase.save()
        
        # Vérifier que l'Expense est aussi annulée
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ANNULEE',
                        "Annuler un achat de santé doit annuler l'Expense lié.")

    def test_payroll_creates_single_expense(self):
        """Vérifier qu'une paie crée une seule Expense."""
        from .models import Employee
        emp_user = User.objects.create_user(
            email='emp@example.com', name='Employee', password='Abc123!@#', role='EMPLOYE'
        )
        emp = Employee.objects.create(user=emp_user, farm=self.farm, position='Worker', salary=5000)
        
        expense_count_before = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        
        payroll = Payroll.objects.create(
            employee=emp, date=timezone.now().date(), month='2026-02',
            base_salary=5000, amount_paid=5000, status='ACTIVE'
        )
        
        expense_count_after = Expense.objects.filter(farm=self.farm, status='ACTIVE').count()
        self.assertEqual(expense_count_after, expense_count_before + 1,
                        "Une paie doit créer exactement une Expense.")

    def test_payroll_cancellation_cancels_expense(self):
        """Vérifier que l'annulation d'une paie annule l'Expense."""
        from .models import Employee
        emp_user = User.objects.create_user(
            email='emp@example.com', name='Employee', password='Abc123!@#', role='EMPLOYE'
        )
        emp = Employee.objects.create(user=emp_user, farm=self.farm, position='Worker', salary=5000)
        
        payroll = Payroll.objects.create(
            employee=emp, date=timezone.now().date(), month='2026-02',
            base_salary=5000, amount_paid=5000, status='ACTIVE'
        )
        payroll.refresh_from_db()
        expense_id = payroll.expense.id
        
        # Annuler la paie
        payroll.status = 'ANNULEE'
        payroll.save()
        
        # Vérifier que l'Expense est aussi annulée
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ANNULEE',
                        "Annuler une paie doit annuler l'Expense lié.")

    def test_multiple_active_expenses_not_counted_twice(self):
        """Vérifier que plusieurs achats = plusieurs Expense (pas de double comptage)."""
        feed1 = FeedPurchase.objects.create(
            farm=self.farm, lot=self.lot, feed_type='Standard', quantity_kg=100,
            date=timezone.now().date(), total_price=1000, status='ACTIVE', supplier='S1',
            created_by=self.user
        )
        feed2 = FeedPurchase.objects.create(
            farm=self.farm, lot=self.lot, feed_type='Premium', quantity_kg=50,
            date=timezone.now().date(), total_price=800, status='ACTIVE', supplier='S1',
            created_by=self.user
        )
        
        # Vérifier les deux Expense ACTIVE
        active_expenses = Expense.objects.filter(status='ACTIVE', farm=self.farm)
        expense_total = active_expenses.aggregate(t=Sum('amount'))['t'] or 0
        
        self.assertEqual(float(expense_total), 1800.0, "Total Expense ACTIVE = 1000 + 800")
        
        # Annuler le premier achat
        feed1.status = 'ANNULEE'
        feed1.save()
        
        # Vérifier que seul le second achat est ACTIVE
        active_expenses = Expense.objects.filter(status='ACTIVE', farm=self.farm)
        expense_total = active_expenses.aggregate(t=Sum('amount'))['t'] or 0
        self.assertEqual(float(expense_total), 800.0, "Après annulation du premier, total = 800")
