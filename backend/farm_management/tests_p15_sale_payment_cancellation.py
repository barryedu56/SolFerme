"""Test P1.5 : Annulation Sale doit annuler SalePayments associés."""
from django.test import TestCase
from django.utils import timezone
from .models import User, Farm, Lot, Production, Sale, SalePayment


class SalePaymentCancellationTestCase(TestCase):
    """P1.5 : Vérifier que l'annulation d'une Sale annule aussi ses SalePayments."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='owner@example.com', name='Owner', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm', capacity=1000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='ISA Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=10000,
        )

    def test_sale_cancellation_cascades_to_payments(self):
        """Vérifier que l'annulation d'une Sale annule aussi ses SalePayments."""
        # 1. Créer Production pour avoir du stock
        Production.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            casiers_produits=10,
            casiers_vendables=10,
            created_by=self.user
        )

        # 2. Créer Sale
        sale = Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='NORMAL',
            quantity=5,
            unit_price=100,
            total_amount=500,
            created_by=self.user
        )

        # 3. Créer un SalePayment
        payment = SalePayment.objects.create(
            sale=sale,
            farm=self.farm,
            lot=self.lot,
            payment_date=timezone.now().date(),
            amount=500,
            payment_method='CASH',
            created_by=self.user
        )

        # Vérifier état initial
        self.assertEqual(sale.status, 'ACTIVE')
        self.assertEqual(payment.status, 'ACTIVE')

        # 4. Annuler la Sale
        sale.status = 'ANNULEE'
        sale.save()

        # 5. Vérifier que le Payment est aussi annulé
        payment.refresh_from_db()
        self.assertEqual(
            payment.status, 'ANNULEE',
            "Annuler une Sale doit annuler tous ses SalePayments associés"
        )

    def test_multiple_payments_all_cancelled(self):
        """Vérifier que plusieurs SalePayments sont tous annulés."""
        # Production
        Production.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            casiers_produits=10,
            casiers_vendables=10,
            created_by=self.user
        )

        # Sale
        sale = Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='NORMAL',
            quantity=5,
            unit_price=100,
            total_amount=500,
            created_by=self.user
        )

        # Multiple payments
        p1 = SalePayment.objects.create(
            sale=sale, farm=self.farm, lot=self.lot,
            payment_date=timezone.now().date(), amount=300,
            payment_method='CASH', created_by=self.user
        )
        p2 = SalePayment.objects.create(
            sale=sale, farm=self.farm, lot=self.lot,
            payment_date=timezone.now().date(), amount=200,
            payment_method='CHEQUE', created_by=self.user
        )

        # Cancel sale
        sale.status = 'ANNULEE'
        sale.save()

        # Vérifier que TOUS les paiements sont annulés
        p1.refresh_from_db()
        p2.refresh_from_db()
        self.assertEqual(p1.status, 'ANNULEE')
        self.assertEqual(p2.status, 'ANNULEE')
