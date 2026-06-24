from django.test import TestCase
from django.utils import timezone
from .models import User, Farm, Lot, FeedPurchase, HealthPurchase, Feed, HealthRecord, FeedInventory, HealthInventory, Expense

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
            date=timezone.now().date(),
            feed_type='Ponte',
            quantity_kg=500,
            total_price=5000,
            created_by=self.user
        )

        inventory = FeedInventory.objects.get(farm=self.farm, feed_type='Ponte')
        self.assertEqual(inventory.quantity_kg, 500)

        expense = Expense.objects.filter(farm=self.farm, category='ALIMENTATION').first()
        self.assertIsNotNone(expense)
        self.assertEqual(expense.amount, 5000)

    def test_feed_usage_decrements_inventory(self):
        # Setup inventory
        FeedInventory.objects.create(farm=self.farm, feed_type='Ponte', quantity_kg=100)

        # Use feed
        Feed.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Ponte',
            quantity_kg=20,
            cost=0,
            created_by=self.user
        )

        inventory = FeedInventory.objects.get(farm=self.farm, feed_type='Ponte')
        self.assertEqual(inventory.quantity_kg, 80)

    def test_health_purchase_increments_inventory_and_creates_expense(self):
        HealthPurchase.objects.create(
            farm=self.farm,
            date=timezone.now().date(),
            product_name='Vaccin Gumboro',
            quantity=10,
            total_price=2000,
            created_by=self.user
        )

        inventory = HealthInventory.objects.get(farm=self.farm, product_name='Vaccin Gumboro')
        self.assertEqual(inventory.quantity, 10)

        expense = Expense.objects.filter(farm=self.farm, category='SANTE').first()
        self.assertIsNotNone(expense)
        self.assertEqual(expense.amount, 2000)

    def test_health_usage_decrements_inventory(self):
        # Setup inventory
        HealthInventory.objects.create(farm=self.farm, product_name='Vaccin Gumboro', quantity=5)

        # Use health record (dose is a string "1 unité" or similar)
        HealthRecord.objects.create(
            lot=self.lot,
            type='Vaccin',
            product_name='Vaccin Gumboro',
            dose='1 dose',
            date=timezone.now().date(),
            cost=0,
            created_by=self.user
        )

        inventory = HealthInventory.objects.get(farm=self.farm, product_name='Vaccin Gumboro')
        self.assertEqual(inventory.quantity, 4)

    def test_insufficient_feed_stock_validation(self):
        from .serializers import FeedSerializer
        FeedInventory.objects.create(farm=self.farm, feed_type='Ponte', quantity_kg=10)

        data = {
            'lot': self.lot.id,
            'date': timezone.now().date(),
            'feed_type': 'Ponte',
            'quantity_kg': 50,
            'cost': 0
        }
        serializer = FeedSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('quantity_kg', serializer.errors)

    def test_insufficient_health_stock_validation(self):
        from .serializers import HealthRecordSerializer
        HealthInventory.objects.create(farm=self.farm, product_name='Vaccin Gumboro', quantity=2)

        data = {
            'lot': self.lot.id,
            'type': 'Vaccin',
            'product_name': 'Vaccin Gumboro',
            'dose': '5 doses',
            'date': timezone.now().date(),
            'cost': 0
        }
        serializer = HealthRecordSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('dose', serializer.errors)
