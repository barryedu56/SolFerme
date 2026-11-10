"""Contrôle chronologique du stock face à un historique déjà incohérent.

Cas réel (Ferme TELLA, nov. 2026) : des mélanges datés de juillet consomment du
Coquillage dont les achats sont datés de septembre. Le stock « passe » sous 0 le
10/07. Avant le correctif, TOUT nouvel achat de Coquillage était refusé (« Le
10/07/2026, stock insuffisant ») alors qu'un achat ne fait qu'ajouter du stock.
Règle : on ne refuse que ce qui CRÉE ou AGGRAVE un manque.
"""
from datetime import date

from django.test import TestCase

from .models import (
    User, Farm, FeedPurchase, FeedPreparation, FeedPreparationIngredient,
)
from .serializers import (
    validate_raw_material_integrity, validate_inventory_integrity, _MockUsage,
)


class StockTimelineTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='t@example.com', name='T', password='pw')
        self.farm = Farm.objects.create(owner=self.user, name='Ferme')

    def _prep(self, d, material, qty):
        prep = FeedPreparation.objects.create(
            farm=self.farm, feed_name='Mélange', quantity_produced_kg=qty, date=d, created_by=self.user,
        )
        FeedPreparationIngredient.objects.create(preparation=prep, material_name=material, quantity_used_kg=qty)
        return prep

    def _purchase(self, d, material, qty):
        return FeedPurchase.objects.create(
            farm=self.farm, date=d, feed_type=material, quantity_kg=qty, total_price=1000, created_by=self.user,
        )

    def _incoherent_history(self):
        # Mélange du 10/07 (6 kg) avant le premier achat (09/09) → déficit de 6 kg au 10/07.
        self._prep(date(2026, 7, 10), 'Coquillage', 6)
        self._purchase(date(2026, 9, 9), 'Coquillage', 1000)

    def test_new_purchase_accepted_despite_past_shortage(self):
        self._incoherent_history()
        mock = FeedPurchase(date=date(2026, 9, 11), quantity_kg=1000, feed_type='Coquillage')
        ok, err = validate_inventory_integrity(self.farm, 'FEED', 'Coquillage', mock_item=mock, is_purchase=True)
        self.assertTrue(ok, err)

    def test_backdated_purchase_accepted_and_fixes_history(self):
        self._incoherent_history()
        mock = FeedPurchase(date=date(2026, 7, 1), quantity_kg=50, feed_type='Coquillage')
        ok, err = validate_raw_material_integrity(self.farm, 'Coquillage', mock_item=mock, is_purchase=True)
        self.assertTrue(ok, err)

    def test_usage_that_deepens_past_shortage_is_refused(self):
        self._incoherent_history()
        # Encore 4 kg consommés le 15/07 : le déficit passe de 6 à 10 kg.
        ok, err = validate_raw_material_integrity(
            self.farm, 'Coquillage', mock_item=_MockUsage(date(2026, 7, 15), 4), is_purchase=False,
        )
        self.assertFalse(ok)
        self.assertIn('15/07/2026', err)

    def test_usage_after_restock_still_checked(self):
        self._incoherent_history()
        # Après l'achat du 09/09 il reste 994 kg : 500 kg passent, 1 500 kg non.
        ok, _ = validate_raw_material_integrity(
            self.farm, 'Coquillage', mock_item=_MockUsage(date(2026, 9, 20), 500), is_purchase=False,
        )
        self.assertTrue(ok)
        ok, err = validate_raw_material_integrity(
            self.farm, 'Coquillage', mock_item=_MockUsage(date(2026, 9, 20), 1500), is_purchase=False,
        )
        self.assertFalse(ok)
        self.assertIn('20/09/2026', err)

    def test_clean_history_unchanged(self):
        self._purchase(date(2026, 9, 1), 'Sel', 10)
        ok, _ = validate_raw_material_integrity(
            self.farm, 'Sel', mock_item=_MockUsage(date(2026, 9, 2), 10), is_purchase=False,
        )
        self.assertTrue(ok)
        ok, err = validate_raw_material_integrity(
            self.farm, 'Sel', mock_item=_MockUsage(date(2026, 9, 2), 11), is_purchase=False,
        )
        self.assertFalse(ok)
        # Une consommation AVANT tout achat reste refusée.
        ok, _ = validate_raw_material_integrity(
            self.farm, 'Sel', mock_item=_MockUsage(date(2026, 8, 1), 1), is_purchase=False,
        )
        self.assertFalse(ok)

    def test_cancelling_needed_purchase_refused(self):
        p = self._purchase(date(2026, 9, 1), 'Poisson', 40)
        self._prep(date(2026, 9, 5), 'Poisson', 37)
        ok, _ = validate_inventory_integrity(self.farm, 'FEED', 'Poisson', exclude_id=p.id, is_purchase=True)
        self.assertFalse(ok)

    def test_reducing_purchase_below_usage_refused(self):
        p = self._purchase(date(2026, 9, 1), 'Poisson', 40)
        self._prep(date(2026, 9, 5), 'Poisson', 37)
        mock = FeedPurchase(date=date(2026, 9, 1), quantity_kg=30, feed_type='Poisson')
        ok, _ = validate_inventory_integrity(self.farm, 'FEED', 'Poisson', exclude_id=p.id, mock_item=mock, is_purchase=True)
        self.assertFalse(ok)
