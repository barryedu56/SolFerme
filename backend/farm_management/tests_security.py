from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Farm, Lot, Employee, ActivityLog


class SecurityIsolationTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@test.com', name='Owner', password='password', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Big Farm')

        self.lot_a = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='Breed A', initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000
        )
        self.lot_b = Lot.objects.create(
            farm=self.farm, name='Lot B', breed='Breed B', initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000
        )

        self.emp_user = User.objects.create_user(
            email='emp@test.com', name='Employee', password='password', role='EMPLOYE'
        )
        self.employee = Employee.objects.create(
            user=self.emp_user, farm=self.farm, position='Worker', salary=1000
        )
        self.employee.lots.add(self.lot_a)

        ActivityLog.objects.create(
            user=self.owner, farm=self.farm, lot=self.lot_a, action='Action A', module='Test', description='Log for A'
        )
        ActivityLog.objects.create(
            user=self.owner, farm=self.farm, lot=self.lot_b, action='Action B', module='Test', description='Log for B'
        )
        ActivityLog.objects.create(
            user=self.owner, farm=self.farm, action='Action Farm', module='Test', description='Global farm log'
        )

        self.client = APIClient()

    def test_farm_capacity_cannot_be_reduced_below_current_occupancy(self):
        self.farm.capacity = 100
        self.farm.save()
        self.lot_a.status = 'ACTIF'
        self.lot_a.save()

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(f'/api/farms/{self.farm.id}/', {'capacity': 60}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_reactivate_lot_cannot_exceed_farm_capacity(self):
        self.farm.capacity = 90
        self.farm.save()
        self.lot_a.status = 'ACTIF'
        self.lot_a.save()
        archived_lot = Lot.objects.create(
            farm=self.farm, name='Lot archive', breed='Breed B', initial_quantity=40, current_quantity=40,
            purchase_date=timezone.now().date(), purchase_price=1000, status='ARCHIVE'
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(f'/api/lots/{archived_lot.id}/reactivate/')
        self.assertEqual(response.status_code, 400, response.data)

    def test_employee_cannot_be_assigned_cross_farm_lot(self):
        other_owner = User.objects.create_user(email='other@test.com', name='Other', password='password', role='PROPRIETAIRE')
        other_farm = Farm.objects.create(owner=other_owner, name='Other Farm')
        foreign_lot = Lot.objects.create(
            farm=other_farm, name='Other Lot', breed='Breed X', initial_quantity=10, current_quantity=10,
            purchase_date=timezone.now().date(), purchase_price=200
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f'/api/employees/{self.employee.id}/', {'lots': [foreign_lot.id]}, format='json'
        )
        self.assertEqual(response.status_code, 400, response.data)

    def test_historical_entity_destroy_is_blocked(self):
        req = self.employee.requests.create(
            farm=self.farm, type='MATERIEL', description='Besoin de matériel', status='PENDING'
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f'/api/employee-requests/{req.id}/')
        self.assertIn(response.status_code, [400, 403], response.data)

    def test_employee_request_cannot_be_decided_twice(self):
        req = self.employee.requests.create(
            farm=self.farm, type='MATERIEL', description='Besoin de matériel', status='PENDING'
        )

        self.client.force_authenticate(user=self.owner)
        first = self.client.post(f'/api/employee-requests/{req.id}/approve/')
        self.assertEqual(first.status_code, 200, first.data)

        second = self.client.post(f'/api/employee-requests/{req.id}/approve/')
        self.assertEqual(second.status_code, 400, second.data)
        self.assertIn('déjà', str(second.data).lower())

    def test_employee_isolation_activity_logs(self):
        self.client.force_authenticate(user=self.emp_user)

        response = self.client.get('/api/activity-logs/')
        self.assertEqual(response.status_code, 200)

        if isinstance(response.data, dict) and 'results' in response.data:
            results = response.data['results']
        else:
            results = response.data

        log_descriptions = [log['description'] for log in results]
        self.assertIn('Log for A', log_descriptions)
        self.assertIn('Global farm log', log_descriptions)
        self.assertNotIn('Log for B', log_descriptions)

        response_b = self.client.get(f'/api/activity-logs/?lot={self.lot_b.id}')
        if isinstance(response_b.data, dict) and 'results' in response_b.data:
            results_b = response_b.data['results']
        else:
            results_b = response_b.data
        self.assertEqual(len(results_b), 0)

    def test_employee_isolation_statistics(self):
        self.client.force_authenticate(user=self.emp_user)

        response_global = self.client.get('/api/farms/statistics/')
        self.assertEqual(response_global.status_code, 200)
        summary = response_global.data.get('summary', {})
        self.assertEqual(summary.get('lots_count'), 1)
        self.assertEqual(summary.get('initial_birds'), 100)

        response_b = self.client.get(f'/api/farms/statistics/?lot={self.lot_b.id}')
        self.assertEqual(response_b.status_code, 200)
        summary_b = response_b.data.get('summary', {})
        self.assertEqual(summary_b.get('lots_count'), 0)
        self.assertEqual(summary_b.get('initial_birds'), 0)

    def test_lot_filter_by_farm(self):
        other_owner = User.objects.create_user(email='other@test.com', name='Other', password='password')
        other_farm = Farm.objects.create(owner=other_owner, name='Other Farm')
        other_lot = Lot.objects.create(
            farm=other_farm, name='Other Lot', breed='X', initial_quantity=10, current_quantity=10,
            purchase_date=timezone.now().date(), purchase_price=10
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f'/api/lots/?farm={self.farm.id}')
        self.assertEqual(response.status_code, 200)

        lot_ids = [lot['id'] for lot in response.data]
        self.assertIn(self.lot_a.id, lot_ids)
        self.assertIn(self.lot_b.id, lot_ids)
        self.assertNotIn(other_lot.id, lot_ids)

    def test_unauthorized_farm_access(self):
        other_owner = User.objects.create_user(email='other@test.com', name='Other', password='password')
        other_farm = Farm.objects.create(owner=other_owner, name='Other Farm')
        Lot.objects.create(
            farm=other_farm, name='Other Lot', breed='X', initial_quantity=10, current_quantity=10,
            purchase_date=timezone.now().date(), purchase_price=10
        )

        self.client.force_authenticate(user=self.emp_user)
        response = self.client.get(f'/api/farms/statistics/?farm={other_farm.id}')
        self.assertEqual(response.status_code, 200)
        summary = response.data.get('summary', {})
        self.assertEqual(summary.get('farms_count', 0), 0)
