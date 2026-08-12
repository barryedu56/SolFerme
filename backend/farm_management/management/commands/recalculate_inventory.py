from django.core.management.base import BaseCommand
from farm_management.models import FeedPreparation, Feed, PreparedFeedInventory, HealthRecord, HealthPurchase, HealthInventory


class Command(BaseCommand):
    help = 'Recalculate inventory from existing feed preparations and distributions'

    def handle(self, *args, **options):
        self.stdout.write('Recalculating prepared feed inventory...')
        
        # Reset all prepared feed inventory
        PreparedFeedInventory.objects.all().delete()
        
        # Recalculate from feed preparations
        preparations = FeedPreparation.objects.filter(status='ACTIVE')
        for prep in preparations:
            inventory, created = PreparedFeedInventory.objects.get_or_create(
                lot=prep.lot,
                feed_name=prep.feed_name,
                defaults={'quantity_kg': 0}
            )
            inventory.quantity_kg += prep.quantity_produced_kg
            inventory.save()
            self.stdout.write(f'Added {prep.quantity_produced_kg}kg of {prep.feed_name} to lot {prep.lot.name}')
        
        # Subtract from feed distributions
        feeds = Feed.objects.filter(status='ACTIVE')
        for feed in feeds:
            try:
                inventory = PreparedFeedInventory.objects.get(
                    lot=feed.lot,
                    feed_name=feed.feed_type
                )
                inventory.quantity_kg -= feed.quantity_kg
                if inventory.quantity_kg < 0:
                    inventory.quantity_kg = 0
                inventory.save()
                self.stdout.write(f'Subtracted {feed.quantity_kg}kg of {feed.feed_type} from lot {feed.lot.name}')
            except PreparedFeedInventory.DoesNotExist:
                self.stdout.write(f'Warning: No inventory found for {feed.feed_type} in lot {feed.lot.name}')
        
        self.stdout.write('Recalculating health inventory...')
        
        # Reset all health inventory
        HealthInventory.objects.all().delete()
        
        # Recalculate from health purchases
        purchases = HealthPurchase.objects.filter(status='ACTIVE')
        for purchase in purchases:
            inventory, created = HealthInventory.objects.get_or_create(
                lot=purchase.lot,
                product_name=purchase.product_name,
                product_type=purchase.product_type,
                unit=purchase.unit,
                defaults={'quantity': 0}
            )
            inventory.quantity += purchase.quantity
            inventory.save()
            self.stdout.write(f'Added {purchase.quantity} {purchase.unit} of {purchase.product_name} to lot {purchase.lot.name}')
        
        # Subtract from health records
        records = HealthRecord.objects.filter(status='ACTIVE')
        for record in records:
            try:
                inventory = HealthInventory.objects.get(
                    lot=record.lot,
                    product_name=record.product_name
                )
                inventory.quantity -= record.quantity
                if inventory.quantity < 0:
                    inventory.quantity = 0
                inventory.save()
                self.stdout.write(f'Subtracted {record.quantity} {record.unit} of {record.product_name} from lot {record.lot.name}')
            except HealthInventory.DoesNotExist:
                self.stdout.write(f'Warning: No inventory found for {record.product_name} in lot {record.lot.name}')
        
        self.stdout.write(self.style.SUCCESS('Inventory recalculation completed successfully!'))
