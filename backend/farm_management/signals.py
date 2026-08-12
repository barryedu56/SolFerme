import re
from django.utils import timezone
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.db import models
from django.db.models import Sum, F
from .models import (
    Sale, Feed, HealthRecord, ChickenMovement, Employee,
    Expense, FeedInventory, HealthInventory, FeedPurchase,
    HealthPurchase, Payroll, Lot, HealthAlert, PreparedFeedInventory,
    FeedPreparation, FeedPreparationIngredient, Reminder, Bonus
)

# --- HELPERS DE RECALCUL GLOBAL ---

def recalculate_lot_quantity(lot):
    """Recalcule la quantité actuelle de poules (Source de Vérité)."""
    active_movements = lot.movements.filter(status='ACTIVE')
    total_added = active_movements.filter(type='AJOUT').aggregate(Sum('quantity'))['quantity__sum'] or 0
    total_dead = active_movements.filter(type='MORT').aggregate(Sum('quantity'))['quantity__sum'] or 0
    total_sold = active_movements.filter(type='VENTE').aggregate(Sum('quantity'))['quantity__sum'] or 0

    new_quantity = lot.initial_quantity + total_added - total_dead - total_sold
    lot.current_quantity = max(0, new_quantity)

    # Gestion automatique du statut et motif de fin
    if lot.current_quantity == 0 and lot.status == 'ACTIF':
        lot.status = 'TERMINE'
        # Déterminer le motif : analyser les proportions pour éviter les faux positifs
        initial_plus_added = lot.initial_quantity + total_added
        if initial_plus_added > 0:
            sold_ratio = total_sold / initial_plus_added
            dead_ratio = total_dead / initial_plus_added
            if sold_ratio >= 0.5 and total_sold >= total_dead:
                lot.motif_fin = 'VENTE_TOTALE'
            elif dead_ratio >= 0.7:
                lot.motif_fin = 'MORTALITE_TOTALE'
            else:
                lot.motif_fin = 'FIN_ELEVAGE'
        else:
            lot.motif_fin = 'FIN_ELEVAGE'
    elif lot.current_quantity > 0 and lot.status == 'TERMINE':
        # Réactivation automatique si on annule une sortie et qu'il reste des poules
        lot.status = 'ACTIF'
        lot.motif_fin = None

    lot.save(update_fields=['current_quantity', 'status', 'motif_fin'])

def recalculate_feed_inventory(lot, feed_type):
    """Recalcule le stock de matières premières (Raw Materials)."""
    total_purchased = FeedPurchase.objects.filter(
        lot=lot, feed_type=feed_type, status='ACTIVE'
    ).aggregate(Sum('quantity_kg'))['quantity_kg__sum'] or 0

    total_used_in_preparations = FeedPreparationIngredient.objects.filter(
        preparation__lot=lot, material_name=feed_type, preparation__status='ACTIVE'
    ).aggregate(Sum('quantity_used_kg'))['quantity_used_kg__sum'] or 0

    inventory, _ = FeedInventory.objects.get_or_create(lot=lot, feed_type=feed_type)
    inventory.quantity_kg = max(0, float(total_purchased) - float(total_used_in_preparations))
    inventory.save()

def recalculate_prepared_feed_inventory(lot, feed_name):
    """Recalcule le stock d'aliment préparé (Source de Vérité)."""
    total_produced = FeedPreparation.objects.filter(
        lot=lot, feed_name=feed_name, status='ACTIVE'
    ).aggregate(Sum('quantity_produced_kg'))['quantity_produced_kg__sum'] or 0

    total_distributed = Feed.objects.filter(
        lot=lot, feed_type=feed_name, status='ACTIVE'
    ).aggregate(Sum('quantity_kg'))['quantity_kg__sum'] or 0

    inventory, _ = PreparedFeedInventory.objects.get_or_create(lot=lot, feed_name=feed_name)
    inventory.quantity_kg = max(0, float(total_produced) - float(total_distributed))
    inventory.save()

def recalculate_health_inventory(lot, product_name):
    """Recalcule le stock de produits de santé avec une unité fixe."""
    purchase_info = HealthPurchase.objects.filter(
        lot=lot, product_name=product_name, status='ACTIVE'
    ).order_by('-date').first()

    if not purchase_info:
        # Si plus d'achats actifs, on peut mettre le stock à 0
        HealthInventory.objects.filter(lot=lot, product_name=product_name).update(quantity=0)
        return

    total_purchased = HealthPurchase.objects.filter(
        lot=lot, product_name=product_name, status='ACTIVE'
    ).aggregate(Sum('quantity'))['quantity__sum'] or 0

    total_consumed = HealthRecord.objects.filter(
        lot=lot, product_name=product_name, status='ACTIVE'
    ).aggregate(Sum('quantity'))['quantity__sum'] or 0

    inventory, _ = HealthInventory.objects.get_or_create(lot=lot, product_name=product_name)
    inventory.quantity = max(0, float(total_purchased) - float(total_consumed))
    inventory.product_type = purchase_info.product_type
    inventory.unit = purchase_info.unit
    inventory.save()

# --- RÉCEPTEURS (SIGNALS) ---

@receiver(post_save, sender=Sale)
@receiver(post_delete, sender=Sale)
def handle_sale_change(sender, instance, **kwargs):
    """
    Synchronise le stock de poules si la vente est de type 'CHICKEN'.
    Gère automatiquement la création/mise à jour du mouvement associé.
    """
    if instance.product_type == 'CHICKEN':
        if instance.status == 'ACTIVE':
            # Créer ou mettre à jour le mouvement associé
            movement_defaults = {
                'lot': instance.lot,
                'type': 'VENTE',
                'quantity': instance.quantity,
                'date': instance.date,
                'reason': f"Vente à {instance.customer_name or 'Client'}. {instance.note or ''}".strip(),
                'status': 'ACTIVE',
                'created_by': instance.created_by
            }

            if hasattr(instance, 'chicken_movement') and instance.chicken_movement:
                # Mise à jour du mouvement existant
                ChickenMovement.objects.filter(id=instance.chicken_movement.id).update(**movement_defaults)
            else:
                # Création d'un nouveau mouvement
                new_move = ChickenMovement.objects.create(**movement_defaults)
                # Lier le mouvement à la vente (via le OneToOneField dans ChickenMovement)
                new_move.sale = instance
                new_move.save()

        elif instance.status == 'ANNULEE':
            # Annuler le mouvement associé si la vente est annulée
            if hasattr(instance, 'chicken_movement') and instance.chicken_movement:
                ChickenMovement.objects.filter(id=instance.chicken_movement.id).update(status='ANNULEE')

        # Recalculer la quantité du lot (déjà fait par le signal du mouvement si un mouvement est créé/modifié)
        # Mais on appelle au cas où pour être sûr de la synchro sale/movement
        recalculate_lot_quantity(instance.lot)

@receiver(post_save, sender=ChickenMovement)
@receiver(post_delete, sender=ChickenMovement)
def handle_chicken_movement_change(sender, instance, **kwargs):
    recalculate_lot_quantity(instance.lot)

    if kwargs.get('created'):
        alert_type_map = {'MORT': 'MORTALITE', 'MALADE': 'MALADIE', 'GUERI': 'GUERISON', 'AJOUT': 'AJOUT', 'VENTE': 'VENTE'}
        color_map = {'MORT': 'RED', 'MALADE': 'ORANGE', 'GUERI': 'GREEN', 'AJOUT': 'BLUE', 'VENTE': 'PURPLE'}
        HealthAlert.objects.get_or_create(
            movement=instance,
            defaults={
                'farm': instance.lot.farm,
                'lot': instance.lot,
                'type': alert_type_map.get(instance.type),
                'color': color_map.get(instance.type)
            }
        )
    elif instance.status == 'ANNULEE':
        # Nettoyer l'alerte associée quand le mouvement est annulé
        HealthAlert.objects.filter(movement=instance, is_viewed=False).update(
            is_viewed=True,
            viewed_at=timezone.now()
        )

@receiver(post_save, sender=FeedPurchase)
@receiver(post_delete, sender=FeedPurchase)
def handle_feed_purchase_change(sender, instance, **kwargs):
    if instance.lot:
        recalculate_feed_inventory(instance.lot, instance.feed_type)

    # Synchronisation Dépense
    try:
        expense = instance.expense
    except Expense.DoesNotExist:
        expense = None

    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.farm,
            'category': 'ALIMENTATION',
            'description': f"Achat {instance.feed_type} - {instance.quantity_kg}kg",
            'amount': instance.total_price,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        if expense:
            Expense.objects.filter(id=expense.id).update(**expense_defaults)
        else:
            new_expense = Expense.objects.create(**expense_defaults)
            FeedPurchase.objects.filter(id=instance.id).update(expense=new_expense)
    elif instance.status == 'ANNULEE' and expense:
        Expense.objects.filter(id=expense.id).update(status='ANNULEE')

@receiver(post_save, sender=HealthPurchase)
@receiver(post_delete, sender=HealthPurchase)
def handle_health_purchase_change(sender, instance, **kwargs):
    if instance.lot:
        recalculate_health_inventory(instance.lot, instance.product_name)

    # Synchronisation Dépense
    try:
        expense = instance.expense
    except Expense.DoesNotExist:
        expense = None

    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.farm,
            'category': 'SANTE',
            'description': f"Achat {instance.product_name} - {instance.quantity} {instance.unit}",
            'amount': instance.total_price,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        if expense:
            Expense.objects.filter(id=expense.id).update(**expense_defaults)
        else:
            new_expense = Expense.objects.create(**expense_defaults)
            HealthPurchase.objects.filter(id=instance.id).update(expense=new_expense)
    elif instance.status == 'ANNULEE' and expense:
        Expense.objects.filter(id=expense.id).update(status='ANNULEE')

@receiver(post_save, sender=Feed)
@receiver(post_delete, sender=Feed)
def handle_feed_usage_change(sender, instance, **kwargs):
    recalculate_prepared_feed_inventory(instance.lot, instance.feed_type)

@receiver(post_save, sender=FeedPreparation)
@receiver(post_delete, sender=FeedPreparation)
def handle_feed_preparation_change(sender, instance, **kwargs):
    recalculate_prepared_feed_inventory(instance.lot, instance.feed_name)
    # Recalculate all affected raw materials
    materials = instance.ingredients.values_list('material_name', flat=True).distinct()
    for mat in materials:
        recalculate_feed_inventory(instance.lot, mat)

@receiver(post_save, sender=FeedPreparationIngredient)
@receiver(post_delete, sender=FeedPreparationIngredient)
def handle_feed_preparation_ingredient_change(sender, instance, **kwargs):
    recalculate_feed_inventory(instance.preparation.lot, instance.material_name)

@receiver(post_save, sender=HealthRecord)
@receiver(post_delete, sender=HealthRecord)
def handle_health_usage_change(sender, instance, **kwargs):
    recalculate_health_inventory(instance.lot, instance.product_name)

@receiver(post_save, sender=Payroll)
@receiver(post_delete, sender=Payroll)
def handle_payroll_change(sender, instance, **kwargs):
    try:
        if not instance.employee_id or not instance.employee:
            return
    except Exception:
        return

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
    elif instance.status == 'ANNULEE' and instance.expense:
        Expense.objects.filter(id=instance.expense.id).update(status='ANNULEE')

@receiver(post_save, sender=Bonus)
def handle_bonus_change(sender, instance, created, **kwargs):
    """Synchronise une dépense quand une prime est créée ou annulée."""
    if instance.status == 'ACTIVE':
        expense_defaults = {
            'farm': instance.employee.farm,
            'category': 'PRIME',
            'description': f"Prime {instance.get_bonus_type_display()} - {instance.employee.user.name}",
            'amount': instance.amount,
            'date': instance.date,
            'status': 'ACTIVE'
        }
        # On ne crée pas de OneToOne ici car plusieurs primes peuvent correspondre à une dépense groupée
        # On crée simplement une dépense dédiée
        Expense.objects.create(**expense_defaults)
    elif instance.status == 'ANNULEE':
        # Marquer les dépenses liées à cette prime comme annulées
        Expense.objects.filter(
            farm=instance.employee.farm,
            category='PRIME',
            description__icontains=instance.employee.user.name,
            amount=instance.amount,
            date=instance.date,
            status='ACTIVE'
        ).update(status='ANNULEE')


@receiver(post_save, sender=Employee)
def sync_user_active_status(sender, instance, **kwargs):
    user = instance.user
    is_active = (instance.status == 'ACTIF')
    if user.is_active != is_active:
        user.is_active = is_active
        user.save(update_fields=['is_active'])

@receiver(post_save, sender=Lot)
def handle_lot_status_change(sender, instance, **kwargs):
    """
    Automate actions when a Lot status changes.
    - If status becomes TERMINE or ARCHIVE, deactivate all associated reminders.
    """
    if instance.status in ['TERMINE', 'ARCHIVE']:
        # Deactivate reminders associated with this lot
        Reminder.objects.filter(lot=instance, status='PENDING').update(status='INACTIVE')
