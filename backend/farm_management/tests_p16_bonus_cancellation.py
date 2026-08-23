"""Test P1.6 : Vérifier l'annulation correcte des Bonus vers Expense."""
from django.test import TestCase
from django.utils import timezone
from .models import User, Farm, Employee, Bonus, Expense


class BonusCancellationTestCase(TestCase):
    """P1.6 : Vérifier que l'annulation d'une Bonus annule aussi son Expense."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='owner@example.com', name='Owner', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm', capacity=1000)
        
        # Employee
        emp_user = User.objects.create_user(
            email='emp@example.com', name='Employee', password='Abc123!@#', role='EMPLOYE'
        )
        self.employee = Employee.objects.create(
            user=emp_user, farm=self.farm, position='Worker', salary=5000
        )

    def test_bonus_cancellation_cascades_to_expense(self):
        """Vérifier que l'annulation d'une Bonus annule aussi son Expense."""
        # 1. Créer une Bonus
        bonus = Bonus.objects.create(
            employee=self.employee,
            date=timezone.now().date(),
            bonus_type='PERFORMANCE',
            amount=1000,
            status='ACTIVE'
        )

        # 2. Vérifier que l'Expense a été créée
        expenses = Expense.objects.filter(farm=self.farm, category='PRIME', status='ACTIVE')
        self.assertEqual(expenses.count(), 1, "Une Bonus doit créer une Expense")
        expense = expenses.first()
        self.assertEqual(float(expense.amount), 1000.0)

        # 3. Annuler la Bonus
        bonus.status = 'ANNULEE'
        bonus.save()

        # 4. Vérifier que l'Expense est aussi annulée
        expense.refresh_from_db()
        self.assertEqual(
            expense.status, 'ANNULEE',
            "Annuler une Bonus doit annuler son Expense associé"
        )

    def test_multiple_bonus_same_employee_independent_cancellation(self):
        """Vérifier que l'annulation d'une Bonus n'annule pas les autres."""
        # 1. Créer deux Bonus du même employé avec le même montant ET MÊME DATE (collision risk)
        today = timezone.now().date()
        bonus1 = Bonus.objects.create(
            employee=self.employee,
            date=today,
            bonus_type='PERFORMANCE',
            amount=1000,
            status='ACTIVE'
        )
        bonus2 = Bonus.objects.create(
            employee=self.employee,
            date=today,
            bonus_type='EXCEPTIONNEL',
            amount=1000,
            status='ACTIVE'
        )

        # 2. Vérifier que deux Expenses ont été créées
        expenses = Expense.objects.filter(farm=self.farm, category='PRIME', status='ACTIVE')
        self.assertEqual(expenses.count(), 2, "Deux Bonus doivent créer deux Expense")

        # 3. Annuler la première Bonus
        bonus1.status = 'ANNULEE'
        bonus1.save()

        # 4. Vérifier que SEULEMENT la première Expense est annulée
        active_expenses = Expense.objects.filter(farm=self.farm, category='PRIME', status='ACTIVE')
        self.assertEqual(
            active_expenses.count(), 1,
            "Après annulation d'une Bonus, une seule Expense doit rester ACTIVE"
        )
        
        # Vérifier que c'est bien la deuxième
        remaining = active_expenses.first()
        self.assertEqual(float(remaining.amount), 1000.0)
        
        # Vérifier que la première est bien ANNULEE
        annuled_expenses = Expense.objects.filter(farm=self.farm, category='PRIME', status='ANNULEE')
        self.assertEqual(annuled_expenses.count(), 1)
