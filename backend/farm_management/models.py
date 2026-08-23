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
    phone = models.CharField(max_length=20, blank=True, null=True, unique=True)
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
    STATUS_CHOICES = (
        ('ACTIF', 'Actif'),
        ('ARCHIVE', 'Archivé'),
    )
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_farms')
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    capacity = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIF')
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
        ('ACTIF', 'Actif'),
        ('TERMINE', 'Terminé'),
        ('ARCHIVE', 'Archivé'),
    )
    FINISH_REASONS = (
        ('VENTE_TOTALE', 'Vente totale des poules'),
        ('MORTALITE_TOTALE', 'Mortalité totale'),
        ('FIN_ELEVAGE', 'Fin d\'élevage'),
        ('MANUEL', 'Terminaison manuelle'),
    )
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='lots')
    name = models.CharField(max_length=255)
    breed = models.CharField(max_length=255)
    initial_quantity = models.IntegerField()
    current_quantity = models.IntegerField()
    purchase_date = models.DateField()
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2) # Now represents total cost
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    subjects_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    extra_expenses = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    real_cost_per_subject = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIF')
    motif_fin = models.CharField(max_length=50, choices=FINISH_REASONS, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Backwards compatibility
        if self.subjects_price is None:
            self.subjects_price = self.purchase_price
        if self.unit_price is None and self.initial_quantity > 0:
            self.unit_price = float(self.subjects_price) / self.initial_quantity
        
        # Calculate totals
        self.purchase_price = float(self.subjects_price) + float(self.extra_expenses)
        if self.initial_quantity > 0:
            self.real_cost_per_subject = float(self.purchase_price) / self.initial_quantity
        else:
            self.real_cost_per_subject = 0
            
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.farm.name})"

class Production(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='productions')
    date = models.DateField()
    casiers_produits = models.IntegerField()
    casiers_vendables = models.IntegerField()
    oeufs_casses = models.IntegerField(default=0)
    note = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='productions_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class Sale(models.Model):
    PRODUCT_TYPES = (
        ('NORMAL', 'Œufs Normaux'),
        ('BROKEN', 'Œufs Cassés'),
        ('CHICKEN', 'Poules'),
    )
    PAYMENT_STATUS_CHOICES = (
        ('NON_PAYE', 'Non Payé'),
        ('PARTIELLEMENT_PAYE', 'Partiellement Payé'),
        ('PAYE', 'Payé'),
    )
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='sales')
    date = models.DateField()
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPES, default='NORMAL')
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    customer_name = models.CharField(max_length=255, blank=True, null=True)
    customer_phone = models.CharField(max_length=20, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='NON_PAYE')
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
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='feeds_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class HealthRecord(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='health_records')
    type = models.CharField(max_length=100) # vaccin, traitement, etc.
    product_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, default='Flacon')
    date = models.DateField()
    cost = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    veterinarian = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='health_records_created')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

class ChickenMovement(models.Model):
    MOVEMENT_TYPES = (
        ('MORT', 'Mort'),
        ('MALADE', 'Malade'),
        ('GUERI', 'Guéri'),
        ('AJOUT', 'Ajout'),
        ('VENTE', 'Vente'),
    )
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='movements')
    type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField()
    date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    sale = models.OneToOneField('Sale', on_delete=models.CASCADE, null=True, blank=True, related_name='chicken_movement')
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
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='expenses_created')

class FeedInventory(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='feed_inventory')
    feed_type = models.CharField(max_length=255) # Now used for Raw Materials
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('lot', 'feed_type')
        verbose_name_plural = "Feed Inventories (Raw Materials)"

class PreparedFeedInventory(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='prepared_feed_inventory')
    feed_name = models.CharField(max_length=255)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('lot', 'feed_name')
        verbose_name_plural = "Prepared Feed Inventories"

class FeedPreparation(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='feed_preparations')
    feed_name = models.CharField(max_length=255)
    quantity_produced_kg = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Préparation {self.feed_name} - {self.quantity_produced_kg}kg le {self.date} ({self.status})"

class FeedPreparationIngredient(models.Model):
    preparation = models.ForeignKey(FeedPreparation, on_delete=models.CASCADE, related_name='ingredients')
    material_name = models.CharField(max_length=255)
    quantity_used_kg = models.DecimalField(max_digits=12, decimal_places=2)

class HealthInventory(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='health_inventory')
    product_name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=100, default='Autre')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, default='Flacon')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('lot', 'product_name')

class FeedPurchase(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='feed_purchases')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='feed_purchases')
    date = models.DateField()
    feed_type = models.CharField(max_length=255)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expense = models.OneToOneField(Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name='feed_purchase_origin')

class HealthPurchase(models.Model):
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='health_purchases')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='health_purchases')
    date = models.DateField()
    product_name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=100, default='Autre')
    quantity = models.DecimalField(max_digits=12, decimal_places=2) # Nombre d'unités achetées
    unit = models.CharField(max_length=50, default='Flacon')
    total_price = models.DecimalField(max_digits=15, decimal_places=2)
    supplier = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expense = models.OneToOneField(Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name='health_purchase_origin')

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
    farm = models.ForeignKey(Farm, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    lot = models.ForeignKey(Lot, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    related_id = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.user.name} - {self.action} - {self.date}"

def compute_period_key(payment_frequency, date_val):
    if not date_val:
        return ""
    if isinstance(date_val, str):
        from datetime import datetime
        try:
            date_val = datetime.strptime(date_val[:10], '%Y-%m-%d').date()
        except ValueError:
            return ""

    freq = (payment_frequency or 'MENSUEL').upper()
    year = date_val.year
    month = date_val.month

    if freq == 'SEMESTRIEL':
        sem = 'S1' if month <= 6 else 'S2'
        return f"{year}-{sem}"
    elif freq == 'ANNUEL':
        return f"{year}"
    else:
        return f"{year}-{month:02d}"

def compute_period_label(payment_frequency, date_val):
    if not date_val:
        return ""
    if isinstance(date_val, str):
        from datetime import datetime
        try:
            date_val = datetime.strptime(date_val[:10], '%Y-%m-%d').date()
        except ValueError:
            return ""

    freq = (payment_frequency or 'MENSUEL').upper()
    year = date_val.year
    month = date_val.month

    MONTH_NAMES_FR = [
        "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]

    if freq == 'SEMESTRIEL':
        return f"Janvier → Juin {year}" if month <= 6 else f"Juillet → Décembre {year}"
    elif freq == 'ANNUEL':
        return f"Année {year}"
    else:
        m_name = MONTH_NAMES_FR[month] if 1 <= month <= 12 else str(month)
        return f"{m_name} {year}"

class Payroll(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    date = models.DateField()
    month = models.CharField(max_length=50, null=True, blank=True)
    period_key = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    base_salary = models.DecimalField(max_digits=10, decimal_places=2)
    bonus = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    payment_method = models.CharField(max_length=50, default='CASH')
    created_at = models.DateTimeField(auto_now_add=True)
    expense = models.OneToOneField(Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name='payroll_origin')

    def save(self, *args, **kwargs):
        try:
            if self.employee_id and self.employee and self.date:
                freq = getattr(self.employee, 'payment_frequency', 'MENSUEL')
                if not self.period_key:
                    self.period_key = compute_period_key(freq, self.date)
                if not self.month:
                    self.month = compute_period_label(freq, self.date)
        except Exception:
            if self.date and not self.period_key:
                self.period_key = compute_period_key('MENSUEL', self.date)
            if self.date and not self.month:
                self.month = compute_period_label('MENSUEL', self.date)
        super().save(*args, **kwargs)

class Bonus(models.Model):
    BONUS_TYPES = (
        ('PERFORMANCE', 'Prime performance'),
        ('EXCEPTIONNEL', 'Prime exceptionnelle'),
        ('AUTRE', 'Autre'),
    )
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('ANNULEE', 'Annulée'),
    )
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='bonuses')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    bonus_type = models.CharField(max_length=20, choices=BONUS_TYPES, default='PERFORMANCE')
    reason = models.TextField(blank=True, null=True)
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='bonuses_created')
    created_at = models.DateTimeField(auto_now_add=True)
    expense = models.OneToOneField(Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name='bonus_origin')

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"Prime {self.bonus_type} - {self.employee.user.name} - {self.amount} GNF"


class Task(models.Model):
    TASK_TYPES = (
        ('SANTE', 'Santé'),
        ('ALIMENTATION', 'Alimentation'),
        ('PRODUCTION', 'Production'),
        ('ENTRETIEN', 'Entretien'),
        ('GESTION_LOT', 'Gestion lot'),
        ('AUTRE', 'Autre'),
    )
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='tasks')
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='tasks', null=True, blank=True)
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='tasks', null=True, blank=True)
    task_type = models.CharField(max_length=20, choices=TASK_TYPES, default='AUTRE')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    due_date = models.DateField()
    due_time = models.TimeField(null=True, blank=True)
    priority = models.CharField(max_length=20, default='MEDIUM')
    status = models.CharField(max_length=20, default='PENDING') # PENDING, COMPLETED, OVERDUE
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='tasks_created')
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Attendance(models.Model):
    STATUS_CHOICES = (
        ('PRESENT', 'Présent'),
        ('ABSENT', 'Absent'),
        ('RETARD', 'Retard'),
    )
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField(default=timezone.now)
    clock_in = models.TimeField(null=True, blank=True)
    clock_out = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PRESENT')
    note = models.TextField(blank=True, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='attendance_corrections')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('employee', 'date', 'lot')
        ordering = ['-date', '-clock_in']
        verbose_name = "Pointage"
        verbose_name_plural = "Pointages"

    def __str__(self):
        return f"{self.employee.user.name} - {self.date} - {self.status}"

class EmployeeRequest(models.Model):
    TYPE_CHOICES = (
        ('CONGE', 'Congé'),
        ('PERMISSION', 'Permission'),
        ('MATERIEL', 'Matériel'),
        ('PROBLEME_ELEVAGE', 'Problème élevage'),
        ('AUTRE', 'Autre'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'En attente'),
        ('APPROVED', 'Acceptée'),
        ('REJECTED', 'Refusée'),
    )
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='requests')
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='employee_requests')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Demande {self.type} - {self.employee.user.name} ({self.status})"

class HealthAlert(models.Model):
    ALERT_TYPES = (
        ('MORTALITE', 'Mortalité'),
        ('MALADIE', 'Maladie'),
        ('GUERISON', 'Guérison'),
        ('AJOUT', 'Ajout'),
        ('VENTE', 'Vente'),
    )
    PRIORITY_COLORS = (
        ('RED', 'Rouge'),
        ('ORANGE', 'Orange'),
        ('GREEN', 'Vert'),
        ('BLUE', 'Bleu'),
        ('PURPLE', 'Violet'),
    )
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='health_alerts')
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='health_alerts')
    movement = models.OneToOneField(ChickenMovement, on_delete=models.CASCADE, related_name='health_alert')
    type = models.CharField(max_length=20, choices=ALERT_TYPES)
    color = models.CharField(max_length=20, choices=PRIORITY_COLORS)
    is_viewed = models.BooleanField(default=False)
    viewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='viewed_alerts')
    viewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} - {self.lot.name} - {self.created_at}"

class PasswordResetCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_codes')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"Code for {self.user.email} - {self.code}"

class EggConversion(models.Model):
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('ANNULEE', 'Annulée'),
    )
    production = models.ForeignKey(Production, on_delete=models.CASCADE, related_name='conversions')
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='egg_conversions')
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='egg_conversions')
    quantity = models.IntegerField()
    from_state = models.CharField(max_length=50, default='EN_ATTENTE')
    to_state = models.CharField(max_length=50, default='VENDABLE')
    conversion_date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Conversion {self.quantity} ({self.from_state}→{self.to_state}) - Prod #{self.production_id}"

@receiver(post_save, sender=Lot)
def handle_lot_creation(sender, instance, created, **kwargs):
    # Logique optionnelle pour le lot si besoin
    pass

class LotExpense(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='lot_expenses')
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.amount}"

@receiver(post_save, sender=LotExpense)
@receiver(post_delete, sender=LotExpense)
def handle_lot_expense_change(sender, instance, **kwargs):
    lot = instance.lot
    if lot:
        expenses_total = lot.lot_expenses.aggregate(models.Sum('amount'))['amount__sum'] or 0
        lot.extra_expenses = expenses_total
        # Trigger Lot save to recalculate costs
        lot.save()

class SalePayment(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='payments')
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='sale_payments')
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='sale_payments')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    payment_method = models.CharField(max_length=50, default='CASH')
    payment_date = models.DateField()
    reference = models.CharField(max_length=255, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=(('ACTIVE', 'Active'), ('ANNULEE', 'Annulée')), default='ACTIVE')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='sale_payments_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Paiement de {self.amount} pour Vente #{self.sale_id}"

@receiver(post_save, sender=SalePayment)
@receiver(post_delete, sender=SalePayment)
def handle_sale_payment_change(sender, instance, **kwargs):
    sale = instance.sale
    if sale:
        payments = sale.payments.filter(status='ACTIVE')
        total_paid = payments.aggregate(models.Sum('amount'))['amount__sum'] or 0
        sale.amount_paid = total_paid

        if float(total_paid) >= float(sale.total_amount):
            sale.payment_status = 'PAYE'
        elif float(total_paid) > 0:
            sale.payment_status = 'PARTIELLEMENT_PAYE'
        else:
            sale.payment_status = 'NON_PAYE'
            
        # Avoid recursion if saving Sale triggers anything, though currently it doesn't
        sale.save(update_fields=['amount_paid', 'payment_status', 'updated_at'])
