from django.core.management.base import BaseCommand
from django.db import transaction
from farm_management.models import HealthRecord, HealthPurchase, HealthInventory, Farm
from farm_management.signals import recalculate_health_inventory

class Command(BaseCommand):
    help = 'Normalizes health product names and initializes inventory'

    def handle(self, *args, **options):
        self.stdout.write("Starting Health Data Normalization...")

        with transaction.atomic():
            farms = Farm.objects.all()
            for farm in farms:
                # 1. Get all unique names
                record_names = list(HealthRecord.objects.filter(lot__farm=farm).values_list('product_name', flat=True))
                purchase_names = list(HealthPurchase.objects.filter(farm=farm).values_list('product_name', flat=True))
                all_names = set(record_names + purchase_names)

                for raw_name in all_names:
                    canonical_name = raw_name.strip().title() # Use Title Case as standard

                    # Update Records
                    HealthRecord.objects.filter(lot__farm=farm, product_name=raw_name).update(product_name=canonical_name)

                    # Update Purchases
                    HealthPurchase.objects.filter(farm=farm, product_name=raw_name).update(product_name=canonical_name)

                    # Ensure Inventory Entry
                    inventory, created = HealthInventory.objects.get_or_create(
                        farm=farm,
                        product_name=canonical_name,
                        defaults={'product_type': 'Autre'}
                    )

                    if created:
                        self.stdout.write(f"  Created inventory entry for: {canonical_name}")

                # 2. Trigger recalculation for all products in this farm
                distinct_products = HealthInventory.objects.filter(farm=farm).values_list('product_name', flat=True)
                for prod in distinct_products:
                    recalculate_health_inventory(farm, prod)

            self.stdout.write(self.style.SUCCESS("Normalization and recalculation successful."))
