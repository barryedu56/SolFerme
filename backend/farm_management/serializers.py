from rest_framework import serializers
from .models import User, Farm, FarmUser, Lot, Production, Sale, Feed, HealthRecord, ChickenMovement, Employee, Expense, Reminder, Payroll, Attendance, Task, ActivityLog, FeedInventory, HealthInventory, FeedPurchase, HealthPurchase

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'phone', 'address', 'profile_image', 'role', 'created_at', 'updated_at', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class FarmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = '__all__'
        read_only_fields = ['owner']

class FarmUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmUser
        fields = '__all__'

class LotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lot
        fields = '__all__'

class ProductionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Production
        fields = '__all__'
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        date = data.get('date', self.instance.date if self.instance else None)
        casiers_vendables = data.get('casiers_vendables', self.instance.casiers_vendables if self.instance else 0)
        casiers_produits = data.get('casiers_produits', self.instance.casiers_produits if self.instance else 0)
        oeufs_casses = data.get('oeufs_casses', self.instance.oeufs_casses if self.instance else 0)

        if lot and date and date < lot.purchase_date:
            raise serializers.ValidationError({"date": "La date de cette action ne peut pas être antérieure à la date de mise en place du lot."})

        if casiers_vendables > casiers_produits:
            raise serializers.ValidationError({"casiers_vendables": "Les casiers vendables ne peuvent pas dépasser les casiers produits."})

        # Si modification, vérifier que la nouvelle quantité vendable cumulée
        # ne descend pas en dessous du total déjà vendu
        if self.instance and lot:
            from django.db.models import Sum
            # Validation pour les œufs normaux
            total_sold_normaux = lot.sales.filter(product_type='Œufs Normaux').aggregate(total=Sum('quantity'))['total'] or 0
            other_produced = lot.productions.exclude(id=self.instance.id).aggregate(total=Sum('casiers_vendables'))['total'] or 0
            if (other_produced + casiers_vendables) < total_sold_normaux:
                raise serializers.ValidationError({
                    "casiers_vendables": f"Impossible de réduire à {casiers_vendables}. Le total vendable ({other_produced + casiers_vendables}) serait inférieur aux ventes déjà réalisées ({total_sold_normaux})."
                })

            # Validation pour les œufs cassés
            total_sold_casses = lot.sales.filter(product_type='Œufs Cassés').aggregate(total=Sum('quantity'))['total'] or 0
            other_casses = lot.productions.exclude(id=self.instance.id).aggregate(total=Sum('oeufs_casses'))['total'] or 0
            total_casses_available_casiers = float(other_casses + oeufs_casses) / 30.0
            if total_casses_available_casiers < total_sold_casses:
                raise serializers.ValidationError({
                    "oeufs_casses": f"Impossible de réduire à {oeufs_casses} œufs. Le total en casiers ({round(total_casses_available_casiers, 2)}) serait inférieur aux ventes déjà réalisées ({total_sold_casses} casiers)."
                })

        return data

class SaleSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        quantity = data.get('quantity', self.instance.quantity if self.instance else 0)
        date = data.get('date', self.instance.date if self.instance else None)
        product_type = data.get('product_type', self.instance.product_type if self.instance else 'Œufs Normaux')

        if lot:
            # Date validation
            if date and date < lot.purchase_date:
                raise serializers.ValidationError({"date": "La date de cette vente ne peut pas être antérieure à la date de mise en place du lot."})

            # Stock validation
            if quantity > 0:
                from django.db.models import Sum
                if product_type == 'Œufs Cassés':
                    # Conversion : 30 œufs cassés = 1 casier pour la vente
                    total_eggs = lot.productions.aggregate(total=Sum('oeufs_casses'))['total'] or 0
                    produced = float(total_eggs) / 30.0
                else:
                    produced = lot.productions.aggregate(total=Sum('casiers_vendables'))['total'] or 0
                
                # Filter sales by product_type
                sales_queryset = lot.sales.filter(product_type=product_type)
                sold = sales_queryset.aggregate(total=Sum('quantity'))['total'] or 0

                # Si modification de la même vente et du même type de produit, on soustrait l'ancienne quantité
                if self.instance and self.instance.product_type == product_type:
                    sold -= self.instance.quantity

                available = produced - sold
                if quantity > available:
                    unit = "casiers"
                    raise serializers.ValidationError({"quantity": f"Stock insuffisant pour effectuer cette vente. Disponible: {round(available, 2)} {unit}."})
                
        return data

class FeedSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Feed
        fields = '__all__'
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        date = data.get('date', self.instance.date if self.instance else None)
        feed_type = data.get('feed_type', self.instance.feed_type if self.instance else None)
        quantity = data.get('quantity_kg', self.instance.quantity_kg if self.instance else 0)

        if lot and date and date < lot.purchase_date:
            raise serializers.ValidationError({"date": "La date de cette action ne peut pas être antérieure à la date de mise en place du lot."})

        if lot and feed_type:
            inventory = FeedInventory.objects.filter(farm=lot.farm, feed_type=feed_type).first()
            available = inventory.quantity_kg if inventory else 0

            # If editing, we add back the current usage to the available stock for validation
            if self.instance and self.instance.feed_type == feed_type:
                available += self.instance.quantity_kg

            if quantity > available:
                raise serializers.ValidationError({
                    "quantity_kg": f"Stock insuffisant pour ce type d'aliment. Disponible: {available}kg."
                })

        return data

class HealthRecordSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = HealthRecord
        fields = '__all__'
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot', self.instance.lot if self.instance else None)
        date = data.get('date', self.instance.date if self.instance else None)
        product_name = data.get('product_name', self.instance.product_name if self.instance else None)
        dose_str = data.get('dose', self.instance.dose if self.instance else "")

        if lot and date and date < lot.purchase_date:
            raise serializers.ValidationError({"date": "La date de cette action ne peut pas être antérieure à la date de mise en place du lot."})

        if lot and product_name:
            inventory = HealthInventory.objects.filter(farm=lot.farm, product_name=product_name).first()
            available = float(inventory.quantity) if inventory else 0

            # Parsing current dose for stock validation
            try:
                current_qty = float(dose_str.split()[0])
            except:
                current_qty = 1.0

            # If editing, we add back the current usage to the available stock for validation
            if self.instance and self.instance.product_name == product_name:
                try:
                    old_qty = float(self.instance.dose.split()[0])
                except:
                    old_qty = 1.0
                available += old_qty

            if current_qty > available:
                raise serializers.ValidationError({
                    "dose": f"Stock insuffisant pour ce produit. Disponible: {available}."
                })

        return data

class ChickenMovementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = ChickenMovement
        fields = '__all__'
        read_only_fields = ['created_by']

    def validate(self, data):
        lot = data.get('lot')
        date = data.get('date')

        if lot and date and date < lot.purchase_date:
            raise serializers.ValidationError({"date": "La date de cette action ne peut pas être antérieure à la date de mise en place du lot."})

        return data

class EmployeeSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.name')
    user_email = serializers.ReadOnlyField(source='user.email')
    user_phone = serializers.ReadOnlyField(source='user.phone')
    user_image = serializers.ImageField(source='user.profile_image', read_only=True)
    farm_name = serializers.ReadOnlyField(source='farm.name')
    lots_detail = LotSerializer(source='lots', many=True, read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'user', 'user_name', 'user_email', 'user_phone', 'user_image', 'farm', 'farm_name', 'lots', 'lots_detail', 'position', 'salary', 'payment_frequency', 'address', 'hired_at', 'status', 'created_at', 'updated_at']

class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = '__all__'

class ReminderSerializer(serializers.ModelSerializer):
    farm_name = serializers.ReadOnlyField(source='farm.name')
    lot_name = serializers.ReadOnlyField(source='lot.name')
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = Reminder
        fields = '__all__'
        read_only_fields = ['created_by']

class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.name')
    class Meta:
        model = ActivityLog
        fields = '__all__'

class PayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    class Meta:
        model = Payroll
        fields = ['id', 'employee', 'employee_name', 'date', 'month', 'base_salary', 'bonus', 'deduction', 'amount_paid', 'status', 'payment_method', 'created_at']

class TaskSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.user.name')
    class Meta:
        model = Task
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = '__all__'

class FeedInventorySerializer(serializers.ModelSerializer):
    farm_name = serializers.ReadOnlyField(source='farm.name')
    class Meta:
        model = FeedInventory
        fields = '__all__'

class HealthInventorySerializer(serializers.ModelSerializer):
    farm_name = serializers.ReadOnlyField(source='farm.name')
    class Meta:
        model = HealthInventory
        fields = '__all__'

class FeedPurchaseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = FeedPurchase
        fields = '__all__'
        read_only_fields = ['created_by']

class HealthPurchaseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    class Meta:
        model = HealthPurchase
        fields = '__all__'
        read_only_fields = ['created_by']
