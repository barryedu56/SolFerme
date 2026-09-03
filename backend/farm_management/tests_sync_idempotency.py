"""Anti-doublon de synchronisation offline (IdempotentCreateMixin).

Vérifie qu'un POST de création rejoué avec le même `client_uuid` ne crée pas
un second enregistrement — cas où le serveur a traité la 1re requête mais où la
réponse réseau s'est perdue et où le client rejoue au cycle de synchro suivant.
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import User, Farm, Lot, Production, Sale, ChickenMovement, SyncIdempotencyKey


class SyncIdempotencyTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='prop@ex.com', name='Prop', password='pw', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='F1')
        self.lot = Lot.objects.create(
            farm=self.farm, name='L1', breed='ISA',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000,
        )
        Production.objects.create(
            lot=self.lot, date=timezone.now().date(),
            casiers_produits=100, casiers_vendables=100, oeufs_casses=0,
            created_by=self.user,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_replayed_production_create_is_deduplicated(self):
        payload = {
            'lot': self.lot.id, 'date': str(timezone.now().date()),
            'casiers_produits': 10, 'casiers_vendables': 8, 'oeufs_casses': 0,
            'client_uuid': 'uuid-prod-1',
        }
        r1 = self.client.post('/api/productions/', payload, format='json')
        self.assertEqual(r1.status_code, 201, r1.data)
        first_id = r1.data['id']

        # Rejeu à l'identique (réponse perdue côté client)
        r2 = self.client.post('/api/productions/', payload, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['id'], first_id)

        self.assertEqual(Production.objects.filter(lot=self.lot, casiers_produits=10).count(), 1)
        self.assertEqual(SyncIdempotencyKey.objects.filter(client_uuid='uuid-prod-1').count(), 1)

    def test_replayed_sale_create_is_deduplicated(self):
        payload = {
            'lot': self.lot.id, 'date': str(timezone.now().date()),
            'product_type': 'NORMAL', 'quantity': 5, 'unit_price': 50000,
            'total_amount': 250000, 'amount_paid': 250000,
            'customer_name': 'Client A', 'client_uuid': 'uuid-sale-1',
        }
        r1 = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual(r1.status_code, 201, r1.data)
        first_id = r1.data['id']

        r2 = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['id'], first_id)

        self.assertEqual(Sale.objects.filter(lot=self.lot).count(), 1)
        # Le paiement initial ne doit pas être doublé non plus
        self.assertEqual(Sale.objects.get(id=first_id).payments.count(), 1)

    def test_replayed_chicken_movement_create_is_deduplicated(self):
        payload = {
            'lot': self.lot.id, 'type': 'MORT', 'quantity': 3,
            'date': str(timezone.now().date()), 'client_uuid': 'uuid-mvt-1',
        }
        r1 = self.client.post('/api/movements/', payload, format='json')
        self.assertEqual(r1.status_code, 201, r1.data)
        r2 = self.client.post('/api/movements/', payload, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(ChickenMovement.objects.filter(lot=self.lot, type='MORT').count(), 1)

    def test_distinct_uuids_create_distinct_rows(self):
        base = {
            'lot': self.lot.id, 'date': str(timezone.now().date()),
            'casiers_produits': 4, 'casiers_vendables': 4, 'oeufs_casses': 0,
        }
        self.client.post('/api/productions/', {**base, 'client_uuid': 'a'}, format='json')
        self.client.post('/api/productions/', {**base, 'client_uuid': 'b'}, format='json')
        self.assertEqual(Production.objects.filter(lot=self.lot, casiers_produits=4).count(), 2)

    def test_no_client_uuid_keeps_legacy_behaviour(self):
        base = {
            'lot': self.lot.id, 'date': str(timezone.now().date()),
            'casiers_produits': 7, 'casiers_vendables': 7, 'oeufs_casses': 0,
        }
        self.client.post('/api/productions/', base, format='json')
        self.client.post('/api/productions/', base, format='json')
        # Sans client_uuid : comportement inchangé (2 lignes), aucune clé stockée
        self.assertEqual(Production.objects.filter(lot=self.lot, casiers_produits=7).count(), 2)
        self.assertEqual(SyncIdempotencyKey.objects.count(), 0)

    def test_deleted_object_allows_recreation(self):
        payload = {
            'lot': self.lot.id, 'date': str(timezone.now().date()),
            'casiers_produits': 9, 'casiers_vendables': 9, 'oeufs_casses': 0,
            'client_uuid': 'uuid-recreate',
        }
        r1 = self.client.post('/api/productions/', payload, format='json')
        Production.objects.filter(id=r1.data['id']).delete()

        r2 = self.client.post('/api/productions/', payload, format='json')
        self.assertEqual(r2.status_code, 201)
        self.assertNotEqual(r2.data['id'], r1.data['id'])
        self.assertEqual(Production.objects.filter(lot=self.lot, casiers_produits=9).count(), 1)
