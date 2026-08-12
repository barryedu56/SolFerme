from django.core.management.base import BaseCommand
from farm_management.models import HealthRecord, HealthPurchase, HealthInventory, Farm
from django.db.models import Sum
import re

class Command(BaseCommand):
    help = 'Audits HealthRecord and HealthPurchase names to normalize inventory'

    def handle(self, *args, **options):
        self.stdout.write("Starting Health Inventory Audit...")

        farms = Farm.objects.all()
        for farm in farms:
            self.stdout.write(f"\nAuditing Farm: {farm.name}")

            # 1. Get all unique product names from Records and Purchases
            record_names = set(HealthRecord.objects.filter(lot__farm=farm).values_list('product_name', flat=True))
            purchase_names = set(HealthPurchase.objects.filter(farm=farm).values_list('product_name', flat=True))
            all_names = record_names.union(purchase_names)

            if not all_names:
                self.stdout.write("  No health products found.")
                continue

            self.stdout.write(f"  Found {len(all_names)} unique product names in history.")

            # 2. Group by normalized name (lowercase, stripped)
            normalized_map = {}
            for name in all_names:
                norm = name.strip().lower()
                if norm not in normalized_map:
                    normalized_map[norm] = []
                normalized_map[norm].append(name)

            # 3. Report potential duplicates
            for norm, variations in normalized_map.items():
                if len(variations) > 1:
                    self.stdout.write(self.style.WARNING(f"  Potential duplicates for '{norm}': {variations}"))

                # Check if an inventory item exists
                inventory_exists = HealthInventory.objects.filter(farm=farm, product_name__iexact=norm).exists()
                if not inventory_exists:
                    self.stdout.write(self.style.NOTICE(f"  Missing inventory entry for: '{variations[0]}'"))
                    # We could auto-create it here if desired, but audit first is safer.

            # 4. Show summary of current inventory vs history
            self.stdout.write("\n  Current Inventory Status:")
            inventory_items = HealthInventory.objects.filter(farm=farm)
            for item in inventory_items:
                self.stdout.write(f"    - {item.product_name} ({item.product_type}): {item.quantity}")

        self.stdout.write(self.style.SUCCESS("\nAudit complete."))
