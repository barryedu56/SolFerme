from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email est requis')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'PROPRIETAIRE')
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('PROPRIETAIRE', 'Propriétaire'),
        ('EMPLOYE', 'Employé'),
    )
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profiles/', blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='PROPRIETAIRE')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    def __str__(self):
        return f"{self.name} ({self.email})"

class Farm(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_farms')
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class FarmUser(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='farm_memberships')
    role = models.CharField(max_length=50, default='Worker') # e.g., Manager, Worker
    created_at = models.DateTimeField(default=timezone.now)

class Lot(models.Model):
    STATUS_CHOICES = (
        ('EN_PREPARATION', 'En préparation'),
        ('EN_PRODUCTION', 'En production'),
        ('TERMINE', 'Terminé'),
        ('VENDU', 'Vendu'),
    )
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='lots')
    name = models.CharField(max_length=255)
    breed = models.CharField(max_length=255)
    initial_quantity = models.IntegerField()
    current_quantity = models.IntegerField()
    purchase_date = models.DateField()
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='EN_PREPARATION')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.farm.name})"

class Production(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='productions')
    date = models.DateField()
    casiers_produits = models.IntegerField()
    casiers_vendables = models.IntegerField()
    oeufs_casses = models.IntegerField(default=0)
    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='productions_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class Sale(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='sales')
    date = models.DateField()
    product_type = models.CharField(max_length=100, default='Œufs Normaux')
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    customer_name = models.CharField(max_length=255, blank=True, null=True)
    customer_phone = models.CharField(max_length=20, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='sales_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class Feed(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='feeds')
    date = models.DateField()
    feed_type = models.CharField(max_length=255, default='Standard')
    quantity_kg = models.DecimalField(max_digits=10, decimal_places=2)
    bags_count = models.IntegerField(default=0)
    cost = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='feeds_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class HealthRecord(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='health_records')
    type = models.CharField(max_length=100) # vaccin, traitement, etc.
    product_name = models.CharField(max_length=255)
    dose = models.CharField(max_length=255, blank=True, null=True)
    date = models.DateField()
    cost = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    veterinarian = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='health_records_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class ChickenMovement(models.Model):
    MOVEMENT_TYPES = (
        ('MORT', 'Mort'),
        ('MALADE', 'Malade'),
        ('GUERI', 'Guéri'),
        ('AJOUT', 'Ajout'),
    )
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='movements')
    type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField()
    date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='movements_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class Employee(models.Model):
    PAYMENT_FREQUENCY_CHOICES = (
        ('MENSUEL', 'Mensuel'),
        ('SEMESTRIEL', 'Semestriel'),
        ('ANNUEL', 'Annuel'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee_profile')
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='employees')
    lots = models.ManyToManyField(Lot, related_name='employees', blank=True)
    position = models.CharField(max_length=255)
    salary = models.DecimalField(max_digits=10, decimal_places=2)
    payment_frequency = models.CharField(max_length=20, choices=PAYMENT_FREQUENCY_CHOICES, default='MENSUEL')
    address = models.TextField(blank=True, null=True)
    hired_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default='ACTIF')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.name} - {self.position}"

class Expense(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='expenses')
    category = models.CharField(max_length=255)
    description = models.TextField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField()

class FeedInventory(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='feed_inventory')
    feed_type = models.CharField(max_length=255)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('farm', 'feed_type')

class HealthInventory(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='health_inventory')
    product_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('farm', 'product_name')

class FeedPurchase(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='feed_purchases')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='feed_purchases')
    date = models.DateField()
    feed_type = models.CharField(max_length=255)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class HealthPurchase(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='health_purchases')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='health_purchases')
    date = models.DateField()
    product_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Reminder(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='reminders')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='reminders')
    title = models.CharField(max_length=255)
    type = models.CharField(max_length=100)
    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    repetition = models.CharField(max_length=50, default='ONCE')
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, default='PENDING')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='reminders_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class ActivityLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activity_logs')
    action = models.CharField(max_length=255) # e.g., "Ajout Production", "Modification Vente"
    module = models.CharField(max_length=100) # e.g., "Production", "Vente", "Santé"
    description = models.TextField()
    date = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.user.name} - {self.action} - {self.date}"

class Payroll(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    date = models.DateField()
    month = models.CharField(max_length=20, null=True, blank=True)
    base_salary = models.DecimalField(max_digits=10, decimal_places=2)
    bonus = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, default='PAID')
    payment_method = models.CharField(max_length=50, default='CASH')
    created_at = models.DateTimeField(auto_now_add=True)

class Task(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    due_date = models.DateField()
    priority = models.CharField(max_length=20, default='MEDIUM')
    status = models.CharField(max_length=20, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

class Attendance(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    status = models.CharField(max_length=20, default='PRESENT')
    note = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('employee', 'date')

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
    except User.DoesNotExist:
        pass

@receiver(post_save, sender=ChickenMovement)
def update_lot_quantity(sender, instance, created, **kwargs):
    if created:
        lot = instance.lot
        if instance.type == 'MORT':
            lot.current_quantity -= instance.quantity
        elif instance.type == 'AJOUT':
            lot.current_quantity += instance.quantity
        lot.save()

@receiver(post_save, sender=Payroll)
def create_payroll_expense(sender, instance, created, **kwargs):
    if created and instance.status == 'PAID':
        Expense.objects.create(
            farm=instance.employee.farm,
            category='SALAIRE',
            description=f"Salaire {instance.date.strftime('%B %Y')} - {instance.employee.user.name}",
            amount=instance.amount_paid,
            date=instance.date
        )

@receiver(post_save, sender=FeedPurchase)
def handle_feed_purchase(sender, instance, created, **kwargs):
    if created:
        # 1. Créer la dépense
        Expense.objects.create(
            farm=instance.farm,
            category='ALIMENTATION',
            description=f"Achat {instance.feed_type} - {instance.quantity_kg}kg",
            amount=instance.total_price,
            date=instance.date
        )
        # 2. Mettre à jour le stock
        inventory, _ = FeedInventory.objects.get_or_create(
            farm=instance.farm,
            feed_type=instance.feed_type
        )
        inventory.quantity_kg += instance.quantity_kg
        inventory.save()

@receiver(post_save, sender=HealthPurchase)
def handle_health_purchase(sender, instance, created, **kwargs):
    if created:
        # 1. Créer la dépense
        Expense.objects.create(
            farm=instance.farm,
            category='SANTE',
            description=f"Achat {instance.product_name} - {instance.quantity} unités",
            amount=instance.total_price,
            date=instance.date
        )
        # 2. Mettre à jour le stock
        inventory, _ = HealthInventory.objects.get_or_create(
            farm=instance.farm,
            product_name=instance.product_name
        )
        inventory.quantity += instance.quantity
        inventory.save()

@receiver(post_save, sender=Feed)
def handle_feed_usage(sender, instance, created, **kwargs):
    if created:
        # Diminuer le stock lors de la distribution
        inventory, _ = FeedInventory.objects.get_or_create(
            farm=instance.lot.farm,
            feed_type=instance.feed_type
        )
        inventory.quantity_kg -= instance.quantity_kg
        inventory.save()

@receiver(post_save, sender=HealthRecord)
def handle_health_usage(sender, instance, created, **kwargs):
    if created:
        # Diminuer le stock lors du traitement
        inventory, _ = HealthInventory.objects.get_or_create(
            farm=instance.lot.farm,
            product_name=instance.product_name
        )
        try:
            # Essayer de parser la dose si c'est un nombre (ex: "2.5 ml")
            qty = float(instance.dose.split()[0])
            inventory.quantity -= qty
        except:
            # Par défaut 1 dose/unité si on ne peut pas parser
            inventory.quantity -= 1
        inventory.save()
