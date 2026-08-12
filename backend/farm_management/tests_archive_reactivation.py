from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse
from datetime import date
from .models import User, Farm, Lot


class ArchiveReactivateTests(TestCase):
    def setUp(self):
        # Propriétaire utilisateur
        self.owner = User.objects.create(email='owner@example.com', name='Owner')
        self.owner.set_password('password')
        self.owner.save()

        self.client = APIClient()
        # Authenticate by force (no auth backend assumptions in tests)
        self.client.force_authenticate(user=self.owner)

    def _farm_action_url(self, farm_id, action_name):
        return reverse(f'farm-{action_name}', args=[farm_id])

    def _lot_action_url(self, lot_id, action_name):
        return reverse(f'lot-{action_name}', args=[lot_id])

    def test_A_archive_farm_with_active_lot_should_refuse(self):
        # A: Farm active + lot active -> archive farm -> REFUSE
        farm = Farm.objects.create(owner=self.owner, name='F1')
        lot = Lot.objects.create(farm=farm, name='L1', breed='B', initial_quantity=10, current_quantity=10, subjects_price=100, purchase_date=date.today())
        farm.status = 'ACTIF'
        farm.save()
        lot.status = 'ACTIF'
        lot.save()

        resp = self.client.post(self._farm_action_url(farm.id, 'archive'))
        self.assertEqual(resp.status_code, 400)

    def test_B_archive_farm_all_lots_archived_ok(self):
        # B: Farm active + all lots archived -> archive farm -> OK
        farm = Farm.objects.create(owner=self.owner, name='F2')
        lot = Lot.objects.create(farm=farm, name='L2', breed='B', initial_quantity=5, current_quantity=0, status='ARCHIVE', subjects_price=50, purchase_date=date.today())
        farm.status = 'ACTIF'
        farm.save()

        resp = self.client.post(self._farm_action_url(farm.id, 'archive'))
        self.assertEqual(resp.status_code, 200)
        farm.refresh_from_db()
        self.assertEqual(farm.status, 'ARCHIVE')

    def test_C_reactivate_archived_farm_ok(self):
        # C: Farm archived -> reactivate -> OK
        farm = Farm.objects.create(owner=self.owner, name='F3', status='ARCHIVE')
        resp = self.client.post(f"{self._farm_action_url(farm.id, 'reactivate')}?status=ARCHIVE")
        self.assertEqual(resp.status_code, 200)
        farm.refresh_from_db()
        self.assertEqual(farm.status, 'ACTIF')

    def test_D_reactivate_lot_when_farm_archived_refuse(self):
        # D: Farm archived -> reactivate lot -> REFUSE
        farm = Farm.objects.create(owner=self.owner, name='F4', status='ARCHIVE')
        lot = Lot.objects.create(farm=farm, name='L4', breed='B', initial_quantity=5, current_quantity=5, status='ARCHIVE', subjects_price=40, purchase_date=date.today())
        resp = self.client.post(self._lot_action_url(lot.id, 'reactivate'))
        self.assertEqual(resp.status_code, 400)

    def test_E_reactivate_lot_with_farm_active_and_qty_gt0_ok(self):
        # E: Farm active + lot archived + qty>0 -> reactivate lot -> OK
        farm = Farm.objects.create(owner=self.owner, name='F5', status='ACTIF')
        lot = Lot.objects.create(farm=farm, name='L5', breed='B', initial_quantity=10, current_quantity=3, status='ARCHIVE', subjects_price=120, purchase_date=date.today())
        resp = self.client.post(self._lot_action_url(lot.id, 'reactivate'))
        self.assertEqual(resp.status_code, 200)
        lot.refresh_from_db()
        self.assertEqual(lot.status, 'ACTIF')

    def test_F_reactivate_lot_with_qty_le_zero_refuse(self):
        # F: Lot with quantity <= 0 -> reactivate -> REFUSE
        farm = Farm.objects.create(owner=self.owner, name='F6', status='ACTIF')
        lot = Lot.objects.create(farm=farm, name='L6', breed='B', initial_quantity=10, current_quantity=0, status='ARCHIVE', subjects_price=90, purchase_date=date.today())
        resp = self.client.post(self._lot_action_url(lot.id, 'reactivate'))
        self.assertEqual(resp.status_code, 400)
