from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Farm, Lot, Employee, Expense

class SecurityVulnerabilityTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='owner@test.com', name='Owner', password='Password123!', role='PROPRIETAIRE')
        self.farm = Farm.objects.create(owner=self.owner, name='Test Farm')

        self.emp_user = User.objects.create_user(email='emp@test.com', name='Employee', password='Password123!', role='EMPLOYE')
        self.employee = Employee.objects.create(
            user=self.emp_user,
            farm=self.farm,
            position='Worker',
            salary=1000,
            hired_at=timezone.now().date()
        )

        self.lot_a = Lot.objects.create(
            farm=self.farm,
            name='Lot A',
            breed='Breed A',
            initial_quantity=100,
            current_quantity=100,
            purchase_date=timezone.now().date(),
            purchase_price=1000,
        )
        self.lot_b = Lot.objects.create(
            farm=self.farm,
            name='Lot B',
            breed='Breed B',
            initial_quantity=100,
            current_quantity=100,
            purchase_date=timezone.now().date(),
            purchase_price=1000,
        )

        self.expense = Expense.objects.create(
            farm=self.farm,
            category='Feed',
            description='Expensive secret feed',
            amount=5000,
            date=timezone.now().date()
        )

        self.client = APIClient()

    def test_employee_cannot_escalate_role(self):
        """Employee should not be able to change their own role."""
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.patch('/api/auth/user/', {'role': 'PROPRIETAIRE'}, format='json')

        self.emp_user.refresh_from_db()
        self.assertEqual(self.emp_user.role, 'EMPLOYE', "VULNERABILITY: Employee escalated their role!")

    def test_employee_cannot_change_salary(self):
        """Employee should not be able to change their own salary."""
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.patch(f'/api/employees/{self.employee.id}/', {'salary': 999999}, format='json')

        self.employee.refresh_from_db()
        self.assertEqual(float(self.employee.salary), 1000.0, "VULNERABILITY: Employee changed their own salary!")

    def test_owner_can_update_employee_lots(self):
        """A proprietor should be able to update an employee's assigned lots."""
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f'/api/employees/{self.employee.id}/',
            {'lots': [self.lot_b.id]},
            format='json'
        )

        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        assigned_lot_ids = list(self.employee.lots.values_list('id', flat=True))
        self.assertEqual(assigned_lot_ids, [self.lot_b.id], "Owner should be able to assign lots to an employee via PATCH")

    def test_employee_access_to_expenses(self):
        """Verify if employees can see raw expense amounts."""
        self.client.force_authenticate(user=self.emp_user)
        response = self.client.get('/api/expenses/')
        self.assertEqual(response.status_code, 200)

        expense_data = response.data if isinstance(response.data, list) else response.data.get('results', [])
        is_visible = any(e['description'] == 'Expensive secret feed' for e in expense_data)

        self.assertFalse(is_visible, "VULNERABILITY: Employee can see expenses created by others!")

        # Create an expense as the employee and verify they CAN see it
        Expense.objects.create(
            farm=self.farm,
            category='Tools',
            description='Shovel',
            amount=50,
            date=timezone.now().date(),
            created_by=self.emp_user
        )
        response = self.client.get('/api/expenses/')
        expense_data = response.data if isinstance(response.data, list) else response.data.get('results', [])
        self.assertTrue(any(e['description'] == 'Shovel' for e in expense_data))
