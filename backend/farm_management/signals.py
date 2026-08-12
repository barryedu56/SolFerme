from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from .models import (
    Sale, Feed, HealthRecord, ChickenMovement, Employee,
    Expense, FeedInventory, HealthInventory, FeedPurchase,
    HealthPurchase, Payroll, Lot, HealthAlert
)

def get_old_instance(instance):
    if not instance.pk:
        return None
    try:
        return instance.__class__.objects.get(pk=instance.pk)
    except instance.__class__.DoesNotExist:
        return None

# --- ChickenMovement ---
@receiver(pre_save, sender=ChickenMovement)
def capture_old_movement(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=ChickenMovement)
def handle_chicken_movement_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)
    lot = instance.lot

    # Reverse old impact
    if old and old.status == 'ACTIVE':
        if old.type == 'MORT':
            lot.current_quantity += old.quantity
        elif old.type == 'AJOUT':
            lot.current_quantity -= old.quantity

    # Apply new impact
    if instance.status == 'ACTIVE':
        if instance.type == 'MORT':
            lot.current_quantity -= instance.quantity
        elif instance.type == 'AJOUT':
            lot.current_quantity += instance.quantity

    lot.save()

    if created:
        alert_type_map = {'MORT': 'MORTALITE', 'MALADE': 'MALADIE', 'GUERI': 'GUERISON', 'AJOUT': 'AJOUT'}
        color_map = {'MORT': 'RED', 'MALADE': 'ORANGE', 'GUERI': 'GREEN', 'AJOUT': 'BLUE'}
        HealthAlert.objects.get_or_create(
            movement=instance,
            defaults={
                'farm': lot.farm,
                'lot': lot,
                'type': alert_type_map.get(instance.type),
                'color': color_map.get(instance.type)
            }
        )

# --- FeedPurchase ---
@receiver(pre_save, sender=FeedPurchase)
def capture_old_feed_purchase(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=FeedPurchase)
def handle_feed_purchase_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)

    # Inventory update
    inventory, _ = FeedInventory.objects.get_or_create(farm=instance.farm, feed_type=instance.feed_type)
    if old and old.status == 'ACTIVE':
        inventory.quantity_kg -= old.quantity_kg
    if instance.status == 'ACTIVE':
        inventory.quantity_kg += instance.quantity_kg
    inventory.save()

    # Expense update
    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.farm,
            'category': 'ALIMENTATION',
            'description': f"Achat {instance.feed_type} - {instance.quantity_kg}kg",
            'amount': instance.total_price,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(**expense_defaults)
        else:
            new_expense = Expense.objects.create(**expense_defaults)
            FeedPurchase.objects.filter(id=instance.id).update(expense=new_expense)
    elif old and old.status == 'ACTIVE' and instance.status == 'ANNULEE':
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(status='ANNULEE')

# --- HealthPurchase ---
@receiver(pre_save, sender=HealthPurchase)
def capture_old_health_purchase(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=HealthPurchase)
def handle_health_purchase_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)

    # Inventory update
    inventory, _ = HealthInventory.objects.get_or_create(farm=instance.farm, product_name=instance.product_name)
    if old and old.status == 'ACTIVE':
        inventory.quantity -= old.quantity
    if instance.status == 'ACTIVE':
        inventory.quantity += instance.quantity
    inventory.save()

    # Expense update
    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.farm,
            'category': 'SANTE',
            'description': f"Achat {instance.product_name} - {instance.quantity} unités",
            'amount': instance.total_price,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(**expense_defaults)
        else:
            new_expense = Expense.objects.create(**expense_defaults)
            HealthPurchase.objects.filter(id=instance.id).update(expense=new_expense)
    elif old and old.status == 'ACTIVE' and instance.status == 'ANNULEE':
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(status='ANNULEE')

# --- Payroll ---
@receiver(pre_save, sender=Payroll)
def capture_old_payroll(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=Payroll)
def handle_payroll_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)

    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.employee.farm,
            'category': 'SALAIRE',
            'description': f"Salaire {instance.date.strftime('%B %Y')} - {instance.employee.user.name}",
            'amount': instance.amount_paid,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(**expense_defaults)
        else:
            new_expense = Expense.objects.create(**expense_defaults)
            Payroll.objects.filter(id=instance.id).update(expense=new_expense)
    elif old and old.status == 'ACTIVE' and instance.status == 'ANNULEE':
        if instance.expense:
            Expense.objects.filter(id=instance.expense.id).update(status='ANNULEE')

# --- Feed usage (Feed model) ---
@receiver(pre_save, sender=Feed)
def capture_old_feed_usage(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=Feed)
def handle_feed_usage_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)
    inventory, _ = FeedInventory.objects.get_or_create(farm=instance.lot.farm, feed_type=instance.feed_type)

    if old and old.status == 'ACTIVE':
        inventory.quantity_kg += old.quantity_kg
    if instance.status == 'ACTIVE':
        inventory.quantity_kg -= instance.quantity_kg
    inventory.save()

# --- Health usage (HealthRecord model) ---
@receiver(pre_save, sender=HealthRecord)
def capture_old_health_usage(sender, instance, **kwargs):
    instance._old_instance = get_old_instance(instance)

@receiver(post_save, sender=HealthRecord)
def handle_health_usage_impact(sender, instance, created, **kwargs):
    old = getattr(instance, '_old_instance', None)
    inventory, _ = HealthInventory.objects.get_or_create(farm=instance.lot.farm, product_name=instance.product_name)

    def get_qty(inst):
        try:
            return float(inst.dose.split()[0])
        except:
            return 1.0

    if old and old.status == 'ACTIVE':
        inventory.quantity += get_qty(old)
    if instance.status == 'ACTIVE':
        inventory.quantity -= get_qty(instance)
    inventory.save()

# --- Employee status sync ---
@receiver(post_save, sender=Employee)
def sync_user_active_status(sender, instance, **kwargs):
    user = instance.user
    is_active = (instance.status == 'ACTIF')
    if user.is_active != is_active:
        user.is_active = is_active
        user.save(update_fields=['is_active'])

@receiver(post_delete, sender=Employee)
def deactivate_user_on_employee_delete(sender, instance, **kwargs):
    try:
        user = instance.user
        if user.is_active:
            user.is_active = False
            user.save(update_fields=['is_active'])
    except:
        pass
