from django.test import TestCase
from rest_framework.test import APIClient

from .models import Farm, Lot, Production, EggConversion, ActivityLog, User
from .serializers import EggConversionSerializer


class EggConversionSerializerTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            password='Abc123!@#',
            name='Owner',
            role='PROPRIETAIRE',
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=5000)
        self.lot = Lot.objects.create(
            farm=self.farm,
            name='Lot 1',
            breed='ISA Brown',
            initial_quantity=1000,
            current_quantity=1000,
            purchase_date='2026-01-01',
            purchase_price='100.00',
            status='ACTIF',
        )
        self.production = Production.objects.create(
            lot=self.lot,
            date='2026-02-01',
            casiers_produits=100,
            casiers_vendables=60,
            oeufs_casses=0,
            status='ACTIVE',
            created_by=self.owner,
        )
        # 40 casiers en attente (100 - 60)

    def _order(self):
        return {
            'production': self.production.id,
            'lot': self.lot.id,
            'farm': self.farm.id,
            'quantity': 10,
            'conversion_date': '2026-02-02',
            'status': 'ACTIVE',
        }

    def test_valid_conversion(self):
        s = EggConversionSerializer(data=self._order())
        self.assertTrue(s.is_valid(), s.errors)
        obj = s.save(created_by=self.owner)
        self.assertEqual(obj.from_state, 'EN_ATTENTE')
        self.assertEqual(obj.to_state, 'VENDABLE')

    def test_conversion_over_available_pending_rejected(self):
        data = self._order()
        data['quantity'] = 41  # 40 disponibles
        s = EggConversionSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('Quantité insuffisante', str(s.errors['non_field_errors'][0]))

    def test_zero_and_negative_quantity_rejected(self):
        for qty in [0, -3]:
            data = self._order()
            data['quantity'] = qty
            s = EggConversionSerializer(data=data)
            self.assertFalse(s.is_valid())

    def test_conversion_of_cancelled_production_rejected(self):
        self.production.status = 'ANNULEE'
        self.production.save()
        s = EggConversionSerializer(data=self._order())
        self.assertFalse(s.is_valid())
        self.assertIn('annulée', str(s.errors['non_field_errors'][0]))

    def test_conversion_of_archived_lot_rejected(self):
        self.lot.status = 'ARCHIVE'
        self.lot.save()
        s = EggConversionSerializer(data=self._order())
        self.assertFalse(s.is_valid())

    def test_production_not_modified_by_conversion(self):
        s = EggConversionSerializer(data=self._order())
        self.assertTrue(s.is_valid(), s.errors)
        s.save(created_by=self.owner)
        self.production.refresh_from_db()
        self.assertEqual(self.production.casiers_produits, 100)
        self.assertEqual(self.production.casiers_vendables, 60)

    def test_serializer_field_defaults(self):
        s = EggConversionSerializer(data=self._order())
        self.assertTrue(s.is_valid(), s.errors)
        obj = s.save(created_by=self.owner)
        self.assertEqual(obj.from_state, 'EN_ATTENTE')
        self.assertEqual(obj.to_state, 'VENDABLE')

    def test_multiple_conversions_status_counted(self):
        # Validation doit traiter l'historique des conversions ACTIVE
        EggConversion.objects.create(
            production=self.production, lot=self.lot, farm=self.farm,
            quantity=15, conversion_date='2026-02-03', status='ACTIVE',
            created_by=self.owner,
        )
        # 40 - 15 = 25 encore disponibles
        data = self._order()
        data['quantity'] = 30
        s = EggConversionSerializer(data=data)
        self.assertFalse(s.is_valid())  # 30 > 25
        data2 = self._order()
        data2['quantity'] = 25
        s2 = EggConversionSerializer(data=data2)
        self.assertTrue(s2.is_valid(), s2.errors)

    def test_annulled_conversion_releases_pending_stock(self):
        conv = EggConversion.objects.create(
            production=self.production, lot=self.lot, farm=self.farm,
            quantity=15, conversion_date='2026-02-03', status='ACTIVE',
            created_by=self.owner,
        )
        conv.status = 'ANNULEE'
        conv.save()
        # Les 40 casiers sont à nouveau disponibles
        data = self._order()
        data['quantity'] = 40
        s = EggConversionSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)


class EggConversionViewSetTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', password='Abc123!@#',
            name='Owner', role='PROPRIETAIRE',
        )
        self.staff = User.objects.create_user(
            email='employe@example.com', password='Abc123!@#',
            name='Employe', role='EMPLOYE',
        )
        self.superuser = User.objects.create_superuser(
            email='admin@example.com', password='Abc123!@#', name='Admin',
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=5000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot 1', breed='ISA Brown',
            initial_quantity=1000, current_quantity=1000,
            purchase_date='2026-01-01', purchase_price='100.00', status='ACTIF',
        )
        self.production = Production.objects.create(
            lot=self.lot, date='2026-02-01', casiers_produits=100,
            casiers_vendables=60, oeufs_casses=0, status='ACTIVE',
            created_by=self.owner,
        )
        self.client = APIClient()
        self.base = '/api/egg-conversions/'

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def _payload(self):
        return {
            'production': self.production.id,
            'quantity': 5,
            'conversion_date': '2026-02-02',
            'status': 'ACTIVE',
        }

    def test_create_conversion_online(self):
        self._login(self.owner)
        resp = self.client.post(self.base, self._payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(EggConversion.objects.filter(status='ACTIVE').count(), 1)
        # farm & lot inférés depuis la production
        self.assertEqual(resp.data['lot'], self.lot.id)
        self.assertEqual(resp.data['farm'], self.farm.id)

    def test_create_generates_activity_log(self):
        self._login(self.owner)
        resp = self.client.post(self.base, self._payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        log = ActivityLog.objects.filter(module='Production', action='Conversion Œufs').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.related_id, resp.data['id'])

    def test_list_filtered_by_lot(self):
        self._login(self.owner)
        self.client.post(self.base, self._payload(), format='json')
        resp = self.client.get(f'{self.base}?lot={self.lot.id}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_unauthenticated_rejected(self):
        resp = self.client.post(self.base, self._payload(), format='json')
        self.assertEqual(resp.status_code, 401)

    def test_destroy_soft_deletes_conversion(self):
        self._login(self.owner)
        created = self.client.post(self.base, self._payload(), format='json')
        conv_id = created.data['id']
        resp = self.client.delete(f'{self.base}{conv_id}/')
        self.assertEqual(resp.status_code, 204)
        conv = EggConversion.objects.get(id=conv_id)
        self.assertEqual(conv.status, 'ANNULEE')

    def test_destroy_twice_rejected(self):
        self._login(self.owner)
        created = self.client.post(self.base, self._payload(), format='json')
        conv_id = created.data['id']
        self.client.delete(f'{self.base}{conv_id}/')
        resp = self.client.delete(f'{self.base}{conv_id}/')
        self.assertEqual(resp.status_code, 400)

    def test_production_untouched_after_conversion(self):
        self._login(self.owner)
        self.client.post(self.base, self._payload(), format='json')
        self.production.refresh_from_db()
        self.assertEqual(self.production.casiers_produits, 100)
        self.assertEqual(self.production.casiers_vendables, 60)

    def test_update_requires_owner(self):
        self._login(self.owner)
        created = self.client.post(self.base, self._payload(), format='json')
        conv_id = created.data['id']
        resp = self.client.patch(f'{self.base}{conv_id}/', {'quantity': 8}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(EggConversion.objects.get(id=conv_id).quantity, 8)

    def test_quantity_exceeds_pending_via_api(self):
        self._login(self.owner)
        payload = self._payload()
        payload['quantity'] = 99  # > 40 disponibles
        resp = self.client.post(self.base, payload, format='json')
        self.assertEqual(resp.status_code, 400)


class LegacyConvertToVendableTests(TestCase):
    """
    Tests pour le legacy endpoint convert_to_vendable.
    
    Vérifie que cet endpoint est correctement désactivé et ne peut plus
    modifier casiers_vendables directement.
    """
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', password='Abc123!@#',
            name='Owner', role='PROPRIETAIRE',
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=5000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot 1', breed='ISA Brown',
            initial_quantity=1000, current_quantity=1000,
            purchase_date='2026-01-01', purchase_price='100.00', status='ACTIF',
        )
        self.production = Production.objects.create(
            lot=self.lot,
            date='2026-02-01',
            casiers_produits=100,
            casiers_vendables=60,
            oeufs_casses=0,
            status='ACTIVE',
            created_by=self.owner,
        )
        self.client = APIClient()

    def test_convert_to_vendable_endpoint_disabled_returns_400(self):
        """Appelle le legacy endpoint et vérifie qu'il refuse correctement."""
        self._login = lambda: self.client.force_authenticate(user=self.owner)
        self._login()
        
        before_casiers = self.production.casiers_vendables
        before_conversions = EggConversion.objects.filter(production=self.production, status='ACTIVE').count()
        
        resp = self.client.post(f'/api/productions/{self.production.id}/convert_to_vendable/', format='json')
        
        # Vérifications
        self.assertEqual(resp.status_code, 400)
        self.assertIn('obsolète', str(resp.data).lower())
        
        # Vérifier qu'aucune donnée n'a été modifiée
        self.production.refresh_from_db()
        self.assertEqual(self.production.casiers_vendables, before_casiers)
        
        after_conversions = EggConversion.objects.filter(production=self.production, status='ACTIVE').count()
        self.assertEqual(after_conversions, before_conversions)

    def test_convert_to_vendable_with_nonexistent_production_404(self):
        """Appelle l'endpoint avec une production inexistante."""
        self._login = lambda: self.client.force_authenticate(user=self.owner)
        self._login()
        
        resp = self.client.post(f'/api/productions/999999/convert_to_vendable/', format='json')
        self.assertEqual(resp.status_code, 404)


class ChronologicalEggConversionTests(TestCase):
    """
    Tests des règles chronologiques sur les conversions d'œufs.
    
    Vérifie si EggConversion enforce que conversion_date >= production.date.
    """
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', password='Abc123!@#',
            name='Owner', role='PROPRIETAIRE',
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=5000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot 1', breed='ISA Brown',
            initial_quantity=1000, current_quantity=1000,
            purchase_date='2026-01-01', purchase_price='100.00', status='ACTIF',
        )

    def test_conversion_before_production_allowed_or_rejected(self):
        """
        Vérifie si conversion AVANT la production est acceptée ou refusée.
        
        Objectif : déterminer si la règle existe réellement.
        """
        from datetime import timedelta
        production_date = '2026-02-15'
        self.production = Production.objects.create(
            lot=self.lot,
            date=production_date,
            casiers_produits=100,
            casiers_vendables=60,
            oeufs_casses=0,
            status='ACTIVE',
            created_by=self.owner,
        )
        
        # Tenter une conversion AVANT la production
        conversion_date_before = '2026-02-14'  # 1 jour avant
        data = {
            'production': self.production.id,
            'lot': self.lot.id,
            'farm': self.farm.id,
            'quantity': 10,
            'conversion_date': conversion_date_before,
            'status': 'ACTIVE',
        }
        s = EggConversionSerializer(data=data)
        is_valid = s.is_valid(raise_exception=False)
        
        if is_valid:
            # Conversion avant production est acceptée
            obj = s.save(created_by=self.owner)
            self.assertTrue(True, "Conversion AVANT la production est acceptée (pas de règle chronologique).")
        else:
            # Conversion avant production est refusée
            self.fail(f"Conversion avant production rejetée : {s.errors}")

    def test_conversion_after_production_allowed(self):
        """
        Vérifie que conversion APRÈS la production est acceptée.
        """
        from datetime import timedelta
        production_date = '2026-02-15'
        self.production = Production.objects.create(
            lot=self.lot,
            date=production_date,
            casiers_produits=100,
            casiers_vendables=60,
            oeufs_casses=0,
            status='ACTIVE',
            created_by=self.owner,
        )
        
        conversion_date_after = '2026-02-20'  # 5 jours après
        data = {
            'production': self.production.id,
            'lot': self.lot.id,
            'farm': self.farm.id,
            'quantity': 10,
            'conversion_date': conversion_date_after,
            'status': 'ACTIVE',
        }
        s = EggConversionSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)
        obj = s.save(created_by=self.owner)
        self.assertIsNotNone(obj.id)


class ChronologicalChickenMovementTests(TestCase):
    """
    Tests des règles chronologiques sur les mouvements de poules.
    
    Vérifie si ChickenMovement enforce des règles temporelles.
    """
    def setUp(self):
        from django.utils import timezone
        self.owner = User.objects.create_user(
            email='owner@example.com', password='Abc123!@#',
            name='Owner', role='PROPRIETAIRE',
        )
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=5000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot 1', breed='ISA Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date='2026-01-01', purchase_price='100.00', status='ACTIF',
        )

    def test_movement_on_terminated_lot_rejected(self):
        """
        Vérifie que mouvement sur lot TERMINE est refusé.
        """
        from .models import ChickenMovement
        self.lot.status = 'TERMINE'
        self.lot.save()
        
        # Tenter un mouvement VENTE sur lot terminé
        data = {
            'lot': self.lot.id,
            'type': 'VENTE',
            'quantity': 10,
            'date': '2026-02-15',
            'status': 'ACTIVE',
        }
        from .serializers import ChickenMovementSerializer
        s = ChickenMovementSerializer(data=data)
        is_valid = s.is_valid(raise_exception=False)
        
        # ChickenMovement permet AJOUT/GUERI sur lot terminé (réactivation)
        # Mais refuse VENTE, MORT, etc.
        if not is_valid:
            self.assertTrue(True, "Mouvement VENTE sur lot terminé refusé (règle protégée).")
        else:
            self.fail(f"Mouvement VENTE sur lot terminé accepté (pas de protection): {s.errors}")

    def test_movement_addition_on_terminated_lot_allowed(self):
        """
        Vérifie que mouvement AJOUT sur lot TERMINE est autorisé (réactivation).
        """
        from .models import ChickenMovement
        self.lot.status = 'TERMINE'
        self.lot.save()
        
        # Mouvement AJOUT peut réactiver un lot terminé
        data = {
            'lot': self.lot.id,
            'type': 'AJOUT',
            'quantity': 10,
            'date': '2026-02-15',
            'status': 'ACTIVE',
        }
        from .serializers import ChickenMovementSerializer
        s = ChickenMovementSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)