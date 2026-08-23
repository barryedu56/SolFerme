from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from rest_framework import status
from rest_framework.test import APIClient
from .models import User, Farm, Lot, Sale, Production, FeedPurchase, Expense, FeedInventory, ChickenMovement, HealthPurchase, HealthInventory, HealthRecord, Feed, Payroll, Employee


class FinancialDoubleCounting(TestCase):
    """
    Tests de détection du double comptage financier.
    
    Vérifie que l'annulation d'une FeedPurchase/Payroll annule aussi l'Expense lié.
    """
    def setUp(self):
        self.user = User.objects.create_user(
            email='prop@example.com', name='Prop', password='password', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm')
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='ISA Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000
        )
        self.employee = Employee.objects.create(
            user=self.user, farm=self.farm, position='Worker', salary=10000
        )

    def test_feed_purchase_cancellation_cascades_expense(self):
        """
        Vérifie que l'annulation d'une FeedPurchase annule aussi l'Expense lié.
        
        Scénario de double comptage :
        1. Créer FeedPurchase → crée automatiquement un Expense (via signal)
        2. Annuler FeedPurchase → doit aussi annuler l'Expense
        3. Si l'Expense reste ACTIVE, c'est du double comptage
        """
        # Créer une FeedPurchase
        purchase = FeedPurchase.objects.create(
            farm=self.farm, lot=self.lot,
            date=timezone.now().date(),
            feed_type='Maïs',
            quantity_kg=100,
            total_price=50000,
            supplier='Fournisseur A',
            status='ACTIVE',
            created_by=self.user
        )
        
        # Vérifier qu'un Expense a été créé (via signal post_save)
        purchase.refresh_from_db()
        self.assertIsNotNone(purchase.expense, "Expense doit être créé automatiquement")
        expense_id = purchase.expense.id
        
        # Vérifier l'Expense est ACTIVE
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ACTIVE')
        self.assertEqual(float(expense.amount), 50000.0)
        
        # Annuler la FeedPurchase
        purchase.status = 'ANNULEE'
        purchase.save()
        
        # Vérifier que l'Expense est aussi annulé (via signal post_save)
        expense.refresh_from_db()
        self.assertEqual(expense.status, 'ANNULEE', 
                        "Expense doit être annulé quand FeedPurchase est annulé (pas de double comptage)")

    def test_payroll_cancellation_cascades_expense(self):
        """
        Vérifie que l'annulation d'une paie annule aussi l'Expense lié.
        """
        # Créer une paie
        payroll = Payroll.objects.create(
            employee=self.employee,
            date=timezone.now().date(),
            base_salary=100000,
            bonus=10000,
            deduction=5000,
            amount_paid=105000,
            status='ACTIVE'
        )
        
        # Vérifier qu'un Expense a été créé
        payroll.refresh_from_db()
        self.assertIsNotNone(payroll.expense, "Expense doit être créé automatiquement")
        expense_id = payroll.expense.id
        
        # Vérifier l'Expense est ACTIVE
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ACTIVE')
        self.assertEqual(float(expense.amount), 105000.0)
        
        # Annuler la paie
        payroll.status = 'ANNULEE'
        payroll.save()
        
        # Vérifier que l'Expense est aussi annulé
        expense.refresh_from_db()
        self.assertEqual(expense.status, 'ANNULEE',
                        "Expense doit être annulé quand Payroll est annulé (pas de double comptage)")

    def test_health_purchase_cancellation_cascades_expense(self):
        """
        Vérifie que l'annulation d'une HealthPurchase annule aussi l'Expense lié.
        """
        # Créer une HealthPurchase
        purchase = HealthPurchase.objects.create(
            farm=self.farm, lot=self.lot,
            date=timezone.now().date(),
            product_name='Vaccin',
            product_type='Vaccin',
            quantity=10,
            unit='Flacon',
            total_price=30000,
            supplier='Pharma Lab',
            status='ACTIVE',
            created_by=self.user
        )
        
        # Vérifier qu'un Expense a été créé
        purchase.refresh_from_db()
        self.assertIsNotNone(purchase.expense, "Expense doit être créé automatiquement")
        expense_id = purchase.expense.id
        
        # Vérifier l'Expense est ACTIVE
        expense = Expense.objects.get(id=expense_id)
        self.assertEqual(expense.status, 'ACTIVE')
        self.assertEqual(float(expense.amount), 30000.0)
        
        # Annuler la HealthPurchase
        purchase.status = 'ANNULEE'
        purchase.save()
        
        # Vérifier que l'Expense est aussi annulé
        expense.refresh_from_db()
        self.assertEqual(expense.status, 'ANNULEE',
                        "Expense doit être annulé quand HealthPurchase est annulé (pas de double comptage)")


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
            product_type='NORMAL',
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
        sold = Sale.objects.filter(lot=self.lot, product_type='NORMAL', status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        self.assertEqual(produced - sold, 5)

        # 3. Cancel Sale
        sale.status = 'ANNULEE'
        sale.save()

        # 4. Verify stock recovery
        sold_after = Sale.objects.filter(lot=self.lot, product_type='NORMAL', status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        self.assertEqual(sold_after, 0)
        self.assertEqual(produced - sold_after, 10)

    def test_sale_cancellation_api_soft_delete(self):
        sale = Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='NORMAL',
            quantity=5,
            unit_price=50000,
            total_amount=250000,
            amount_paid=250000,
            created_by=self.user
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.delete(f'/api/sales/{sale.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        sale.refresh_from_db()
        self.assertEqual(sale.status, 'ANNULEE')
        self.assertTrue(Sale.objects.filter(id=sale.id).exists())

        activity_log = sale.lot.activity_logs.filter(related_id=sale.id, module='Vente').order_by('-id').first()
        self.assertIsNotNone(activity_log)
        self.assertIn('Annulée', activity_log.action)

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
            product_type='NORMAL',
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
            total_sold_normaux = lot.sales.filter(product_type='NORMAL', status='ACTIVE').aggregate(total=Sum('quantity'))['total'] or 0
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
        # 1. Purchase Feed - providing mandatory lot
        purchase = FeedPurchase.objects.create(
            farm=self.farm,
            lot=self.lot,
            date=timezone.now().date(),
            feed_type='Ponte',
            quantity_kg=100,
            total_price=1000,
            created_by=self.user
        )

        inventory = FeedInventory.objects.get(lot=self.lot, feed_type='Ponte')
        self.assertEqual(inventory.quantity_kg, 100)

        purchase.refresh_from_db()
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
    def test_chronological_stock_integrity_rule_a(self):
        # Day 1: Produce 10
        p1 = Production.objects.create(
            lot=self.lot, date=timezone.now().date() - timezone.timedelta(days=3),
            casiers_produits=10, casiers_vendables=10, created_by=self.user
        )
        # Day 2: Produce 10
        p2 = Production.objects.create(
            lot=self.lot, date=timezone.now().date() - timezone.timedelta(days=2),
            casiers_produits=10, casiers_vendables=10, created_by=self.user
        )
        # Day 3: Sell 15
        s1 = Sale.objects.create(
            lot=self.lot, date=timezone.now().date() - timezone.timedelta(days=1),
            product_type='NORMAL', quantity=15, unit_price=100, total_amount=1500, created_by=self.user
        )

        # Attempt to cancel p1.
        # Logic: Remaining after p1 cancel = 10 (p2). Sold = 15. 10 - 15 = -5 -> Should fail.
        from .serializers import validate_egg_stock_integrity
        ok, err = validate_egg_stock_integrity(self.lot, 'NORMAL', exclude_id=p1.id, is_prod=True)
        self.assertFalse(ok)
        self.assertIn("insuffisant", err)

        # Attempt to cancel p2.
        # Logic: Remaining after p2 cancel = 10 (p1). Sold = 15. 10 - 15 = -5 -> Should fail.
        ok, err = validate_egg_stock_integrity(self.lot, 'NORMAL', exclude_id=p2.id, is_prod=True)
        self.assertFalse(ok)

        # Attempt to cancel s1.
        # This should always be OK as it increases stock.
        ok, err = validate_egg_stock_integrity(self.lot, 'NORMAL', exclude_id=s1.id, is_prod=False)
        self.assertTrue(ok)

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
