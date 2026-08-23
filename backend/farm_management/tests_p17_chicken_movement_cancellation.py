"""Test P1.7 : ChickenMovement annulation doit annuler Sale associée."""
from django.test import TestCase
from django.utils import timezone
from .models import User, Farm, Lot, Production, Sale, ChickenMovement


class ChickenMovementCancellationTestCase(TestCase):
    """P1.7 : Vérifier que l'annulation d'un ChickenMovement VENTE annule sa Sale."""

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

    def test_chicken_movement_vente_cancellation_cascades_to_sale(self):
        """Vérifier que l'annulation d'un ChickenMovement(VENTE) annule aussi la Sale lié."""
        # 1. Créer Production pour avoir du stock
        Production.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            casiers_produits=10,
            casiers_vendables=10,
            created_by=self.user
        )

        # 2. Créer Sale de type CHICKEN (crée automatiquement un ChickenMovement via signal)
        sale = Sale.objects.create(
            lot=self.lot,
            date=timezone.now().date(),
            product_type='CHICKEN',
            quantity=5,
            unit_price=100,
            total_amount=500,
            created_by=self.user
        )

        # 3. Vérifier que ChickenMovement a été créé
        sale.refresh_from_db()
        self.assertIsNotNone(sale.chicken_movement)
        movement = sale.chicken_movement

        # État initial
        self.assertEqual(sale.status, 'ACTIVE')
        self.assertEqual(movement.status, 'ACTIVE')

        # 4. Annuler le ChickenMovement directement
        movement.status = 'ANNULEE'
        movement.save()

        # 5. Vérifier que la Sale est aussi annulée
        sale.refresh_from_db()
        self.assertEqual(
            sale.status, 'ANNULEE',
            "Annuler un ChickenMovement VENTE doit annuler la Sale associée"
        )
