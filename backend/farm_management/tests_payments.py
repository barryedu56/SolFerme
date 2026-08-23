"""Tests du flux d'encaissement / paiements de vente (module Encaisse / Paiements).

Couvre les règles métier de la créance :
  Sc1 : paiement partiel puis re-encaissement → créance décrémentée dynamiquement.
  Sc2 : encaissements successifs.
  Sc3 : encaissement final → statut PAYE.
  Sc4 : refus d'un montant > créance restante (plafond).
  Sc8 : vente entièrement payée → nouveau paiement refusé.
  Sc6 : paiements isolés par vente (aucune fuite entre ventes).
  Sc21: idempotence par référence (pas de double paiement après perte de connexion).
Le montant payé est TOUJOURS dérivé des SalePayment ACTIFS (jamais écrasé).
"""
from django.test import TestCase
from django.utils import timezone
from django.db.models import Sum
from rest_framework.test import APIClient
from .models import User, Farm, Lot, Sale, SalePayment, Production
from .serializers import SalePaymentSerializer


class EncaissementTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='prop@example.com', name='Test Prop', password='password', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm')
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='Isa Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000,
        )
        # Stock suffisant pour les ventes d'œufs
        Production.objects.create(
            lot=self.lot, date=timezone.now().date(),
            casiers_produits=50, casiers_vendables=50, oeufs_casses=0,
            created_by=self.user,
        )

    def _sale(self, total=500000, status='ACTIVE'):
        return Sale.objects.create(
            lot=self.lot, date=timezone.now().date(), product_type='NORMAL',
            quantity=total // 50000, unit_price=50000, total_amount=total,
            amount_paid=0, status=status, created_by=self.user,
        )

    def _pay(self, sale, amount, occurrence=1):
        return SalePayment.objects.create(
            sale=sale, farm=self.farm, lot=self.lot, amount=amount,
            payment_method='CASH', payment_date=timezone.now().date(),
            reference=f'REF-{sale.id}-{occurrence}', created_by=self.user,
        )

    def _sale_amount_paid_and_status(self, sale):
        sale.refresh_from_db()
        return float(sale.amount_paid), sale.payment_status

    def _serializer_errors(self, sale, amount, status='ACTIVE'):
        """Sérialise un paiement et retourne la liste d'erreurs (vide si valide)."""
        data = {
            'sale': sale.id, 'lot': self.lot.id, 'farm': self.farm.id,
            'amount': amount, 'payment_date': str(timezone.now().date()),
        }
        # Simuler la validation : le vendeur passe par la création (pas d'instance).
        class Ser(SalePaymentSerializer):
            class Meta(SalePaymentSerializer.Meta):
                fields = ('sale', 'lot', 'farm', 'amount', 'payment_date', 'status')
        s = Ser(data=data)
        s.is_valid(raise_exception=False)
        return s.errors

    # ---------- Sc1 : paiement initial 200k, créance 300k, encaisser 100k → 200k ----------
    def test_sc1_partial_payment_reduces_creance(self):
        sale = self._sale(500000)
        self.assertEqual(self._sale_amount_paid_and_status(sale), (0.0, 'NON_PAYE'))
        self._pay(sale, 200000)  # paiement initial
        self.assertEqual(self._sale_amount_paid_and_status(sale), (200000.0, 'PARTIELLEMENT_PAYE'))

        # Encaisement de 100 000 → payé 300 000, reste 200 000
        self._pay(sale, 100000, occurrence=2)
        paid, st = self._sale_amount_paid_and_status(sale)
        self.assertEqual(paid, 300000.0)
        self.assertEqual(st, 'PARTIELLEMENT_PAYE')

        # Le montant déjà payé reste 300k, jamais écrasé.
        self.assertEqual(float(sale.payments.filter(status='ACTIVE').aggregate(t=Sum('amount'))['t']), 300000.0)

    # ---------- Sc2 : encaisser encore 150k → payé 450k / Sc3 : 50k → PAYE ----------
    def test_sc2_sc3_successive_payments_until_paid(self):
        sale = self._sale(500000)
        for amt, occ in [(200000, 1), (150000, 2), (50000, 3)]:
            self._pay(sale, amt, occurrence=occ)
        paid, st = self._sale_amount_paid_and_status(sale)
        self.assertEqual(paid, 400000.0)
        self.assertEqual(st, 'PARTIELLEMENT_PAYE')
        self._pay(sale, 100000, occurrence=4)
        paid, st = self._sale_amount_paid_and_status(sale)
        self.assertEqual(paid, 500000.0)
        self.assertEqual(st, 'PAYE')

    # ---------- Sc4 : refuser un montant > créance ----------
    def test_sc4_overpayment_rejected(self):
        sale = self._sale(500000)
        self._pay(sale, 300000)  # reste 200k
        errors = self._serializer_errors(sale, 100000 + 200000 + 1)
        self.assertTrue(errors, 'Le dépassement de créance doit être refusé.')
        # Un paiement de 200k exactement (reste) reste autorisé.
        allowed = self._serializer_errors(sale, 200000)
        self.assertFalse(allowed, f'Paiement exact = reste ne doit PAS être refusé: {allowed}')

    # ---------- Sc8 : vente entièrement payée → refus ----------
    def test_sc8_paid_sale_rejects_more(self):
        sale = self._sale(500000)
        self._pay(sale, 500000)
        self.assertEqual(self._sale_amount_paid_and_status(sale)[1], 'PAYE')
        self.assertTrue(self._serializer_errors(sale, 100), 'Aucun encaissement supplémentaire ne doit passer.')

    # ---------- Sc : annulé → pas d'encaissement ----------
    def test_cancelled_sale_rejects_payment(self):
        sale = self._sale(500000, status='ANNULEE')
        self.assertTrue(self._serializer_errors(sale, 100))

    # ---------- Sc6 : les paiements restent isolés par vente ----------
    def test_sc6_payments_isolated_per_sale(self):
        sale_a = self._sale(500000)
        sale_b = self._sale(800000)
        self._pay(sale_a, 100000)
        self._pay(sale_b, 700000)
        # Chaque vente ne voit QUE ses propres paiements.
        sum_a = float(sale_a.payments.filter(status='ACTIVE').aggregate(t=Sum('amount'))['t'])
        sum_b = float(sale_b.payments.filter(status='ACTIVE').aggregate(t=Sum('amount'))['t'])
        self.assertEqual(sum_a, 100000.0)
        self.assertEqual(sum_b, 700000.0)
        sale_a.refresh_from_db()
        self.assertEqual(float(sale_a.amount_paid), 100000.0)  # pas de fuite de B vers A

    # ---------- Sc21 : idempotence de la création par référence ----------
    def test_sc21_idempotent_create_no_duplicate(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        sale = self._sale(500000)
        payload = {
            'sale': sale.id, 'amount': 100000,
            'payment_method': 'CASH', 'payment_date': str(timezone.now().date()),
            'reference': 'UUID-FIXE-POUR-TEST',  # même référence (cas perte de connexion)
        }
        r1 = client.post('/api/sale-payments/', payload, format='json')
        self.assertEqual(r1.status_code, 201, r1.data)
        r2 = client.post('/api/sale-payments/', payload, format='json')  # re-soumission offline
        self.assertEqual(r2.status_code, 200, r2.data)
        self.assertEqual(r1.data['id'], r2.data['id'], 'Le même paiement doit être retourné (pas de doublon).')
        count = SalePayment.objects.filter(sale=sale, status='ACTIVE').count()
        self.assertEqual(count, 1)
        # La créance doit rester correcte après dédup (100k payés, pas 200k).
        paid, st = self._sale_amount_paid_and_status(sale)
        self.assertEqual(paid, 100000.0)

    # ---------- Le montant déjà payé est dérivé (jamais écrasé par une édition de vente) ----------
    def test_sale_update_does_not_overwrite_amount_paid(self):
        sale = self._sale(500000)
        self._pay(sale, 200000)
        self.assertEqual(float(sale.amount_paid), 200000.0)

        # PUT d'édition de la vente SANS amount_paid (le frontend ne l'envoie plus en édition)
        payload = {
            'lot': self.lot.id, 'customer_name': 'Client Edit', 'product_type': 'NORMAL',
            'date': str(timezone.now().date()), 'quantity': 5, 'unit_price': 100000,
            'total_amount': 500000,
            # 'amount_paid': 0  ← le frontend ne l'envoie plus en édition
        }
        client = APIClient()
        client.force_authenticate(user=self.user)
        r = client.put(f'/api/sales/{sale.id}/', payload, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        sale.refresh_from_db()
        self.assertEqual(float(sale.amount_paid), 200000.0, 'amount_paid ne doit pas être écrasé.')

    def test_serializer_requires_positive_amount(self):
        sale = self._sale(500000)
        errors = self._serializer_errors(sale, 0)
        self.assertTrue(errors)


class ChronologicalValidationTestCase(TestCase):
    """
    Tests des règles chronologiques sur les paiements.
    
    Vérifie si SalePayment enforce que payment_date >= sale.date.
    """
    def setUp(self):
        self.user = User.objects.create_user(
            email='prop@example.com', name='Test Prop', password='password', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='Test Farm')
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='Isa Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=1000,
        )
        Production.objects.create(
            lot=self.lot, date=timezone.now().date(),
            casiers_produits=50, casiers_vendables=50, oeufs_casses=0,
            created_by=self.user,
        )

    def test_payment_before_sale_date_allowed_or_rejected(self):
        """
        Vérifie si paiement AVANT la date de la vente est accepté ou refusé.
        
        Objectif : déterminer si la règle existe réellement.
        """
        from datetime import timedelta
        sale_date = timezone.now().date()
        sale = Sale.objects.create(
            lot=self.lot, date=sale_date, product_type='NORMAL',
            quantity=10, unit_price=50000, total_amount=500000,
            amount_paid=0, status='ACTIVE', created_by=self.user,
        )
        
        payment_before = sale_date - timedelta(days=1)
        try:
            payment = SalePayment.objects.create(
                sale=sale, farm=self.farm, lot=self.lot, amount=100000,
                payment_method='CASH', payment_date=payment_before,
                reference='BEFORE-TEST', created_by=self.user,
            )
            # Si on arrive ici, le paiement avant la vente est accepté
            self.assertTrue(True, "Paiement AVANT la vente est accepté (pas de règle chronologique).")
        except Exception as e:
            # Si une exception, il y a une règle
            self.fail(f"Paiement avant vente rejeté : {str(e)}")

    def test_payment_after_sale_date_allowed(self):
        """
        Vérifie que paiement APRÈS la date de la vente est accepté.
        """
        from datetime import timedelta
        sale_date = timezone.now().date()
        sale = Sale.objects.create(
            lot=self.lot, date=sale_date, product_type='NORMAL',
            quantity=10, unit_price=50000, total_amount=500000,
            amount_paid=0, status='ACTIVE', created_by=self.user,
        )
        
        payment_after = sale_date + timedelta(days=5)
        payment = SalePayment.objects.create(
            sale=sale, farm=self.farm, lot=self.lot, amount=100000,
            payment_method='CASH', payment_date=payment_after,
            reference='AFTER-TEST', created_by=self.user,
        )
        self.assertIsNotNone(payment.id)
        self.assertEqual(float(payment.amount), 100000.0)