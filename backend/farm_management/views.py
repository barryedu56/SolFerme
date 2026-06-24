from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from .models import User, Farm, FarmUser, Lot, Production, Sale, Feed, HealthRecord, ChickenMovement, Employee, Expense, Reminder, Payroll, Attendance, Task, ActivityLog, FeedInventory, HealthInventory, FeedPurchase, HealthPurchase
from .serializers import UserSerializer, FarmSerializer, FarmUserSerializer, LotSerializer, ProductionSerializer, SaleSerializer, FeedSerializer, HealthRecordSerializer, ChickenMovementSerializer, EmployeeSerializer, ExpenseSerializer, ReminderSerializer, PayrollSerializer, AttendanceSerializer, TaskSerializer, ActivityLogSerializer, FeedInventorySerializer, HealthInventorySerializer, FeedPurchaseSerializer, HealthPurchaseSerializer

class IsProprietaire(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'PROPRIETAIRE'

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

class FarmViewSet(viewsets.ModelViewSet):
    serializer_class = FarmSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Farm.objects.filter(owner=user)
        else:
            return Farm.objects.filter(employees__user=user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class LotViewSet(viewsets.ModelViewSet):
    serializer_class = LotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Lot.objects.filter(farm__owner=user)
        else:
            return Lot.objects.filter(employees__user=user)

class ProductionViewSet(viewsets.ModelViewSet):
    serializer_class = ProductionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Production.objects.filter(lot__farm__owner=user)
        else:
            return Production.objects.filter(lot__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Ajout Production",
            module="Production",
            description=f"Ajout de {instance.casiers_produits} casiers pour le lot {instance.lot.name}"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        ActivityLog.objects.create(
            user=self.request.user,
            action="Modification Production",
            module="Production",
            description=f"Lot {new_instance.lot.name}: {old_instance.casiers_produits} -> {new_instance.casiers_produits} casiers (Vendables: {old_instance.casiers_vendables} -> {new_instance.casiers_vendables})"
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        lot = instance.lot
        from django.db.models import Sum

        # Vérification pour les œufs normaux
        total_sold_normaux = lot.sales.filter(product_type='Œufs Normaux').aggregate(total=Sum('quantity'))['total'] or 0
        remaining_produced = lot.productions.exclude(id=instance.id).aggregate(total=Sum('casiers_vendables'))['total'] or 0

        if remaining_produced < total_sold_normaux:
            return Response(
                {"detail": f"Suppression impossible. Cette production est nécessaire pour couvrir les {total_sold_normaux} casiers (Normaux) déjà vendus. Le stock restant ne serait que de {remaining_produced}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Vérification pour les œufs cassés
        total_sold_casses = lot.sales.filter(product_type='Œufs Cassés').aggregate(total=Sum('quantity'))['total'] or 0
        remaining_casses_eggs = lot.productions.exclude(id=instance.id).aggregate(total=Sum('oeufs_casses'))['total'] or 0
        remaining_casses_casiers = float(remaining_casses_eggs) / 30.0

        if remaining_casses_casiers < total_sold_casses:
            return Response(
                {"detail": f"Suppression impossible. Cette production contient des œufs cassés nécessaires pour couvrir les {total_sold_casses} casiers d'œufs cassés déjà vendus. Le stock restant ne serait que de {round(remaining_casses_casiers, 2)} casiers."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def convert_to_vendable(self, request, pk=None):
        production = self.get_object()
        qty_to_convert = int(request.data.get('quantity', 0))

        non_vendables = production.casiers_produits - production.casiers_vendables
        if qty_to_convert <= 0:
            return Response({"error": "La quantité doit être positive."}, status=status.HTTP_400_BAD_REQUEST)
        if qty_to_convert > non_vendables:
            return Response({"error": f"Quantité insuffisante de casiers non vendables ({non_vendables} disponibles)."}, status=status.HTTP_400_BAD_REQUEST)

        production.casiers_vendables += qty_to_convert
        production.save()

        ActivityLog.objects.create(
            user=request.user,
            action="Conversion non vendable vers vendable",
            module="Production",
            description=f"Lot {production.lot.name} (Prod du {production.date}): {qty_to_convert} casiers rendus vendables."
        )

        return Response({"detail": "Conversion réussie", "casiers_vendables": production.casiers_vendables})

class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated, IsProprietaire]

    def get_queryset(self):
        return Sale.objects.filter(lot__farm__owner=self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Vente effectuée",
            module="Vente",
            description=f"Vente de {instance.quantity} casiers à {instance.customer_name} pour {instance.total_amount} GNF"
        )

class FeedViewSet(viewsets.ModelViewSet):
    serializer_class = FeedSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Feed.objects.filter(lot__farm__owner=user)
        else:
            return Feed.objects.filter(lot__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Ajout Alimentation",
            module="Alimentation",
            description=f"Lot {instance.lot.name}: {instance.quantity_kg} kg de {instance.feed_type}"
        )

class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return HealthRecord.objects.filter(lot__farm__owner=user)
        else:
            return HealthRecord.objects.filter(lot__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action=f"Soin: {instance.type}",
            module="Santé",
            description=f"Lot {instance.lot.name}: {instance.product_name} ({instance.cost} GNF)"
        )

class ChickenMovementViewSet(viewsets.ModelViewSet):
    serializer_class = ChickenMovementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return ChickenMovement.objects.filter(lot__farm__owner=user)
        else:
            return ChickenMovement.objects.filter(lot__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action=f"Mouvement: {instance.type}",
            module="Mouvement",
            description=f"Lot {instance.lot.name}: {instance.quantity} sujets. Raison: {instance.reason}"
        )

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Task.objects.filter(employee__farm__owner=user)
        else:
            return Task.objects.filter(employee__user=user)

class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Employee.objects.filter(farm__owner=user)
        else:
            return Employee.objects.filter(user=user)

    def get_permissions(self):
        if self.action in ['destroy', 'create']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        if self.action in ['update', 'partial_update']:
             # On permet la modification si c'est le propriétaire ou si l'employé modifie son propre profil
             return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def perform_update(self, serializer):
        # Sécurité supplémentaire : l'employé ne peut pas modifier certains champs sensibles
        # (salaire, poste, etc.) si implémenté, mais ici on gère principalement l'adresse.
        # Pour l'instant on laisse le serializer filtrer ou on fait confiance à la logique front.
        serializer.save()

    @action(detail=False, methods=['get'])
    def me(self, request):
        try:
            employee = Employee.objects.get(user=request.user)
            serializer = self.get_serializer(employee, context={'request': request})
            return Response(serializer.data)
        except Employee.DoesNotExist:
            return Response({"detail": "Non trouvé."}, status=status.HTTP_404_NOT_FOUND)

class UserInfoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')

        if not user.check_password(old_password):
            return Response({"error": "L'ancien mot de passe est incorrect."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({"detail": "Mot de passe modifié avec succès."}, status=status.HTTP_200_OK)

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated, IsProprietaire]

    def get_queryset(self):
        return Expense.objects.filter(farm__owner=self.request.user)

class ReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Reminder.objects.filter(farm__owner=user) if user.role == 'PROPRIETAIRE' else Reminder.objects.filter(farm__employees__user=user)

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Création Rappel",
            module="Rappel",
            description=f"Rappel: {instance.title} pour le {instance.date}"
        )

class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsProprietaire]

    def get_queryset(self):
        return ActivityLog.objects.all().order_by('-date')

class PayrollViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Payroll.objects.filter(employee__farm__owner=user)
        else:
            return Payroll.objects.filter(employee__user=user)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

class AttendanceViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Attendance.objects.all()
        if user.role == 'PROPRIETAIRE':
            queryset = queryset.filter(employee__farm__owner=user)
        else:
            queryset = queryset.filter(employee__user=user)

        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(date=date)

        employee_id = self.request.query_params.get('employee')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        return queryset

class FeedInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FeedInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return FeedInventory.objects.filter(farm__owner=user)
        else:
            return FeedInventory.objects.filter(farm__employees__user=user)

class HealthInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HealthInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return HealthInventory.objects.filter(farm__owner=user)
        else:
            return HealthInventory.objects.filter(farm__employees__user=user)

class FeedPurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = FeedPurchaseSerializer
    permission_classes = [permissions.IsAuthenticated, IsProprietaire]

    def get_queryset(self):
        return FeedPurchase.objects.filter(farm__owner=self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Achat Alimentation",
            module="Alimentation",
            description=f"Achat de {instance.quantity_kg}kg de {instance.feed_type} pour {instance.total_price} GNF"
        )

class HealthPurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = HealthPurchaseSerializer
    permission_classes = [permissions.IsAuthenticated, IsProprietaire]

    def get_queryset(self):
        return HealthPurchase.objects.filter(farm__owner=self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            action="Achat Santé",
            module="Santé",
            description=f"Achat de {instance.quantity} unités de {instance.product_name} pour {instance.total_price} GNF"
        )
