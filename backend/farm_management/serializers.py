from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
import re
from rest_framework import serializers
from django.db.models import Sum
from .models import (
    User, Farm, FarmUser, Lot, Production, Sale, SalePayment, Feed, HealthRecord,
    ChickenMovement, Employee, Expense, Reminder, Payroll, Attendance,
    Task, ActivityLog, FeedInventory, HealthInventory, FeedPurchase,
    HealthPurchase, HealthAlert, FeedPreparation, FeedPreparationIngredient,
    PreparedFeedInventory, Bonus, EmployeeRequest, LotExpense, EggConversion,
    compute_period_key, compute_period_label
)

# --- FONCTIONS DE VALIDATION CHRONOLOGIQUE ---

def validate_health_integrity(lot, exclude_id=None, mock_movement=None):
    movements = list(lot.movements.filter(status='ACTIVE').order_by('date', 'id'))
    if exclude_id: movements = [m for m in movements if m.id != exclude_id]
    if mock_movement: movements.append(mock_movement)
    movements.sort(key=lambda x: (x.date, x.id if hasattr(x, 'id') and x.id else float('inf')))

    sick_count = 0
    for m in movements:
        if m.type == 'MALADE': sick_count += m.quantity
        elif m.type == 'GUERI': sick_count -= m.quantity
        if sick_count < 0: return False, f"Le {m.date.strftime('%d/%m/%Y')}, impossible d'enregistrer cette guérison : le nombre de sujets guéris dépasserait le nombre de malades (écart : {abs(sick_count)})."
    return True, None

def validate_bird_stock_integrity(lot, exclude_id=None, mock_movement=None):
    movements = list(lot.movements.filter(status='ACTIVE').order_by('date', 'id'))
    if exclude_id: movements = [m for m in movements if m.id != exclude_id]
    if mock_movement: movements.append(mock_movement)
    movements.sort(key=lambda x: (x.date, x.id if hasattr(x, 'id') and x.id else float('inf')))

    count = lot.initial_quantity
    for m in movements:
        if m.type == 'AJOUT': count += m.quantity
        elif m.type in ['MORT', 'VENTE']: count -= m.quantity
        if count < 0: return False, f"Le {m.date.strftime('%d/%m/%Y')}, opération impossible : le stock de poules deviendrait négatif à cette date."
    return True, None

def validate_egg_stock_integrity(lot, product_type, exclude_id=None, mock_item=None, is_prod=True):
    prods = list(lot.productions.filter(status='ACTIVE').order_by('date', 'id'))
    sales = list(lot.sales.filter(status='ACTIVE', product_type=product_type).order_by('date', 'id'))
    # EggConversions augmentent le stock vendable (to_state='VENDABLE')
    conversions = list(lot.egg_conversions.filter(status='ACTIVE', to_state='VENDABLE').order_by('conversion_date', 'id'))
    if exclude_id:
        if is_prod: prods = [p for p in prods if p.id != exclude_id]
        else: sales = [s for s in sales if s.id != exclude_id]
    if mock_item:
        if is_prod: prods.append(mock_item)
        else: sales.append(mock_item)
    items = []
    for p in prods:
        qty = p.casiers_vendables if product_type == 'NORMAL' else (p.oeufs_casses / 30.0)
        items.append({'date': p.date, 'type': 'PROD', 'qty': qty, 'id': getattr(p, 'id', 0)})
    for c in conversions:
        # Une conversion ajoute des casiers vendables
        if product_type == 'NORMAL':
            items.append({'date': c.conversion_date, 'type': 'CONV', 'qty': float(c.quantity), 'id': c.id})
    for s in sales:
        items.append({'date': s.date, 'type': 'SALE', 'qty': float(s.quantity), 'id': getattr(s, 'id', 0)})
    items.sort(key=lambda x: (x['date'], 0 if x['type'] == 'PROD' else 1 if x['type'] == 'CONV' else 2, x['id'] or float('inf')))
    stock = 0.0
    for it in items:
        if it['type'] in ('PROD', 'CONV'): stock += it['qty']
        else: stock -= it['qty']
        if stock < -0.01:
            label = "normaux" if product_type == 'NORMAL' else "cassés"
            return False, f"Le {it['date'].strftime('%d/%m/%Y')}, stock de casiers {label} insuffisant pour valider cette opération."
    return True, None

def validate_inventory_integrity(lot, item_type, name, exclude_id=None, mock_item=None, is_purchase=True):
    """Validation générique pour Aliments et Santé. Séparée par LOT."""
    if item_type == 'FEED':
        # Check if this is a prepared feed (exists in PreparedFeedInventory)
        from .models import PreparedFeedInventory
        prepared_inventory = PreparedFeedInventory.objects.filter(lot=lot, feed_name=name).first()
        
        if prepared_inventory:
            # Use prepared feed inventory for validation
            current_stock = float(prepared_inventory.quantity_kg)
            if mock_item and not is_purchase:
                # For distribution, subtract the quantity being distributed
                required = float(mock_item.quantity_kg)
                if current_stock < required:
                    return False, f"Le {mock_item.date.strftime('%d/%m/%Y')}, stock de '{name}' insuffisant ({current_stock:.1f} kg disponibles, {required:.1f} requis)."
            return True, None
        
        # Fall back to raw material calculation for non-prepared feeds
        purchases = list(FeedPurchase.objects.filter(lot=lot, feed_type=name, status='ACTIVE').order_by('date', 'id'))
        usages = list(Feed.objects.filter(lot=lot, feed_type=name, status='ACTIVE').order_by('date', 'id'))
    else:
        purchases = list(HealthPurchase.objects.filter(lot=lot, product_name=name, status='ACTIVE').order_by('date', 'id'))
        usages = list(HealthRecord.objects.filter(lot=lot, product_name=name, status='ACTIVE').order_by('date', 'id'))

    if exclude_id:
        if is_purchase: purchases = [p for p in purchases if p.id != exclude_id]
        else: usages = [u for u in usages if u.id != exclude_id]
    if mock_item:
        if is_purchase: purchases.append(mock_item)
        else: usages.append(mock_item)

    combined = []
    for p in purchases:
        qty_in = float(p.quantity_kg if item_type == 'FEED' else p.quantity)
        combined.append({'date': p.date, 'qty': qty_in, 'type': 'IN', 'id': getattr(p, 'id', 0)})
    for u in usages:
        qty = float(u.quantity_kg if item_type == 'FEED' else u.quantity)
        combined.append({'date': u.date, 'qty': qty, 'type': 'OUT', 'id': getattr(u, 'id', 0)})

    combined.sort(key=lambda x: (x['date'], 0 if x['type'] == 'IN' else 1, x['id'] or float('inf')))
    stock = 0.0
    for it in combined:
        if it['type'] == 'IN': stock += it['qty']
        else: stock -= it['qty']
        if stock < -0.01:
            if item_type == 'FEED':
                unite = "kg"
            else:
                unite = "unités"
                try:
                    inv = HealthInventory.objects.filter(lot=lot, product_name=name).first()
                    if inv: unite = inv.unit
                except: pass
            msg = f"Le {it['date'].strftime('%d/%m/%Y')}, stock de '{name}' insuffisant ({stock + it['qty']:.1f} {unite} disponibles, {it['qty']:.1f} requis)."
            return False, msg
    return True, None

def validate_prepared_feed_integrity(lot, feed_name, exclude_id=None, mock_item=None, is_prod=True):
    """Validation chronologique pour l'aliment préparé."""
    prods = list(FeedPreparation.objects.filter(lot=lot, feed_name=feed_name, status='ACTIVE').order_by('date', 'id'))
    distributions = list(Feed.objects.filter(lot=lot, feed_type=feed_name, status='ACTIVE').order_by('date', 'id'))

    if exclude_id:
        if is_prod: prods = [p for p in prods if p.id != exclude_id]
        else: distributions = [d for d in distributions if d.id != exclude_id]

    if mock_item:
        if is_prod: prods.append(mock_item)
        else: distributions.append(mock_item)

    combined = []
    for p in prods:
        combined.append({'date': p.date, 'qty': float(p.quantity_produced_kg), 'type': 'IN', 'id': getattr(p, 'id', 0)})
    for d in distributions:
        combined.append({'date': d.date, 'qty': float(d.quantity_kg), 'type': 'OUT', 'id': getattr(d, 'id', 0)})

    combined.sort(key=lambda x: (x['date'], 0 if x['type'] == 'IN' else 1, x['id'] or float('inf')))
    stock = 0.0
    for it in combined:
        if it['type'] == 'IN': stock += it['qty']
        else: stock -= it['qty']
        if stock < -0.01:
            return False, f"Le {it['date'].strftime('%d/%m/%Y')}, stock de '{feed_name}' insuffisant ({stock + it['qty']:.1f} kg disponibles, {it['qty']:.1f} requis)."
    return True, None

# --- SERIALIZERS ---

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except Exception:
            email = attrs.get("email")
            user = User.objects.filter(email=email).first()
            if not user:
                raise serializers.ValidationError({
                    "detail": "Aucun compte trouvé avec cette adresse email."
                })
            if not user.is_active:
                raise serializers.ValidationError({
                    "detail": "Ce compte est désactivé. Veuillez contacter l'administrateur."
                })
            raise serializers.ValidationError({
                "detail": "Mot de passe incorrect. Veuillez réessayer."
            })

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'phone', 'address', 'profile_image', 'role', 'created_at', 'updated_at', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_role(self, value):
        user = self.context.get('request').user
        if user and user.is_authenticated and user.role != 'PROPRIETAIRE':
            # Si l'utilisateur n'est pas propriétaire, il ne peut pas changer de rôle
            # Sauf lors de la création initiale si AllowAny est utilisé (mais ici create_user gère le défaut)
            if self.instance and self.instance.role != value:
                raise serializers.ValidationError("Seul un propriétaire peut modifier les rôles.")
        return value

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Le mot de passe doit contenir au moins 8 caractères.")
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Le mot de passe doit contenir au moins une lettre majuscule.")
        if not re.search(r'[a-z]', value):
            raise serializers.ValidationError("Le mot de passe doit contenir au moins une lettre minuscule.")
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError("Le mot de passe doit contenir au moins un chiffre.")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', value):
            raise serializers.ValidationError("Le mot de passe doit contenir au moins un caractère spécial.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class FarmSerializer(serializers.ModelSerializer):
    has_data = serializers.SerializerMethodField()

    class Meta:
        model = Farm
        fields = '__all__'
        read_only_fields = ['owner']

    def validate(self, data):
        capacity = data.get('capacity', getattr(self.instance, 'capacity', None))
        if capacity is None:
            return data

        try:
            capacity = int(capacity)
        except (TypeError, ValueError):
            return data

        if capacity < 0:
            raise serializers.ValidationError({"capacity": "La capacité d'une ferme ne peut pas être négative."})

        farm = self.instance
        if farm is not None and capacity > 0:
            current_occupancy = farm.lots.filter(status='ACTIF').aggregate(total=Sum('current_quantity'))['total'] or 0
            if current_occupancy > capacity:
                raise serializers.ValidationError({
                    "capacity": f"La capacité de la ferme ne peut pas être inférieure à son occupation actuelle ({current_occupancy} poules)."
                })

        return data

    def get_has_data(self, obj):
        return (
            obj.lots.exists() or
            obj.expenses.exists() or
            obj.feed_purchases.exists() or
            obj.health_purchases.exists() or
            obj.activity_logs.exists() or
            obj.employees.exists()
        )

class FarmUserSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.name')
    user_email = serializers.ReadOnlyField(source='user.email')
    class Meta:
        model = FarmUser
        fields = '__all__'

class LotExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = LotExpense
        fields = '__all__'

class LotSerializer(serializers.ModelSerializer):
    lot_expenses = LotExpenseSerializer(many=True, read_only=True)
    current_eggs_stock = serializers.SerializerMethodField()
    current_broken_eggs_stock = serializers.SerializerMethodField()
    total_casiers_produits = serializers.SerializerMethodField()
    has_data = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            'id', 'farm', 'name', 'breed', 'initial_quantity',
            'current_quantity', 'purchase_date', 'purchase_price',
            'unit_price', 'subjects_price', 'extra_expenses', 'real_cost_per_subject',
            'supplier', 'status', 'motif_fin', 'created_at', 'updated_at',
            'current_eggs_stock', 'current_broken_eggs_stock', 'total_casiers_produits',
            'has_data', 'lot_expenses'
        ]

    def validate(self, data):
        farm = data.get('farm', self.instance.farm if self.instance else None)
        if farm:
            capacity = getattr(farm, 'capacity', 0) or 0
            if capacity > 0:
                initial_quantity = data.get('initial_quantity', self.instance.initial_quantity if self.instance else None)
                current_quantity = data.get('current_quantity', self.instance.current_quantity if self.instance else None)

                if initial_quantity is None and self.instance is None:
                    initial_quantity = 0
                if current_quantity is None and self.instance is None:
                    current_quantity = 0

                # Quantité proposée pour CE lot (initial_quantity pour création, current_quantity sinon)
                proposed_quantity = max(int(initial_quantity or 0), int(current_quantity or 0))

                # 🔧 SOMME de tous les lots ACTIFS de la ferme (exclure le lot en cours d'édition)
                from .models import Lot
                existing_lots = Lot.objects.filter(farm=farm, status='ACTIF')
                if self.instance:
                    existing_lots = existing_lots.exclude(id=self.instance.id)
                existing_total = existing_lots.aggregate(Sum('current_quantity'))['current_quantity__sum'] or 0

                # Quantité actuelle du lot en cours d'édition (si modification)
                current_instance_qty = self.instance.current_quantity if self.instance else 0

                # Pour une création : total = somme des lots existants + proposed_quantity
                # Pour une modification : total = somme des lots existants + proposed_quantity (le current_qty du lot édité est remplacé)
                total_with_new_lot = existing_total + proposed_quantity

                if total_with_new_lot > capacity:
                    raise serializers.ValidationError(
                        f"Capacité de la ferme dépassée : {existing_total} poules existantes"
                        f" + {proposed_quantity} = {total_with_new_lot} > capacité {capacity}."
                    )

                # Validation supplémentaire : le lot individuel ne peut pas dépasser la capacité non plus
                if proposed_quantity > capacity:
                    raise serializers.ValidationError(
                        f"La quantité du lot ({proposed_quantity}) ne peut pas dépasser la capacité de la ferme ({capacity})."
                    )
        return data

    def get_has_data(self, obj):
        return (
            obj.productions.exists() or
            obj.sales.exists() or
            obj.feeds.exists() or
            obj.health_records.exists() or
            obj.movements.exists() or
            obj.feed_purchases.exists() or
            obj.health_purchases.exists() or
            obj.reminders.exists() or
            obj.tasks.exists() or
            obj.attendances.exists() or
            obj.activity_logs.exists()
        )

    def get_current_eggs_stock(self, obj):
        prods = obj.productions.filter(status='ACTIVE').aggregate(Sum('casiers_vendables'))['casiers_vendables__sum'] or 0
        sales = obj.sales.filter(status='ACTIVE', product_type='NORMAL').aggregate(Sum('quantity'))['quantity__sum'] or 0
        conversions = obj.egg_conversions.filter(status='ACTIVE', to_state='VENDABLE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        return (prods + conversions) - sales

    def get_current_broken_eggs_stock(self, obj):
        # Somme des œufs cassés (unités) convertie en casiers (30 œufs/casier)
        total_broken_eggs = obj.productions.filter(status='ACTIVE').aggregate(Sum('oeufs_casses'))['oeufs_casses__sum'] or 0
        sales = obj.sales.filter(status='ACTIVE', product_type='BROKEN').aggregate(Sum('quantity'))['quantity__sum'] or 0
        return round((total_broken_eggs / 30.0) - float(sales), 2)

    def get_total_casiers_produits(self, obj):
        return obj.productions.filter(status='ACTIVE').aggregate(Sum('casiers_produits'))['casiers_produits__sum'] or 0

class ProductionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    en_attente_actuel = serializers.SerializerMethodField()
    vendables_actuels = serializers.SerializerMethodField()
    conversions = serializers.SerializerMethodField()

    class Meta:
        model = Production
        fields = '__all__'
        read_only_fields = ['created_by']

    def get_en_attente_actuel(self, obj):
        if obj.status == 'ANNULEE':
            return 0
        conversions_sum = obj.conversions.filter(status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        return max(0, obj.casiers_produits - obj.casiers_vendables - conversions_sum)

    def get_vendables_actuels(self, obj):
        if obj.status == 'ANNULEE':
            return 0
        conversions_sum = obj.conversions.filter(status='ACTIVE').aggregate(Sum('quantity'))['quantity__sum'] or 0
        return obj.casiers_vendables + conversions_sum

    def get_conversions(self, obj):
        convs = obj.conversions.filter(status='ACTIVE').order_by('-conversion_date')
        return EggConversionSerializer(convs, many=True).data

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")

        # Validation métier : casiers_vendables ne peut pas dépasser casiers_produits
        casiers_produits = data.get('casiers_produits', self.instance.casiers_produits if self.instance else 0)
        casiers_vendables = data.get('casiers_vendables', self.instance.casiers_vendables if self.instance else 0)
        if casiers_vendables > casiers_produits:
            raise serializers.ValidationError(
                f"Les casiers vendables ({casiers_vendables}) ne peuvent pas dépasser les casiers produits ({casiers_produits})."
            )

        if lot and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mock = Production(date=data.get('date', self.instance.date if self.instance else None), casiers_produits=casiers_produits, casiers_vendables=casiers_vendables, oeufs_casses=data.get('oeufs_casses', self.instance.oeufs_casses if self.instance else 0))
            for pt in ['NORMAL', 'BROKEN']:
                ok, err = validate_egg_stock_integrity(lot, pt, exclude_id=getattr(self.instance, 'id', None), mock_item=mock)
                if not ok: raise serializers.ValidationError(err)
        return data

class EggConversionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    lot = serializers.PrimaryKeyRelatedField(queryset=Lot.objects.all(), required=False)
    farm = serializers.PrimaryKeyRelatedField(queryset=Farm.objects.all(), required=False)
    class Meta:
        model = EggConversion
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def validate(self, data):
        production = data.get('production', self.instance.production if self.instance else None)
        if not production:
            raise serializers.ValidationError("La production est requise.")

        lot = data.get('lot', self.instance.lot if self.instance else None)
        if not lot:
            lot = production.lot
            data['lot'] = lot

        farm = data.get('farm', self.instance.farm if self.instance else None)
        if not farm:
            farm = lot.farm
            data['farm'] = farm

        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")

        if production.status == 'ANNULEE':
            raise serializers.ValidationError("Cette production est annulée. Impossible d'effectuer des conversions.")

        quantity = data.get('quantity', 0)
        if quantity is None or quantity <= 0:
            raise serializers.ValidationError("La quantité doit être un nombre entier positif.")
        if not isinstance(quantity, int):
            try:
                quantity = int(quantity)
            except (ValueError, TypeError):
                raise serializers.ValidationError("La quantité doit être un nombre entier.")
        if quantity <= 0:
            raise serializers.ValidationError("La quantité doit être supérieure à zéro.")

        # Vérifier le stock en attente disponible
        already_converted = EggConversion.objects.filter(
            production=production, status='ACTIVE'
        ).exclude(id=getattr(self.instance, 'id', None)).aggregate(Sum('quantity'))['quantity__sum'] or 0
        en_attente = production.casiers_produits - production.casiers_vendables - already_converted
        if quantity > en_attente:
            raise serializers.ValidationError(
                f"Quantité insuffisante en attente. Disponible : {en_attente} casier(s)."
            )

        # Vérification chronologique du stock d'œufs
        if lot and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            from datetime import date
            conv_date = data.get('conversion_date', self.instance.conversion_date if self.instance else date.today())
            ok, err = validate_egg_stock_integrity(lot, 'NORMAL', exclude_id=None, mock_item=None, is_prod=True)
            if not ok:
                raise serializers.ValidationError(err)

        return data

class SalePaymentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = SalePayment
        fields = '__all__'
        read_only_fields = ['created_by']
        # lot/farm sont dérivés de la vente dans SalePaymentViewSet.perform_create
        # quand ils ne sont pas fournis par le client — ne pas les exiger ici.
        extra_kwargs = {
            'lot': {'required': False},
            'farm': {'required': False},
        }

    def validate(self, data):
        """
        🔒 Règle métier encaissement (créance) :
          1. Montant strictement positif.
          2. On ne peut pas encaisser sur une vente annulée.
          3. La somme des paiements ACTIFS (hors celui modifié) + ce montant
             ne doit PAS dépasser le montant total de la vente.
        Cette règle s'applique à la source de vérité (MySQL) et garantit que
        le montant encaissé ne dépasse jamais la créance restante (#7/#8).
        """
        from django.db.models import Sum

        sale = data.get('sale') or (self.instance.sale if self.instance else None)
        if sale is None:
            return data

        amount = data.get('amount')
        if amount is None and self.instance is not None:
            amount = self.instance.amount
        if amount is not None and float(amount) <= 0:
            raise serializers.ValidationError("Le montant encaissé doit être supérieur à zéro.")
        if amount is None:
            return data

        if sale.status == 'ANNULEE':
            raise serializers.ValidationError(
                "Cette vente est annulée. Impossible d'enregistrer un paiement."
            )

        total_amount = float(sale.total_amount)
        already_paid = float(
            sale.payments.filter(status='ACTIVE').aggregate(t=Sum('amount'))['t'] or 0
        )
        # En édition, ne pas compter le paiement en cours de modification.
        if self.instance is not None and self.instance.status == 'ACTIVE':
            already_paid -= float(self.instance.amount or 0)

        new_total = already_paid + float(amount)
        if new_total > total_amount + 0.001:
            remaining = max(0.0, total_amount - already_paid)
            raise serializers.ValidationError(
                f"Déjà payé {already_paid:g} sur {total_amount:g} (reste {remaining:g} à encaisser). "
                f"Le montant de {float(amount):g} dépasserait la créance restante."
            )
        return data

class SaleSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    payments = serializers.SerializerMethodField()
    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['created_by']

    def get_payments(self, obj):
        active_payments = obj.payments.filter(status='ACTIVE').order_by('-payment_date', '-created_at')
        return SalePaymentSerializer(active_payments, many=True).data

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")

        # Note: Validation of amount_paid vs total_amount is now handled at the payment level

        if lot and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            product_type = data.get('product_type', self.instance.product_type if self.instance else 'NORMAL')
            # Pour les ventes d'œufs, valider le stock d'œufs
            if product_type in ['NORMAL', 'BROKEN']:
                mock = Sale(date=data.get('date', self.instance.date if self.instance else None), quantity=data.get('quantity', self.instance.quantity if self.instance else 0), product_type=product_type)
                ok, err = validate_egg_stock_integrity(lot, product_type, exclude_id=getattr(self.instance, 'id', None), mock_item=mock, is_prod=False)
                if not ok: raise serializers.ValidationError(err)
            # Pour les ventes de poules (CHICKEN), valider le stock de poules
            elif product_type == 'CHICKEN':
                from .models import ChickenMovement
                mock_movement = ChickenMovement(type='VENTE', quantity=data.get('quantity', self.instance.quantity if self.instance else 0), date=data.get('date', self.instance.date if self.instance else None))
                movement_id = self.instance.chicken_movement.id if self.instance and hasattr(self.instance, 'chicken_movement') and self.instance.chicken_movement else None
                ok, err = validate_bird_stock_integrity(lot, exclude_id=movement_id, mock_movement=mock_movement)
                if not ok: raise serializers.ValidationError(err)
        return data

class ChickenMovementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = ChickenMovement
        fields = '__all__'
        read_only_fields = ['created_by']
    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            # Les mouvements (AJOUT/GUERI) peuvent réactiver un lot terminé
            mvt_type = data.get('type', self.instance.type if self.instance else None)
            if mvt_type not in ('AJOUT', 'GUERI'):
                raise serializers.ValidationError("Ce lot est terminé. Utilisez un mouvement AJOUT pour le réactiver.")
        if lot and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mvt_type = data.get('type', self.instance.type if self.instance else None)
            mvt_qty = data.get('quantity', self.instance.quantity if self.instance else 0)

            # 🔧 Validation capacité ferme pour les mouvements AJOUT
            if mvt_type == 'AJOUT' and int(mvt_qty or 0) > 0:
                farm = lot.farm
                capacity = getattr(farm, 'capacity', 0) or 0
                if capacity > 0:
                    from .models import Lot
                    other_lots_total = Lot.objects.filter(farm=farm, status='ACTIF').exclude(id=lot.id).aggregate(Sum('current_quantity'))['current_quantity__sum'] or 0
                    new_total = other_lots_total + (lot.current_quantity or 0) + int(mvt_qty)
                    if new_total > capacity:
                        raise serializers.ValidationError(
                            f"AJOUT refusé : capacité ferme dépassée. "
                            f"{other_lots_total + (lot.current_quantity or 0)} poules existantes + {mvt_qty} = {new_total} > capacité {capacity}."
                        )

            mock = ChickenMovement(type=mvt_type, quantity=mvt_qty, date=data.get('date', self.instance.date if self.instance else None))
            ok, err = validate_health_integrity(lot, exclude_id=getattr(self.instance, 'id', None), mock_movement=mock)
            if not ok: raise serializers.ValidationError(err)
            ok, err = validate_bird_stock_integrity(lot, exclude_id=getattr(self.instance, 'id', None), mock_movement=mock)
            if not ok: raise serializers.ValidationError(err)
        return data

class FeedSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Feed
        fields = '__all__'
        read_only_fields = ['created_by']
    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        f_type = data.get('feed_type', self.instance.feed_type if self.instance else None)
        if lot and f_type and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mock = Feed(date=data.get('date', self.instance.date if self.instance else None), quantity_kg=data.get('quantity_kg', self.instance.quantity_kg if self.instance else 0), feed_type=f_type)
            ok, err = validate_inventory_integrity(lot, 'FEED', f_type, exclude_id=getattr(self.instance, 'id', None), mock_item=mock, is_purchase=False)
            if not ok: raise serializers.ValidationError(err)
        return data

    def create(self, validated_data):
        feed = Feed.objects.create(**validated_data)
        return feed

    def update(self, instance, validated_data):
        # Update the instance
        instance = super().update(instance, validated_data)
        return instance

class FeedPurchaseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = FeedPurchase
        fields = '__all__'
        read_only_fields = ['created_by']
    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        f_type = data.get('feed_type', self.instance.feed_type if self.instance else None)
        if lot and f_type and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mock = FeedPurchase(date=data.get('date', self.instance.date if self.instance else None), quantity_kg=data.get('quantity_kg', self.instance.quantity_kg if self.instance else 0), feed_type=f_type)
            ok, err = validate_inventory_integrity(lot, 'FEED', f_type, exclude_id=getattr(self.instance, 'id', None), mock_item=mock, is_purchase=True)
            if not ok: raise serializers.ValidationError(err)
        return data

    def create(self, validated_data):
        purchase = FeedPurchase.objects.create(**validated_data)
        return purchase

    def update(self, instance, validated_data):
        # Update the instance
        instance = super().update(instance, validated_data)
        return instance

class HealthRecordSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = HealthRecord
        fields = '__all__'
        read_only_fields = ['created_by']
    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        p_name = data.get('product_name', self.instance.product_name if self.instance else None)
        if lot and p_name:
            # Récupérer l'unité et le type du produit si existant dans l'inventaire du LOT
            existing = HealthInventory.objects.filter(lot=lot, product_name=p_name).first()
            if existing:
                data['unit'] = existing.unit

        if lot and p_name and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mock = HealthRecord(
                date=data.get('date', self.instance.date if self.instance else None),
                quantity=data.get('quantity', self.instance.quantity if self.instance else 0),
                product_name=p_name
            )
            ok, err = validate_inventory_integrity(lot, 'HEALTH', p_name, exclude_id=getattr(self.instance, 'id', None), mock_item=mock, is_purchase=False)
            if not ok: raise serializers.ValidationError(err)
        return data

    def create(self, validated_data):
        record = HealthRecord.objects.create(**validated_data)
        return record

    def update(self, instance, validated_data):
        # Update the instance
        instance = super().update(instance, validated_data)
        return instance

class HealthPurchaseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = HealthPurchase
        fields = '__all__'
        read_only_fields = ['created_by']
    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        p_name = data.get('product_name', self.instance.product_name if self.instance else None)

        # S'il s'agit d'un produit existant dans le LOT, on force le type et l'unité
        if lot and p_name:
            existing = HealthInventory.objects.filter(lot=lot, product_name=p_name).first()
            if existing:
                data['product_type'] = existing.product_type
                data['unit'] = existing.unit

        if lot and p_name and data.get('status', self.instance.status if self.instance else 'ACTIVE') == 'ACTIVE':
            mock = HealthPurchase(date=data.get('date', self.instance.date if self.instance else None), quantity=data.get('quantity', self.instance.quantity if self.instance else 0), product_name=p_name)
            ok, err = validate_inventory_integrity(lot, 'HEALTH', p_name, exclude_id=getattr(self.instance, 'id', None), mock_item=mock, is_purchase=True)
            if not ok: raise serializers.ValidationError(err)
        return data

    def create(self, validated_data):
        purchase = HealthPurchase.objects.create(**validated_data)
        return purchase

    def update(self, instance, validated_data):
        # Update the instance
        instance = super().update(instance, validated_data)
        return instance

class EmployeeSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.name')
    user_email = serializers.ReadOnlyField(source='user.email')
    user_image = serializers.SerializerMethodField()
    user_phone = serializers.ReadOnlyField(source='user.phone')
    farm_name = serializers.ReadOnlyField(source='farm.name')
    lots_detail = serializers.SerializerMethodField()
    bonus_total = serializers.SerializerMethodField()
    last_bonus = serializers.SerializerMethodField()
    estimated_total = serializers.SerializerMethodField()

    def get_user_image(self, obj):
        request = self.context.get('request')
        if obj.user and obj.user.profile_image:
            if request:
                return request.build_absolute_uri(obj.user.profile_image.url)
            return obj.user.profile_image.url
        return None

    def get_lots_detail(self, obj):
        return [{'id': lot.id, 'name': lot.name} for lot in obj.lots.all()]

    def get_bonus_total(self, obj):
        result = obj.bonuses.filter(status='ACTIVE').aggregate(total=Sum('amount'))['total']
        return float(result) if result is not None else 0.0

    def get_last_bonus(self, obj):
        last = obj.bonuses.filter(status='ACTIVE').first()  # ordered by -date
        if last:
            return {
                'amount': float(last.amount),
                'bonus_type': last.bonus_type,
                'date': str(last.date),
                'reason': last.reason,
            }
        return None

    def get_estimated_total(self, obj):
        bonus_total = obj.bonuses.filter(status='ACTIVE').aggregate(total=Sum('amount'))['total'] or 0
        salary = obj.salary or 0
        return float(salary) + float(bonus_total)

    def validate(self, data):
        request = self.context.get('request')
        lots = data.get('lots')
        instance = self.instance
        farm = data.get('farm', getattr(instance, 'farm', None))

        if lots is not None:
            if farm is None:
                farm = getattr(instance, 'farm', None)
            invalid_lots = [lot for lot in lots if lot.farm_id != getattr(farm, 'id', None)]
            if invalid_lots:
                raise serializers.ValidationError({"lots": "Les lots assignés doivent appartenir à la même ferme que l'employé."})

        if request and request.user.role != 'PROPRIETAIRE':
            if 'salary' in data:
                raise serializers.ValidationError({"salary": "Seul un propriétaire peut modifier le salaire."})
            if 'lots' in data:
                raise serializers.ValidationError({"lots": "Seul un propriétaire peut modifier les lots assignés."})
        return data

    class Meta:
        model = Employee
        fields = '__all__'

class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['created_by']

class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        return data

class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.name')
    lot_name = serializers.ReadOnlyField(source='lot.name')
    class Meta:
        model = ActivityLog
        fields = '__all__'

class PayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    employee_payment_frequency = serializers.ReadOnlyField(source='employee.payment_frequency')

    class Meta:
        model = Payroll
        fields = '__all__'

    def validate(self, data):
        employee = data.get('employee', getattr(self.instance, 'employee', None))
        date = data.get('date', getattr(self.instance, 'date', None))
        month = data.get('month', getattr(self.instance, 'month', None))
        period_key = data.get('period_key', getattr(self.instance, 'period_key', None))
        status = data.get('status', getattr(self.instance, 'status', 'ACTIVE'))

        if status == 'ACTIVE' and employee and date:
            freq = getattr(employee, 'payment_frequency', 'MENSUEL')
            computed_key = period_key or compute_period_key(freq, date)
            data['period_key'] = computed_key

            if not data.get('month'):
                data['month'] = compute_period_label(freq, date)

            query = Payroll.objects.filter(
                employee=employee,
                period_key=computed_key,
                status='ACTIVE'
            )
            if self.instance and self.instance.pk:
                query = query.exclude(pk=self.instance.pk)

            if query.exists():
                period_display = data.get('month') or computed_key
                raise serializers.ValidationError(
                    f"Un paiement actif existe déjà pour l'employé {employee.user.name} pour la période {period_display}."
                )

        return data

class TaskSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    farm_name = serializers.ReadOnlyField(source='farm.name')
    lot_name = serializers.ReadOnlyField(source='lot.name')
    task_type_label = serializers.SerializerMethodField()

    def get_task_type_label(self, obj):
        return obj.get_task_type_display()

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['created_by']

class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    lot_name = serializers.ReadOnlyField(source='lot.name')
    updated_by_name = serializers.ReadOnlyField(source='updated_by.name')

    class Meta:
        model = Attendance
        fields = [
            'id', 'employee', 'employee_name', 'lot', 'lot_name',
            'date', 'clock_in', 'clock_out', 'status', 'note',
            'updated_by', 'updated_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['updated_by', 'created_at', 'updated_at']

class EmployeeRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    farm_name = serializers.ReadOnlyField(source='farm.name')

    class Meta:
        model = EmployeeRequest
        fields = '__all__'
        read_only_fields = ['employee', 'farm', 'status', 'created_at', 'updated_at']

class FeedInventorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedInventory
        fields = '__all__'

class HealthInventorySerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthInventory
        fields = ['id', 'lot', 'product_name', 'product_type', 'quantity', 'unit', 'updated_at']

class HealthAlertSerializer(serializers.ModelSerializer):
    lot_name = serializers.ReadOnlyField(source='lot.name')
    quantity = serializers.ReadOnlyField(source='movement.quantity')
    date = serializers.ReadOnlyField(source='movement.date')
    created_by_name = serializers.ReadOnlyField(source='movement.created_by.name')
    farm_name = serializers.ReadOnlyField(source='farm.name')

    class Meta:
        model = HealthAlert
        fields = [
            'id', 'farm', 'farm_name', 'lot', 'lot_name',
            'type', 'color', 'is_viewed', 'created_at',
            'quantity', 'date', 'created_by_name'
        ]

class FeedPreparationIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedPreparationIngredient
        fields = ['material_name', 'quantity_used_kg']

class FeedPreparationSerializer(serializers.ModelSerializer):
    ingredients = FeedPreparationIngredientSerializer(many=True)
    created_by_name = serializers.ReadOnlyField(source='created_by.name')

    class Meta:
        model = FeedPreparation
        fields = ['id', 'lot', 'feed_name', 'quantity_produced_kg', 'date', 'status', 'ingredients', 'created_by', 'created_by_name']
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        if lot and lot.status == 'ARCHIVE':
            raise serializers.ValidationError("Ce lot est archivé. Réactivez-le pour effectuer des modifications.")
        if lot and lot.status == 'TERMINE':
            raise serializers.ValidationError("Ce lot est terminé. Réactivez-le pour effectuer des modifications.")
        ingredients = data.get('ingredients', [])

        for ing in ingredients:
            material_name = ing.get('material_name')
            qty_needed = ing.get('quantity_used_kg')

            from .models import FeedInventory
            # Validation par LOT uniquement
            inventory = FeedInventory.objects.filter(lot=lot, feed_type=material_name).first()
            if not inventory or inventory.quantity_kg < qty_needed:
                available = inventory.quantity_kg if inventory else 0
                raise serializers.ValidationError(
                    f"Stock insuffisant pour {material_name} dans ce lot. Disponible: {available}kg, requis: {qty_needed}kg"
                )
        return data

    def create(self, validated_data):
        ingredients_data = validated_data.pop('ingredients')
        preparation = FeedPreparation.objects.create(**validated_data)

        for ingredient_data in ingredients_data:
            FeedPreparationIngredient.objects.create(preparation=preparation, **ingredient_data)

        return preparation


class PreparedFeedInventorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PreparedFeedInventory
        fields = '__all__'

class BonusSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    employee_farm = serializers.ReadOnlyField(source='employee.farm.name')
    bonus_type_label = serializers.SerializerMethodField()

    def get_bonus_type_label(self, obj):
        labels = {
            'PERFORMANCE': 'Prime performance',
            'EXCEPTIONNEL': 'Prime exceptionnelle',
            'AUTRE': 'Autre',
        }
        return labels.get(obj.bonus_type, obj.bonus_type)

    class Meta:
        model = Bonus
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at']
