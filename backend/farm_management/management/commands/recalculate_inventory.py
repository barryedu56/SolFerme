from django.core.management.base import BaseCommand
from farm_management.models import (
    FeedPreparation, Feed, PreparedFeedInventory, FeedInventory,
    HealthRecord, HealthPurchase, HealthInventory, FeedPurchase,
    FeedPreparationIngredient,
)
from farm_management.signals import (
    recalculate_feed_inventory,
    recalculate_prepared_feed_inventory,
    recalculate_health_inventory,
)


class Command(BaseCommand):
    help = "Recalcule tous les inventaires (matières 1res, aliment préparé, santé) au niveau FERME"

    def handle(self, *args, **options):
        self.stdout.write('Réinitialisation des inventaires...')
        PreparedFeedInventory.objects.all().delete()
        FeedInventory.objects.all().delete()
        HealthInventory.objects.all().delete()

        # Matières premières : (farm, feed_type) depuis achats + ingrédients de mélange
        pairs = set()
        for fp in FeedPurchase.objects.filter(status='ACTIVE').values_list('farm_id', 'feed_type'):
            pairs.add(fp)
        for ing in FeedPreparationIngredient.objects.filter(
            preparation__status='ACTIVE'
        ).values_list('preparation__farm_id', 'material_name'):
            pairs.add(ing)
        for farm_id, name in pairs:
            recalculate_feed_inventory(_farm(farm_id), name)

        # Aliment préparé : (farm, lot, feed_name) depuis les mélanges + distributions générales
        prep_keys = set()
        for k in FeedPreparation.objects.filter(status='ACTIVE').values_list('farm_id', 'lot_id', 'feed_name'):
            prep_keys.add(k)
        for feed in Feed.objects.filter(status='ACTIVE').select_related('lot'):
            prep_keys.add((feed.lot.farm_id, feed.lot_id, feed.feed_type))
        for farm_id, lot_id, name in prep_keys:
            recalculate_prepared_feed_inventory(_farm(farm_id), _lot(lot_id), name)

        # Santé : (farm, product_name)
        health_pairs = set()
        for k in HealthPurchase.objects.filter(status='ACTIVE').values_list('farm_id', 'product_name'):
            health_pairs.add(k)
        for r in HealthRecord.objects.filter(status='ACTIVE').select_related('lot'):
            health_pairs.add((r.lot.farm_id, r.product_name))
        for farm_id, name in health_pairs:
            recalculate_health_inventory(_farm(farm_id), name)

        self.stdout.write(self.style.SUCCESS('Recalcul des inventaires terminé.'))


_FARM_CACHE = {}
_LOT_CACHE = {}


def _farm(farm_id):
    from farm_management.models import Farm
    if farm_id not in _FARM_CACHE:
        _FARM_CACHE[farm_id] = Farm.objects.filter(id=farm_id).first()
    return _FARM_CACHE[farm_id]


def _lot(lot_id):
    if lot_id is None:
        return None
    from farm_management.models import Lot
    if lot_id not in _LOT_CACHE:
        _LOT_CACHE[lot_id] = Lot.objects.filter(id=lot_id).first()
    return _LOT_CACHE[lot_id]
