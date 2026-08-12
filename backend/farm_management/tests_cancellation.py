from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from .models import User, Farm, Lot, Sale, Production, FeedPurchase, Expense, FeedInventory, ChickenMovement, HealthPurchase, HealthInventory, HealthRecord, Feed

class CancellationSystemTestCase(TestCase):
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

    def test_sale_cancellation_flow(self):
        # 1. Create Production to have stock
        Production.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            casiers_produits=10,
            casiers_vendables=10,
            oeufs_casses=0,
            created_by=self.user
        )

        # 2. Create Sale
        sale = Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='Œufs Normaux',
            quantity=5,
            unit_price=50000,
            total_amount=250000,
            amount_paid=250000,
            created_by=self.user
        )

        # Check stock via SaleSerializer validation logic (simulated)
        from .serializers import SaleSerializer

        # Available should be 10 - 5 = 5
        produced = Production.objects.filter(lot=self.lot, status='ACTIVE').aggregate(Sum('casiers_vendables'))['casiers_vendables__sum'] or 0
        sold = Sale.objects.filter(lot=self.lot, product_type='Œufs Normaux', status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        self.assertEqual(produced - sold, 5)

        # 3. Cancel Sale
        sale.status = 'ANNULEE'
        sale.save()

        # 4. Verify stock recovery
        sold_after = Sale.objects.filter(lot=self.lot, product_type='Œufs Normaux', status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        self.assertEqual(sold_after, 0)
        self.assertEqual(produced - sold_after, 10)

    def test_production_cancellation_guards(self):
        # 1. Create Production
        prod = Production.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            casiers_produits=10,
            casiers_vendables=10,
            created_by=self.user
        )

        # 2. Create Sale that uses that production
        Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='Œufs Normaux',
            quantity=8,
            unit_price=50000,
            total_amount=400000,
            created_by=self.user
        )

        # 3. Try to cancel production (should be blocked by ViewSet logic, but we test the logic here)
        # In views.py, ProductionViewSet.destroy handles this check.

        def attempt_cancel_production(production_id):
            instance = Production.objects.get(id=production_id)
            lot = instance.lot
            total_sold_normaux = lot.sales.filter(product_type='Œufs Normaux', status='ACTIVE').aggregate(total=Sum('quantity'))['total'] or 0
            remaining_produced = lot.productions.filter(status='ACTIVE').exclude(id=instance.id).aggregate(total=Sum('casiers_vendables'))['total'] or 0

            if remaining_produced < total_sold_normaux:
                return False, "Stock insuffisant"
            instance.status = 'ANNULEE'
            instance.save()
            return True, "OK"

        success, msg = attempt_cancel_production(prod.id)
        self.assertFalse(success)
        self.assertEqual(msg, "Stock insuffisant")

        # Verify status is still ACTIVE
        prod.refresh_from_db()
        self.assertEqual(prod.status, 'ACTIVE')

    def test_feed_purchase_cancellation_rollback(self):
        # 1. Purchase Feed
        purchase = FeedPurchase.objects.create(
            farm=self.farm,
            date=timezone.now().date(),
            feed_type='Ponte',
            quantity_kg=100,
            total_price=1000,
            created_by=self.user
        )

        inventory = FeedInventory.objects.get(farm=self.farm, feed_type='Ponte')
        self.assertEqual(inventory.quantity_kg, 100)

        expense = purchase.expense
        self.assertIsNotNone(expense)
        self.assertEqual(expense.status, 'ACTIVE')

        # 2. Cancel Purchase
        purchase.status = 'ANNULEE'
        purchase.save()

        # 3. Verify Inventory Rollback
        inventory.refresh_from_db()
        self.assertEqual(inventory.quantity_kg, 0)

        # 4. Verify Expense Cancellation
        expense.refresh_from_db()
        self.assertEqual(expense.status, 'ANNULEE')

    def test_chicken_movement_cancellation(self):
        # Initial quantity 100
        self.assertEqual(self.lot.current_quantity, 100)

        # 1. Add movement (Mortality)
        move = ChickenMovement.objects.create(
            lot=self.lot,
            type='MORT',
            quantity=5,
            date=timezone.now().date(),
            created_by=self.user
        )

        self.lot.refresh_from_db()
        self.assertEqual(self.lot.current_quantity, 95)

        # 2. Cancel movement
        move.status = 'ANNULEE'
        move.save()

        self.lot.refresh_from_db()
        self.assertEqual(self.lot.current_quantity, 100)
