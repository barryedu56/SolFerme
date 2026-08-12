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

        self.expense = Expense.objects.create(
            farm=self.farm,
            category='Feed',
            description='Expensive secret feed',
            amount=5000,
            date=timezone.now().date()
        )

        self.client = APIClient()

    def test_employee_can_escalate_role(self):
        """Test if an employee can change their own role to PROPRIETAIRE."""
        self.client.force_authenticate(user=self.emp_user)

        # Verify initial role
        self.assertEqual(self.emp_user.role, 'EMPLOYE')

        # Attempt to escalate role via UserInfoView (which uses UserSerializer)
        response = self.client.patch('/api/user/info/', {'role': 'PROPRIETAIRE'}, format='json')

        # If this succeeds (200 OK) and the role changes, it's a vulnerability
        if response.status_code == 200:
            self.emp_user.refresh_from_db()
            self.assertEqual(self.emp_user.role, 'PROPRIETAIRE', "Employee was able to escalate their role!")

    def test_employee_can_change_salary(self):
        """Test if an employee can change their own salary."""
        self.client.force_authenticate(user=self.emp_user)

        # Verify initial salary
        self.assertEqual(float(self.employee.salary), 1000.0)

        # Attempt to change salary via EmployeeViewSet
        response = self.client.patch(f'/api/employees/{self.employee.id}/', {'salary': 999999}, format='json')

        if response.status_code == 200:
            self.employee.refresh_from_db()
            self.assertEqual(float(self.employee.salary), 999999.0, "Employee was able to change their own salary!")

    def test_employee_sees_raw_expenses(self):
        """Verify if employees can see raw expense amounts and descriptions."""
        self.client.force_authenticate(user=self.emp_user)

        response = self.client.get('/api/expenses/')
        self.assertEqual(response.status_code, 200)

        # Check if the expensive secret feed is visible
        expense_data = response.data['results']
        self.assertTrue(any(e['description'] == 'Expensive secret feed' for e in expense_data))
        self.assertTrue(any(float(e['amount']) == 5000.0 for e in expense_data))
