from django.test import TestCase
from rest_framework.test import APIClient

from .models import User, Farm


class RejectedWriteLogTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='o@example.com', name='O', password='pw', role='PROPRIETAIRE')
        self.farm = Farm.objects.create(owner=self.user, name='Ferme', capacity=100)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_refused_lot_creation_is_logged_with_reason(self):
        with self.assertLogs('solferme.refus', level='WARNING') as logs:
            r = self.client.post('/api/lots/', {
                'farm': self.farm.id, 'name': 'Salle 2', 'breed': 'ISA', 'initial_quantity': 500,
                'current_quantity': 500, 'purchase_date': '2026-11-10', 'purchase_price': 1000,
            }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('POST /api/lots/ -> 400', logs.output[0])
        self.assertIn('pacit', logs.output[0])  # « Capacité … dépassée »

    def test_auth_endpoints_never_logged(self):
        with self.assertNoLogs('solferme.refus', level='WARNING'):
            APIClient().post('/api/auth/login/', {'email': 'x@x.com', 'password': 'bad'}, format='json')
