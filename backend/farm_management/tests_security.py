from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Farm, Lot, Employee, ActivityLog

class SecurityIsolationTestCase(TestCase):
    def setUp(self):
        # 1. Create Proprietaire
        self.owner = User.objects.create_user(email='owner@test.com', name='Owner', password='password', role='PROPRIETAIRE')
        self.farm = Farm.objects.create(owner=self.owner, name='Big Farm')

        # 2. Create two Lots
        self.lot_a = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='Breed A', initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000
        )
        self.lot_b = Lot.objects.create(
            farm=self.farm, name='Lot B', breed='Breed B', initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000
        )

        # 3. Create an Employee assigned only to Lot A
        self.emp_user = User.objects.create_user(email='emp@test.com', name='Employee', password='password', role='EMPLOYE')
        self.employee = Employee.objects.create(user=self.emp_user, farm=self.farm, position='Worker', salary=1000)
        self.employee.lots.add(self.lot_a)

        # 4. Create some logs
        ActivityLog.objects.create(user=self.owner, farm=self.farm, lot=self.lot_a, action="Action A", module="Test", description="Log for A")
        ActivityLog.objects.create(user=self.owner, farm=self.farm, lot=self.lot_b, action="Action B", module="Test", description="Log for B")
        ActivityLog.objects.create(user=self.owner, farm=self.farm, action="Action Farm", module="Test", description="Global farm log")

        self.client = APIClient()

    def test_employee_isolation_activity_logs(self):
        self.client.force_authenticate(user=self.emp_user)

        # Request all logs
        response = self.client.get('/api/activity-logs/')
        self.assertEqual(response.status_code, 200)

        # Should see Log for A and Global Farm log, but NOT Log for B
        # Updated for potential paginated response or list response
        if isinstance(response.data, dict) and 'results' in response.data:
            results = response.data['results']
        else:
            results = response.data

        log_descriptions = [log['description'] for log in results]
        self.assertIn("Log for A", log_descriptions)
        self.assertIn("Global farm log", log_descriptions)
        self.assertNotIn("Log for B", log_descriptions)

        # Try to explicitly filter for Lot B
        response_b = self.client.get(f'/api/activity-logs/?lot={self.lot_b.id}')
        if isinstance(response_b.data, dict) and 'results' in response_b.data:
            results_b = response_b.data['results']
        else:
            results_b = response_b.data
        self.assertEqual(len(results_b), 0)

    def test_employee_isolation_statistics(self):
        self.client.force_authenticate(user=self.emp_user)

        # 1. Global stats should only count Lot A
        response_global = self.client.get('/api/farms/statistics/')
        self.assertEqual(response_global.status_code, 200)
        # Updated for 'summary' key and statistics structure
        summary = response_global.data.get('summary', {})
        self.assertEqual(summary.get('lots_count'), 1)
        self.assertEqual(summary.get('initial_birds'), 100) # Only Lot A

        # 2. Request stats for Lot B (which he shouldn't see)
        response_b = self.client.get(f'/api/farms/statistics/?lot={self.lot_b.id}')
        self.assertEqual(response_b.status_code, 200)
        # lots_count should be 0 because Lot B is filtered out for this employee
        summary_b = response_b.data.get('summary', {})
        self.assertEqual(summary_b.get('lots_count'), 0)
        self.assertEqual(summary_b.get('initial_birds'), 0)

    def test_unauthorized_farm_access(self):
        # Create another farm and user
        other_owner = User.objects.create_user(email='other@test.com', name='Other', password='password')
        other_farm = Farm.objects.create(owner=other_owner, name='Other Farm')
        other_lot = Lot.objects.create(farm=other_farm, name='Other Lot', breed='X', initial_quantity=10, current_quantity=10, purchase_date=timezone.now().date(), purchase_price=10)

        self.client.force_authenticate(user=self.emp_user)

        # Try to access other farm's stats
        response = self.client.get(f'/api/farms/statistics/?farm={other_farm.id}')
        self.assertEqual(response.status_code, 200)
        summary = response.data.get('summary', {})
        # Depending on implementation, it might return 403 or empty stats.
        # Looking at views.py, it filters farms. If farm=other_id is not in user's farms, farms queryset is empty.
        # Thus summary will have 0 counts.
        self.assertEqual(summary.get('farms_count', 0), 0)
