from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from .models import (
    User, Farm, Lot, FeedPurchase, HealthPurchase, Feed,
    HealthRecord, FeedInventory, HealthInventory, Expense,
    FeedPreparation, PreparedFeedInventory
)
from .serializers import FeedSerializer, HealthRecordSerializer, HealthPurchaseSerializer

class InventoryTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='test@example.com', name='Test User', password='password')
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm')
        self.lot = Lot.objects.create(
            farm=self.farm,
            name='Test Lot',
            breed='Isa Brown',
            initial_quantity=100,
            current_quantity=100,
            purchase_date=timezone.now().date(),
            purchase_price=1000
        )

    def test_feed_purchase_increments_inventory_and_creates_expense(self):
        FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Maïs',
            quantity_kg=500,
            total_price=5000,
            created_by=self.user
        )

        inventory = FeedInventory.objects.get(farm=self.farm, feed_type='Maïs')
        self.assertEqual(float(inventory.quantity_kg), 500.0)

        expense = Expense.objects.filter(farm=self.farm, category='ALIMENTATION').first()
        self.assertIsNotNone(expense)
        self.assertEqual(float(expense.amount), 5000.0)

    def test_feed_usage_decrements_prepared_inventory(self):
        # Dans le nouveau système, l'aliment utilisé par un lot provient du stock d'aliment préparé
        FeedPreparation.objects.create(
            farm=self.farm,
            lot=self.lot,
            feed_name='Ponte complete',
            quantity_produced_kg=100,
            date=timezone.now().date(),
            created_by=self.user
        )

        # On vérifie le stock initial
        inventory = PreparedFeedInventory.objects.get(farm=self.farm, feed_name='Ponte complete')
        self.assertEqual(float(inventory.quantity_kg), 100.0)

        # Utilisation de l'aliment
        Feed.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Ponte complete',
            quantity_kg=20,
            cost=0,
            created_by=self.user
        )

        inventory.refresh_from_db()
        self.assertEqual(float(inventory.quantity_kg), 80.0)

    def test_health_purchase_increments_inventory_and_creates_expense(self):
        HealthPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            product_name='Vaccin Gumboro',
            product_type='Vaccin',
            quantity=10,
            unit='Flacon',
            total_price=2000,
            created_by=self.user
        )

        inventory = HealthInventory.objects.get(farm=self.farm, product_name='Vaccin Gumboro')
        self.assertEqual(float(inventory.quantity), 10.0)
        self.assertEqual(inventory.unit, 'Flacon')

        expense = Expense.objects.filter(farm=self.farm, category='SANTE').first()
        self.assertIsNotNone(expense)
        self.assertEqual(float(expense.amount), 2000.0)

    def test_health_usage_decrements_inventory(self):
        # Setup initial purchase
        HealthPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            product_name='Vaccin Gumboro',
            quantity=5,
            unit='Dose',
            total_price=1000,
            created_by=self.user
        )

        # Utilisation de 1 unité (Dose)
        HealthRecord.objects.create(
            lot=self.lot,
            type='Vaccin',
            product_name='Vaccin Gumboro',
            quantity=1,
            date=timezone.now().date(),
            cost=0,
            created_by=self.user
        )

        inventory = HealthInventory.objects.get(farm=self.farm, product_name='Vaccin Gumboro')
        self.assertEqual(float(inventory.quantity), 4.0)

    def test_insufficient_feed_stock_validation(self):
        # On tente d'utiliser de l'aliment préparé inexistant
        data = {
            'lot': self.lot.id,
            'date': timezone.now().date(),
            'feed_type': 'Inexistant',
            'quantity_kg': 50,
            'cost': 0
        }
        serializer = FeedSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('non_field_errors', serializer.errors)
        self.assertIn('stock de \'Inexistant\' insuffisant', str(serializer.errors['non_field_errors'][0]))

    def test_insufficient_health_stock_validation(self):
        HealthPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            product_name='Antibio',
            quantity=2,
            unit='Litre',
            total_price=500,
            created_by=self.user
        )

        data = {
            'lot': self.lot.id,
            'type': 'Traitement',
            'product_name': 'Antibio',
            'quantity': 5, # Plus que le stock (2)
            'date': timezone.now().date(),
            'cost': 0
        }
        serializer = HealthRecordSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('non_field_errors', serializer.errors)
        self.assertIn('stock de \'Antibio\' insuffisant', str(serializer.errors['non_field_errors'][0]))

    def test_feed_preparation_converts_raw_to_prepared(self):
        # 1. Acheter des matières premières
        FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Maïs',
            quantity_kg=100,
            total_price=1000,
            created_by=self.user
        )
        FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Soja',
            quantity_kg=50,
            total_price=1500,
            created_by=self.user
        )

        # Vérifier stock initial
        inventory_mais = FeedInventory.objects.get(farm=self.farm, feed_type='Maïs')
        inventory_soja = FeedInventory.objects.get(farm=self.farm, feed_type='Soja')
        self.assertEqual(float(inventory_mais.quantity_kg), 100.0)
        self.assertEqual(float(inventory_soja.quantity_kg), 50.0)

        # 2. Préparer un mélange
        from .serializers import FeedPreparationSerializer
        prep_data = {
            'lot': self.lot.id,
            'feed_name': 'Mélange Poule',
            'quantity_produced_kg': 60,
            'date': timezone.now().date(),
            'ingredients': [
                {'material_name': 'Maïs', 'quantity_used_kg': 40},
                {'material_name': 'Soja', 'quantity_used_kg': 20}
            ]
        }
        serializer = FeedPreparationSerializer(data=prep_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(created_by=self.user)

        # 3. Vérifier les stocks
        inventory_mais.refresh_from_db()
        inventory_soja.refresh_from_db()
        self.assertEqual(float(inventory_mais.quantity_kg), 60.0)
        self.assertEqual(float(inventory_soja.quantity_kg), 30.0)

        inventory_prep = PreparedFeedInventory.objects.get(farm=self.farm, feed_name='Mélange Poule')
        self.assertEqual(float(inventory_prep.quantity_kg), 60.0)

    def test_cancellation_restores_raw_materials(self):
        # 1. Acheter et Préparer
        FeedPurchase.objects.create(farm=self.farm, lot=self.lot, date=timezone.now().date(), feed_type='Maïs', quantity_kg=100, total_price=1000, created_by=self.user)

        prep = FeedPreparation.objects.create(
            farm=self.farm,
            lot=self.lot,
            feed_name='Test Prep',
            quantity_produced_kg=50,
            date=timezone.now().date(),
            created_by=self.user
        )
        from .models import FeedPreparationIngredient
        FeedPreparationIngredient.objects.create(preparation=prep, material_name='Maïs', quantity_used_kg=40)

        inventory_mais = FeedInventory.objects.get(farm=self.farm, feed_type='Maïs')
        self.assertEqual(float(inventory_mais.quantity_kg), 60.0)

        # 2. Annuler la préparation
        prep.status = 'ANNULEE'
        prep.save()

        # 3. Vérifier que le stock de Maïs est revenu à 100
        inventory_mais.refresh_from_db()
        self.assertEqual(float(inventory_mais.quantity_kg), 100.0)

        # Et le stock préparé doit être à 0 (ligne supprimée : plus de réserve active)
        prep_qty = PreparedFeedInventory.objects.filter(
            farm=self.farm, feed_name='Test Prep'
        ).aggregate(total=Sum('quantity_kg'))['total'] or 0
        self.assertEqual(float(prep_qty), 0.0)

    def test_financial_consistency_after_purchases(self):
        # 1. Effectuer des achats (Aliment et Santé)
        FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Maïs',
            quantity_kg=100,
            total_price=1000,
            created_by=self.user
        )
        HealthPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            product_name='Vaccin',
            quantity=10,
            unit='Dose',
            total_price=500,
            created_by=self.user
        )

        # 2. Vérifier les dépenses créées
        expenses = Expense.objects.filter(farm=self.farm, status='ACTIVE')
        self.assertEqual(expenses.count(), 2)
        total_expense_amount = sum(float(e.amount) for e in expenses)
        self.assertEqual(total_expense_amount, 1500.0)

        # 3. Vérifier le dashboard summary via le calcul interne (pour éviter double comptage)
        farms = [self.farm]
        start_date = timezone.now() - timezone.timedelta(days=7)
        expenses_period = Expense.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE')

        linked_expense_ids = []
        linked_expense_ids.extend(FeedPurchase.objects.filter(farm__in=farms, expense__isnull=False).values_list('expense_id', flat=True))
        linked_expense_ids.extend(HealthPurchase.objects.filter(farm__in=farms, expense__isnull=False).values_list('expense_id', flat=True))

        # Standalone doit exclure les dépenses liées
        period_standalone_expenses = expenses_period.exclude(id__in=linked_expense_ids).aggregate(total=Sum('amount'))['total'] or 0
        self.assertEqual(float(period_standalone_expenses), 0.0)

        period_feed_purchase_cost = FeedPurchase.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('total_price'))['total'] or 0
        period_health_purchase_cost = HealthPurchase.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('total_price'))['total'] or 0

        total_calculated = float(period_standalone_expenses) + float(period_feed_purchase_cost) + float(period_health_purchase_cost)
        self.assertEqual(total_calculated, 1500.0)

    def test_cancellation_syncs_financials(self):
        # 1. Achat
        purchase = FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Maïs',
            quantity_kg=100,
            total_price=1000,
            created_by=self.user
        )
        purchase.refresh_from_db() # Ensure signal-created expense is loaded
        expense_id = purchase.expense.id

        # 2. Annulation de l'achat
        purchase.status = 'ANNULEE'
        purchase.save()

        # 3. Vérifier que la dépense est aussi annulée
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ANNULEE')


class StockGeneralParFermeTestCase(TestCase):
    """Stock désormais au niveau FERME ; mélange rattachable à un lot (réserve)."""
    def setUp(self):
        self.user = User.objects.create_user(email='sg@example.com', name='SG', password='password')
        self.farm = Farm.objects.create(owner=self.user, name='Ferme SG')
        common = dict(farm=self.farm, breed='Isa', initial_quantity=100, current_quantity=100,
                      purchase_date=timezone.now().date(), purchase_price=0)
        self.lotA = Lot.objects.create(name='Lot A', **common)
        self.lotB = Lot.objects.create(name='Lot B', **common)

    def test_purchase_without_lot_feeds_farm_stock(self):
        FeedPurchase.objects.create(farm=self.farm, lot=None, date=timezone.now().date(),
                                    feed_type='Maïs', quantity_kg=50, total_price=500, created_by=self.user)
        inv = FeedInventory.objects.get(farm=self.farm, feed_type='Maïs')
        self.assertEqual(float(inv.quantity_kg), 50.0)
        # Une seule ligne pour la ferme, pas de rattachement lot
        self.assertEqual(FeedInventory.objects.filter(feed_type='Maïs').count(), 1)

    def test_purchases_from_two_lots_merge_into_farm_stock(self):
        FeedPurchase.objects.create(farm=self.farm, lot=self.lotA, date=timezone.now().date(),
                                    feed_type='Maïs', quantity_kg=50, total_price=500, created_by=self.user)
        FeedPurchase.objects.create(farm=self.farm, lot=self.lotB, date=timezone.now().date(),
                                    feed_type='Maïs', quantity_kg=30, total_price=300, created_by=self.user)
        inv = FeedInventory.objects.get(farm=self.farm, feed_type='Maïs')
        self.assertEqual(float(inv.quantity_kg), 80.0)

    def test_prep_with_lot_is_reserved_prep_without_lot_is_general(self):
        FeedPurchase.objects.create(farm=self.farm, lot=None, date=timezone.now().date(),
                                    feed_type='Maïs', quantity_kg=200, total_price=2000, created_by=self.user)
        from .models import FeedPreparationIngredient
        # Mélange réservé au lot A
        prepA = FeedPreparation.objects.create(farm=self.farm, lot=self.lotA, feed_name='Ponte',
                                               quantity_produced_kg=40, date=timezone.now().date(), created_by=self.user)
        FeedPreparationIngredient.objects.create(preparation=prepA, material_name='Maïs', quantity_used_kg=40)
        # Mélange général ferme
        prepG = FeedPreparation.objects.create(farm=self.farm, lot=None, feed_name='Ponte',
                                               quantity_produced_kg=30, date=timezone.now().date(), created_by=self.user)
        FeedPreparationIngredient.objects.create(preparation=prepG, material_name='Maïs', quantity_used_kg=30)

        self.assertEqual(float(FeedInventory.objects.get(farm=self.farm, feed_type='Maïs').quantity_kg), 130.0)
        self.assertEqual(float(PreparedFeedInventory.objects.get(farm=self.farm, lot=self.lotA, feed_name='Ponte').quantity_kg), 40.0)
        self.assertEqual(float(PreparedFeedInventory.objects.get(farm=self.farm, lot__isnull=True, feed_name='Ponte').quantity_kg), 30.0)

    def test_distribution_consumes_lot_reserve_then_general(self):
        FeedPurchase.objects.create(farm=self.farm, lot=None, date=timezone.now().date(),
                                    feed_type='Maïs', quantity_kg=200, total_price=2000, created_by=self.user)
        from .models import FeedPreparationIngredient
        prepA = FeedPreparation.objects.create(farm=self.farm, lot=self.lotA, feed_name='Ponte',
                                               quantity_produced_kg=40, date=timezone.now().date(), created_by=self.user)
        FeedPreparationIngredient.objects.create(preparation=prepA, material_name='Maïs', quantity_used_kg=40)
        prepG = FeedPreparation.objects.create(farm=self.farm, lot=None, feed_name='Ponte',
                                               quantity_produced_kg=30, date=timezone.now().date(), created_by=self.user)
        FeedPreparationIngredient.objects.create(preparation=prepG, material_name='Maïs', quantity_used_kg=30)

        # Distribution au lot A → consomme sa réserve
        Feed.objects.create(lot=self.lotA, date=timezone.now().date(), feed_type='Ponte', quantity_kg=10, cost=0, created_by=self.user)
        self.assertEqual(float(PreparedFeedInventory.objects.get(farm=self.farm, lot=self.lotA, feed_name='Ponte').quantity_kg), 30.0)
        self.assertEqual(float(PreparedFeedInventory.objects.get(farm=self.farm, lot__isnull=True, feed_name='Ponte').quantity_kg), 30.0)

        # Distribution au lot B (sans réserve) → consomme le stock général
        Feed.objects.create(lot=self.lotB, date=timezone.now().date(), feed_type='Ponte', quantity_kg=12, cost=0, created_by=self.user)
        self.assertEqual(float(PreparedFeedInventory.objects.get(farm=self.farm, lot__isnull=True, feed_name='Ponte').quantity_kg), 18.0)

    def test_health_stock_is_farm_level(self):
        HealthPurchase.objects.create(farm=self.farm, lot=self.lotA, date=timezone.now().date(),
                                      product_name='Vaccin', quantity=10, unit='Dose', total_price=1000, created_by=self.user)
        HealthRecord.objects.create(lot=self.lotB, type='Vaccin', product_name='Vaccin', quantity=3,
                                    date=timezone.now().date(), cost=0, created_by=self.user)
        # Achat imputé lot A, soin sur lot B, mais stock commun ferme = 7
        self.assertEqual(float(HealthInventory.objects.get(farm=self.farm, product_name='Vaccin').quantity), 7.0)
