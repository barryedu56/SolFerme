from django.utils import timezone
from django.conf import settings
from django.db.models import Q, Sum, Count, Avg, F, ExpressionWrapper, DecimalField
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek, ExtractHour
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from .models import (
    User, Farm, FarmUser, Lot, Production, Sale, SalePayment, Feed, HealthRecord,
    ChickenMovement, Employee, Expense, Reminder, Payroll, Attendance,
    Task, ActivityLog, FeedInventory, HealthInventory, FeedPurchase,
    HealthPurchase, HealthAlert, PreparedFeedInventory, FeedPreparation, Bonus,
    EmployeeRequest, PasswordResetCode, LotExpense, EggConversion
)
from .serializers import (
    UserSerializer, FarmSerializer, FarmUserSerializer, LotSerializer,
    ProductionSerializer, SaleSerializer, SalePaymentSerializer, FeedSerializer, HealthRecordSerializer,
    ChickenMovementSerializer, EmployeeSerializer, ExpenseSerializer,
    ReminderSerializer, PayrollSerializer, AttendanceSerializer, TaskSerializer,
    ActivityLogSerializer, FeedInventorySerializer, HealthInventorySerializer,
    FeedPurchaseSerializer, HealthPurchaseSerializer, HealthAlertSerializer,
    PreparedFeedInventorySerializer, FeedPreparationSerializer, BonusSerializer,
    CustomTokenObtainPairSerializer, EmployeeRequestSerializer, LotExpenseSerializer,
    EggConversionSerializer
)

from rest_framework_simplejwt.views import TokenObtainPairView

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

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

def calculate_performance(initial_quantity, current_quantity, sick_quantity, actual_production_eggs, days, expected_rate=0.85):
    if initial_quantity <= 0 or current_quantity <= 0:
        return 0
    survival_rate = min(current_quantity / initial_quantity, 1.0)
    expected_production = current_quantity * expected_rate * days
    production_perf = min(actual_production_eggs / expected_production, 1.1) if expected_production > 0 else 0
    health_factor = max(0.0, (current_quantity - (sick_quantity * 0.5)) / current_quantity)
    performance = production_perf * survival_rate * health_factor * 100
    return max(0, min(round(performance), 100))

class FarmUserViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour les relations FarmUser (membres d'une ferme).
    Expose l'endpoint /farm-users/ pour la synchronisation offline.
    """
    serializer_class = FarmUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            # Propriétaire : toutes les relations de ses fermes
            return FarmUser.objects.filter(farm__owner=user).select_related('farm', 'user')
        else:
            # Employé : uniquement les fermes où il est membre
            return FarmUser.objects.filter(
                farm__in=Farm.objects.filter(employees__user=user)
            ).select_related('farm', 'user')


class FarmViewSet(viewsets.ModelViewSet):
    serializer_class = FarmSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        status_filter = self.request.query_params.get('status')

        if user.role == 'PROPRIETAIRE':
            if self.action in ['retrieve', 'reactivate']:
                queryset = Farm.objects.filter(owner=user)
                if status_filter:
                    queryset = queryset.filter(status=status_filter)
                return queryset
            return Farm.objects.filter(owner=user, status=status_filter or 'ACTIF')
        else:
            return Farm.objects.filter(employees__user=user, status='ACTIF')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Règle SolFerme V1 : Suppression uniquement si aucune donnée métier
        has_data = (
            instance.lots.exists() or
            instance.expenses.exists() or
            instance.feed_purchases.exists() or
            instance.health_purchases.exists() or
            instance.activity_logs.exists() or
            instance.employees.exists() or
            instance.reminders.exists() or
            instance.tasks.exists()
        )

        if has_data:
            return Response(
                {"error": "Cette ferme contient des données historiques. La suppression définitive est désactivée. Veuillez utiliser l'archivage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive une ferme si elle n'a plus de lots actifs"""
        farm = self.get_object()

        if farm.status == 'ARCHIVE':
            return Response(
                {"error": "Cette ferme est déjà archivée."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Business Rule: Pas de lots actifs
        if farm.lots.filter(status='ACTIF').exists():
            return Response(
                {"error": "Impossible d'archiver la ferme : elle contient encore des lots actifs."},
                status=status.HTTP_400_BAD_REQUEST
            )

        farm.status = 'ARCHIVE'
        farm.save()

        # Log l'action
        ActivityLog.objects.create(
            user=request.user,
            farm=farm,
            action="Ferme Archivée",
            module="Gestion Ferme",
            description=f"La ferme {farm.name} a été archivée."
        )

        return Response(
            {"detail": f"La ferme {farm.name} a été archivée avec succès."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        """Réactive une ferme archivée"""
        farm = self.get_object()

        if farm.status == 'ACTIF':
            return Response(
                {"error": "Cette ferme est déjà active."},
                status=status.HTTP_400_BAD_REQUEST
            )

        farm.status = 'ACTIF'
        farm.save()

        # Log l'action
        ActivityLog.objects.create(
            user=request.user,
            farm=farm,
            action="Ferme Réactivée",
            module="Gestion Ferme",
            description=f"La ferme {farm.name} a été réactivée."
        )

        return Response(
            {"detail": f"La ferme {farm.name} a été réactivée avec succès."},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        user = self.request.user
        farms = self.get_queryset()

        # Paramètres de filtrage unifiés (lus une seule fois)
        farm_id = request.query_params.get('farm')
        lot_id = request.query_params.get('lot')
        include_archived = request.query_params.get('include_archived', 'false').lower() == 'true'

        # Appliquer le filtre par ferme si spécifié
        if farm_id:
            farms = Farm.objects.filter(id=farm_id)
            if user.role == 'PROPRIETAIRE':
                farms = farms.filter(owner=user)
            else:
                farms = farms.filter(employees__user=user)
        elif not include_archived:
            # Par défaut, exclure les fermes archivées des stats opérationnelles
            farms = farms.filter(status='ACTIF')

        # Résoudre les lots selon les filtres
        if lot_id:
            all_lots = Lot.objects.filter(id=lot_id, farm__in=farms)
            farms = farms.filter(id__in=all_lots.values_list('farm_id', flat=True)).distinct()
        elif farm_id:
            all_lots = Lot.objects.filter(farm__in=farms)
        else:
            all_lots = Lot.objects.filter(farm__in=farms)

        # Restriction supplémentaire pour les employés : ils ne voient que leurs lots assignés
        if user.role == 'EMPLOYE':
            try:
                assigned_lots = user.employee_profile.lots.all()
                if assigned_lots.exists():
                    all_lots = all_lots.filter(id__in=assigned_lots.values_list('id', flat=True))
            except:
                pass

        # Filtrer les lots actifs pour les statistiques opérationnelles (sauf si include_archived)
        active_lots = all_lots.filter(status='ACTIF') if not include_archived else all_lots

        # Period filtering logic
        period_param = request.query_params.get('period', 'week')
        now = timezone.now()
        if period_param == 'day':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            trunc_func = TruncDate
        elif period_param == 'month':
            start_date = now - timezone.timedelta(days=30)
            trunc_func = TruncDate
        elif period_param == 'year':
            start_date = now - timezone.timedelta(days=365)
            trunc_func = TruncMonth
        else: # week
            start_date = now - timezone.timedelta(days=7)
            trunc_func = TruncDate

        # Filtered data within period for charts and period-based summary (lots actifs uniquement)
        productions_period = Production.objects.filter(lot__in=active_lots, date__gte=start_date.date(), status='ACTIVE')
        sales_period = Sale.objects.filter(lot__in=active_lots, date__gte=start_date.date(), status='ACTIVE')
        expenses_period = Expense.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE')
        feeds_period = Feed.objects.filter(lot__in=active_lots, date__gte=start_date.date(), status='ACTIVE')
        movements_period = ChickenMovement.objects.filter(lot__in=active_lots, date__gte=start_date.date(), status='ACTIVE')

        # Global snapshot (Totals) - lots actifs uniquement
        total_chickens = active_lots.aggregate(total=Sum('current_quantity'))['total'] or 0
        total_initial_chickens = all_lots.aggregate(total=Sum('initial_quantity'))['total'] or 0

        # Movement snapshot
        all_movements = ChickenMovement.objects.filter(lot__in=all_lots, status='ACTIVE')
        total_dead = all_movements.filter(type='MORT').aggregate(total=Sum('quantity'))['total'] or 0
        total_sick = all_movements.filter(type='MALADE').aggregate(total=Sum('quantity'))['total'] or 0
        total_recovered = all_movements.filter(type='GUERI').aggregate(total=Sum('quantity'))['total'] or 0
        current_sick = max(0, total_sick - total_recovered)

        # Performance (average of active lots over last 7 days)
        total_perf = 0
        lots_with_data = 0
        seven_days_ago = (now - timezone.timedelta(days=7)).date()

        for lot in active_lots:
            lot_recent_prods = Production.objects.filter(lot=lot, date__gte=seven_days_ago, status='ACTIVE')
            recent_eggs = (lot_recent_prods.aggregate(total=Sum('casiers_produits'))['total'] or 0) * 30
            days_with_data = lot_recent_prods.values('date').distinct().count() or 1

            lot_movements = ChickenMovement.objects.filter(lot=lot, status='ACTIVE')
            l_total_sick = lot_movements.filter(type='MALADE').aggregate(total=Sum('quantity'))['total'] or 0
            l_recovered = lot_movements.filter(type='GUERI').aggregate(total=Sum('quantity'))['total'] or 0
            l_current_sick = max(0, l_total_sick - l_recovered)

            perf = calculate_performance(lot.initial_quantity, lot.current_quantity, l_current_sick, recent_eggs, days_with_data)
            if perf > 0 or lot_recent_prods.exists():
                total_perf += perf
                lots_with_data += 1
        avg_performance = round(total_perf / lots_with_data) if lots_with_data > 0 else 0

        # Financials within period
        period_revenues = sales_period.aggregate(total=Sum('total_amount'))['total'] or 0
        period_encaissements = sales_period.aggregate(total=Sum('amount_paid'))['total'] or 0
        period_creances = float(period_revenues) - float(period_encaissements)

        egg_revenues_period = sales_period.filter(product_type__in=['NORMAL', 'BROKEN']).aggregate(total=Sum('total_amount'))['total'] or 0
        chicken_revenues_period = sales_period.filter(product_type='CHICKEN').aggregate(total=Sum('total_amount'))['total'] or 0

        period_expense_amount = expenses_period.aggregate(total=Sum('amount'))['total'] or 0
        period_lot_investment = all_lots.filter(purchase_date__gte=start_date.date()).aggregate(total=Sum('purchase_price'))['total'] or 0

        # We need to exclude expenses already linked to FeedPurchase, HealthPurchase or Payroll to avoid double counting if they are duplicated in Expense model
        # Looking at models.py, FeedPurchase/HealthPurchase/Payroll have a OneToOneField(Expense) called 'expense'.

        # Get expense IDs that are linked to these specialized models
        linked_expense_ids = []
        linked_expense_ids.extend(FeedPurchase.objects.filter(farm__in=farms, expense__isnull=False).values_list('expense_id', flat=True))
        linked_expense_ids.extend(HealthPurchase.objects.filter(farm__in=farms, expense__isnull=False).values_list('expense_id', flat=True))
        linked_expense_ids.extend(Payroll.objects.filter(employee__farm__in=farms, expense__isnull=False).values_list('expense_id', flat=True))

        period_standalone_expenses = expenses_period.exclude(id__in=linked_expense_ids).aggregate(total=Sum('amount'))['total'] or 0

        period_feed_purchase_cost = FeedPurchase.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('total_price'))['total'] or 0
        period_health_purchase_cost = HealthPurchase.objects.filter(farm__in=farms, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('total_price'))['total'] or 0
        period_payroll_cost = Payroll.objects.filter(employee__farm__in=farms, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('amount_paid'))['total'] or 0

        period_total_expenses = float(period_standalone_expenses) + float(period_lot_investment) + float(period_feed_purchase_cost) + float(period_health_purchase_cost) + float(period_payroll_cost)

        # Revenue Trend (based on CA / total_amount)
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = (this_month_start - timezone.timedelta(days=1)).replace(day=1)
        this_month_sales = Sale.objects.filter(lot__in=all_lots, date__gte=this_month_start, status='ACTIVE').aggregate(total=Sum('total_amount'))['total'] or 0
        last_month_sales = Sale.objects.filter(lot__in=all_lots, date__gte=last_month_start, date__lt=this_month_start, status='ACTIVE').aggregate(total=Sum('total_amount'))['total'] or 0
        revenue_trend = 0
        if last_month_sales and last_month_sales > 0:
            revenue_trend = round(((float(this_month_sales) - float(last_month_sales)) / float(last_month_sales)) * 100)
        elif this_month_sales and this_month_sales > 0:
            revenue_trend = 100

        # Feed stock
        feed_stock = PreparedFeedInventory.objects.filter(lot__in=all_lots).aggregate(total=Sum('quantity_kg'))['total'] or 0
        raw_material_stock = FeedInventory.objects.filter(lot__in=all_lots).aggregate(total=Sum('quantity_kg'))['total'] or 0

        raw_materials_detail = list(FeedInventory.objects.filter(lot__in=all_lots).values('feed_type').annotate(total=Sum('quantity_kg')))
        prepared_feeds_detail = list(PreparedFeedInventory.objects.filter(lot__in=all_lots).values('feed_name').annotate(total=Sum('quantity_kg')))

        last_preparation = FeedPreparation.objects.filter(lot__in=all_lots).order_by('-date', '-created_at').first()
        last_distribution = Feed.objects.filter(lot__in=all_lots, status='ACTIVE').order_by('-date', '-created_at').first()

        # Bonus statistics (only ACTIVE bonuses)
        total_bonuses = Bonus.objects.filter(employee__farm__in=farms, status='ACTIVE').aggregate(total=Sum('amount'))['total'] or 0
        employees_with_bonuses = Bonus.objects.filter(employee__farm__in=farms, status='ACTIVE').values('employee').distinct().count()

        summary = {
            'farms_count': farms.count(),
            'lots_count': all_lots.count(),
            'initial_birds': total_initial_chickens,
            'current_birds': total_chickens,
            'total_chickens': total_chickens,
            'sick_birds': current_sick,
            'dead_birds': total_dead,
            'recovered_birds': total_recovered,
            'performance': avg_performance,
            'today_production': Production.objects.filter(lot__in=all_lots, date=now.date(), status='ACTIVE').aggregate(total=Sum('casiers_produits'))['total'] or 0,
            'revenues': float(period_revenues),
            'encaissements': float(period_encaissements),
            'creances': float(period_creances),
            'egg_revenues': float(egg_revenues_period),
            'chicken_revenues': float(chicken_revenues_period),
            'expenses': float(period_total_expenses),
            'feed_stock': float(feed_stock),
            'raw_material_stock': float(raw_material_stock),
            'raw_materials_detail': raw_materials_detail,
            'prepared_feeds_detail': prepared_feeds_detail,
            'last_preparation_date': last_preparation.date if last_preparation else None,
            'last_distribution_date': last_distribution.date if last_distribution else None,
            'revenue_trend': revenue_trend,
            'alerts_count': HealthAlert.objects.filter(farm__in=farms, is_viewed=False).count(),
            'production_total': productions_period.aggregate(total=Sum('casiers_produits'))['total'] or 0,
            'production_salable': (productions_period.aggregate(total=Sum('casiers_vendables'))['total'] or 0) + (EggConversion.objects.filter(lot__in=active_lots, status='ACTIVE', to_state='VENDABLE', conversion_date__gte=start_date.date()).aggregate(total=Sum('quantity'))['total'] or 0),
            'production_broken': productions_period.aggregate(total=Sum('oeufs_casses'))['total'] or 0,
            'production_sold': sales_period.filter(product_type__in=['NORMAL', 'NORMAUX']).aggregate(total=Sum('quantity'))['total'] or 0,
            'feeding_consumed': float(feeds_period.aggregate(total=Sum('quantity_kg'))['total'] or 0),
            'feeding_purchased': float(FeedPurchase.objects.filter(lot__in=all_lots, date__gte=start_date.date(), status='ACTIVE').aggregate(total=Sum('quantity_kg'))['total'] or 0),
            'feeding_cost': float(period_feed_purchase_cost),
            'health_cost': float(period_health_purchase_cost),
            'health_treatments': HealthRecord.objects.filter(lot__in=all_lots, date__gte=start_date.date(), status='ACTIVE').count(),
            'total_bonuses': float(total_bonuses),
            'employees_with_bonuses': employees_with_bonuses,
        }

        # Charts
        if period_param == 'day':
            def get_day_distribution(queryset, value_field):
                # Ensure we handle Decimal fields by converting to float
                if hasattr(queryset.model, 'created_at'):
                    dist = queryset.annotate(hour=ExtractHour('created_at')).values('hour').annotate(total=Sum(value_field))
                    m, n, e = 0, 0, 0
                    for item in dist:
                        h, v = item['hour'], item['total'] or 0
                        if h < 11: m += float(v)
                        elif h < 16: n += float(v)
                        else: e += float(v)
                    return [{'label': 'Matin', 'value': m}, {'label': 'Midi', 'value': n}, {'label': 'Soir', 'value': e}]
                else:
                    total = queryset.aggregate(total=Sum(value_field))['total'] or 0
                    return [{'label': 'Matin', 'value': float(total)}, {'label': 'Midi', 'value': 0}, {'label': 'Soir', 'value': 0}]
            charts = {
                'production': get_day_distribution(productions_period, 'casiers_produits'),
                'feeding': get_day_distribution(feeds_period, 'quantity_kg'),
                'health': get_day_distribution(movements_period.filter(type='MORT'), 'quantity'),
                'sales': get_day_distribution(sales_period, 'amount_paid'),
                'expenses': get_day_distribution(expenses_period, 'amount'),
            }
        else:
            def to_float_list(qs):
                return [{**item, 'value': float(item['value'] or 0)} for item in list(qs)]

            charts = {
                'production': to_float_list(productions_period.annotate(day=trunc_func('date')).values('day').annotate(value=Sum('casiers_produits')).order_by('day')),
                'feeding': to_float_list(feeds_period.annotate(day=trunc_func('date')).values('day').annotate(value=Sum('quantity_kg')).order_by('day')),
                'health': to_float_list(movements_period.filter(type='MORT').annotate(day=trunc_func('date')).values('day').annotate(value=Sum('quantity')).order_by('day')),
                'sales': to_float_list(sales_period.annotate(day=trunc_func('date')).values('day').annotate(value=Sum('amount_paid')).order_by('day')),
                'expenses': to_float_list(expenses_period.annotate(day=trunc_func('date')).values('day').annotate(value=Sum('amount')).order_by('day')),
            }

        # Recent Transactions
        recent_sale_payments = SalePayment.objects.filter(farm__in=farms).order_by('-payment_date', '-created_at')[:10]
        recent_expenses = Expense.objects.filter(farm__in=farms).order_by('-date')[:10]
        transactions = []
        for p in recent_sale_payments:
            transactions.append({'id': f'p-{p.id}', 'title': f"Paiement: {p.sale.customer_name or 'Vente'}", 'amount': float(p.amount), 'date': p.payment_date, 'type': 'income', 'status': p.status})
        for e in recent_expenses:
            transactions.append({'id': f'e-{e.id}', 'title': e.description, 'amount': -float(e.amount), 'date': e.date, 'type': 'expense', 'status': e.status})
        transactions.sort(key=lambda x: str(x['date']), reverse=True)

        response_data = {'summary': summary, 'charts': charts, 'recent_transactions': transactions[:10]}

        if user.role != 'PROPRIETAIRE':
            # Remove sensitive financial data for non-owners
            sensitive_keys = ['revenues', 'encaissements', 'creances', 'egg_revenues', 'chicken_revenues', 'expenses', 'feeding_cost', 'health_cost', 'total_bonuses', 'payroll_mass']
            for key in sensitive_keys:
                summary.pop(key, None)

            if 'finance' in charts:
                del charts['finance']
            if 'sales' in charts:
                del charts['sales']
            if 'expenses' in charts:
                del charts['expenses']

            # Filter transactions to hide amounts or exclude them entirely
            # For employees, it might be better to not show transactions at all or hide amounts
            response_data['recent_transactions'] = []

        return Response(response_data)

class LotViewSet(viewsets.ModelViewSet):
    serializer_class = LotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # Réserver destroy, archive, reactivate aux propriétaires
        if self.action in ['destroy', 'archive', 'reactivate']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Lot.objects.filter(farm__owner=user)
        else:
            queryset = Lot.objects.filter(employees__user=user)

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(farm_id=farm_id)

        return queryset

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Check for related data (Production, Vente, Aliment, Santé, Mouvement, etc.)
        has_data = (
            instance.productions.exists() or
            instance.sales.exists() or
            instance.feeds.exists() or
            instance.health_records.exists() or
            instance.movements.exists() or
            instance.feed_purchases.exists() or
            instance.health_purchases.exists() or
            instance.reminders.exists() or
            instance.tasks.exists() or
            instance.attendances.exists() or
            instance.activity_logs.exists()
        )

        if has_data:
            return Response(
                {"error": "Impossible de supprimer ce lot car il contient des données d'élevage. Veuillez l'archiver ou le marquer comme terminé à la place."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        """Réactive un lot archivé ou terminé"""
        lot = self.get_object()

        if lot.status == 'ACTIF':
            return Response(
                {"detail": "Ce lot est déjà actif."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            farm_status = lot.farm.status
        except Exception:
            farm_status = None
        if farm_status != 'ACTIF':
            return Response(
                {"detail": "Impossible de réactiver ce lot car sa ferme est archivée. Réactivez d'abord la ferme."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if lot.current_quantity <= 0:
            return Response(
                {"detail": "Impossible de réactiver ce lot : il n'a plus de poules vivantes. Veuillez d'abord ajouter des sujets via un mouvement d'ajout."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if lot.farm.capacity > 0:
            active_total = Lot.objects.filter(farm=lot.farm, status='ACTIF').exclude(pk=lot.pk).aggregate(total=Sum('current_quantity'))['total'] or 0
            projected_total = active_total + lot.current_quantity
            if projected_total > lot.farm.capacity:
                return Response(
                    {"detail": f"La réactivation du lot dépasserait la capacité de la ferme ({projected_total} > {lot.farm.capacity})."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        lot.status = 'ACTIF'
        lot.motif_fin = None
        lot.save()

        ActivityLog.objects.create(
            user=request.user,
            farm=lot.farm,
            lot=lot,
            action="Lot Réactivé",
            module="Lots",
            description=f"Le lot {lot.name} a été réactivé"
        )

        return Response(
            {"detail": f"Le lot {lot.name} a été réactivé avec succès."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive un lot actif ou terminé"""
        lot = self.get_object()
        
        if lot.status == 'ARCHIVE':
            return Response(
                {"detail": "Ce lot est déjà archivé."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        lot.status = 'ARCHIVE'
        lot.save()

        # Désactiver les rappels futurs liés à ce lot
        from .models import Reminder
        lot.reminders.filter(date__gt=timezone.now()).update(status='INACTIVE')

        # Retirer le lot des employés assignés pour éviter les confusions de filtrage
        lot.employees.clear()

        # Log l'action
        ActivityLog.objects.create(
            user=request.user,
            farm=lot.farm,
            lot=lot,
            action="Lot Archivé",
            module="Lots",
            description=f"Le lot {lot.name} a été archivé"
        )
        
        return Response(
            {"detail": f"Le lot {lot.name} a été archivé avec succès."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        lot = self.get_object()
        period_param = request.query_params.get('period', 'week')
        now = timezone.now()

        if period_param == 'day':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period_param == 'month':
            start_date = now - timezone.timedelta(days=30)
        elif period_param == 'year':
            start_date = now - timezone.timedelta(days=365)
        else:
            start_date = now - timezone.timedelta(days=7)

        prods = lot.productions.filter(date__gte=start_date, status='ACTIVE')
        sales = lot.sales.filter(date__gte=start_date, status='ACTIVE')
        feeds = lot.feeds.filter(date__gte=start_date, status='ACTIVE')
        movements = lot.movements.filter(date__gte=start_date, status='ACTIVE')

        # Global Lot stats (All time for Lot)
        all_prods = lot.productions.filter(status='ACTIVE')
        all_sales = lot.sales.filter(status='ACTIVE')
        all_feeds = lot.feeds.filter(status='ACTIVE')
        all_health = lot.health_records.filter(status='ACTIVE')
        all_movements = lot.movements.filter(status='ACTIVE')
        all_feed_purchases = lot.feed_purchases.filter(status='ACTIVE')
        all_health_purchases = lot.health_purchases.filter(status='ACTIVE')

        total_casiers = all_prods.aggregate(total=Sum('casiers_produits'))['total'] or 0
        total_oeufs_casses = all_prods.aggregate(total=Sum('oeufs_casses'))['total'] or 0
        total_casiers_vendables = all_prods.aggregate(total=Sum('casiers_vendables'))['total'] or 0
        # Inclure les conversions d'œufs dans le stock vendable
        total_conversions = lot.egg_conversions.filter(status='ACTIVE', to_state='VENDABLE').aggregate(total=Sum('quantity'))['total'] or 0
        total_casiers_vendables += total_conversions

        total_sold_normaux = all_sales.filter(product_type='NORMAL').aggregate(total=Sum('quantity'))['total'] or 0
        total_sold_casses = all_sales.filter(product_type='BROKEN').aggregate(total=Sum('quantity'))['total'] or 0
        total_sold_chickens = all_sales.filter(product_type='CHICKEN').aggregate(total=Sum('quantity'))['total'] or 0

        available_stock = max(0, total_casiers_vendables - total_sold_normaux)
        available_casses = max(0, (total_oeufs_casses / 30) - total_sold_casses)

        total_feed_consumed = all_feeds.aggregate(total=Sum('quantity_kg'))['total'] or 0
        # For a specific lot, we show the lot's feed stock
        feed_stock = PreparedFeedInventory.objects.filter(lot=lot).aggregate(total=Sum('quantity_kg'))['total'] or 0
        raw_material_stock = FeedInventory.objects.filter(lot=lot).aggregate(total=Sum('quantity_kg'))['total'] or 0

        raw_materials_detail = list(FeedInventory.objects.filter(lot=lot).values('feed_type').annotate(total=Sum('quantity_kg')))
        prepared_feeds_detail = list(PreparedFeedInventory.objects.filter(lot=lot).values('feed_name').annotate(total=Sum('quantity_kg')))

        last_preparation = FeedPreparation.objects.filter(lot=lot).order_by('-date', '-created_at').first()

        total_health_purchased = all_health_purchases.aggregate(total=Sum('quantity'))['total'] or 0
        # Health consumed logic: mixing dose and quantity might be tricky in DB if one is string.
        # For now, let's assume we use a consistent numeric field if possible, or handle it simply.
        total_health_consumed = all_health.aggregate(total=Sum('cost'))['total'] or 0 # Placeholder for stock logic if needed

        total_revenues = all_sales.aggregate(total=Sum('amount_paid'))['total'] or 0
        egg_revenues = all_sales.filter(product_type__in=['NORMAL', 'BROKEN']).aggregate(total=Sum('amount_paid'))['total'] or 0
        chicken_revenues = all_sales.filter(product_type='CHICKEN').aggregate(total=Sum('amount_paid'))['total'] or 0

        feed_costs = all_feed_purchases.aggregate(total=Sum('total_price'))['total'] or 0
        health_costs = all_health_purchases.aggregate(total=Sum('total_price'))['total'] or 0
        total_expenses = feed_costs + health_costs + lot.purchase_price

        dead_count = all_movements.filter(type='MORT').aggregate(total=Sum('quantity'))['total'] or 0
        total_sick = all_movements.filter(type='MALADE').aggregate(total=Sum('quantity'))['total'] or 0
        recovered_count = all_movements.filter(type='GUERI').aggregate(total=Sum('quantity'))['total'] or 0
        current_sick = max(0, total_sick - recovered_count)

        # Period specific
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        prod_today = all_prods.filter(date__gte=today_start).aggregate(total=Sum('casiers_produits'))['total'] or 0
        prod_week = all_prods.filter(date__gte=now - timezone.timedelta(days=7)).aggregate(total=Sum('casiers_produits'))['total'] or 0

        # Performance (based on last 7 days as in dashboard)
        seven_days_ago = now - timezone.timedelta(days=7)
        recent_prods = all_prods.filter(date__gte=seven_days_ago)
        recent_eggs = (recent_prods.aggregate(total=Sum('casiers_produits'))['total'] or 0) * 30
        days_with_data = recent_prods.values('date').distinct().count() or 1

        performance = calculate_performance(
            lot.initial_quantity,
            lot.current_quantity,
            current_sick,
            recent_eggs,
            days_with_data
        )

        last_feed = all_feeds.order_by('-date', '-created_at').first()
        last_health = all_health.order_by('-date', '-created_at').first()

        health_detail = list(HealthInventory.objects.filter(lot=lot).values(
            'product_name', 'quantity', 'unit'
        ))

        summary = {
            'info': LotSerializer(lot).data,
            'total_casiers': total_casiers,
            'total_oeufs': total_casiers * 30 + total_oeufs_casses,
            'total_oeufs_casses': total_oeufs_casses,
            'total_casiers_vendables': total_casiers_vendables,
            'revenues': float(total_revenues),
            'egg_revenues': float(egg_revenues),
            'chicken_revenues': float(chicken_revenues),
            'expenses': float(total_expenses),
            'profit': float(total_revenues - total_expenses),
            'dead_count': dead_count,
            'current_sick': current_sick,
            'recovered_count': recovered_count,
            'total_sick': total_sick,
            'available_stock': available_stock,
            'available_casses': available_casses,
            'prod_today': prod_today,
            'prod_week': prod_week,
            'feed_stock': float(feed_stock),
            'raw_material_stock': float(raw_material_stock),
            'raw_materials_detail': raw_materials_detail,
            'prepared_feeds_detail': prepared_feeds_detail,
            'health_detail': health_detail,
            'last_preparation_date': last_preparation.date if last_preparation else None,
            'total_feed_consumed': float(total_feed_consumed),
            'last_feed_date': last_feed.date if last_feed else None,
            'health_stock': float(HealthInventory.objects.filter(lot=lot).aggregate(total=Sum('quantity'))['total'] or 0),
            'total_treatments': all_health.count(),
            'last_health_record': HealthRecordSerializer(last_health).data if last_health else None,
            'performance': performance,
        }

        if request.user.role != 'PROPRIETAIRE':
            sensitive_keys = ['revenues', 'egg_revenues', 'chicken_revenues', 'expenses', 'profit', 'feeding_cost', 'health_cost']
            for key in sensitive_keys:
                summary.pop(key, None)

        return Response(summary)


class ProductionViewSet(viewsets.ModelViewSet):
    serializer_class = ProductionSerializer

    def get_permissions(self):
        # Autorise les employés authentifiés à créer une production.
        # Seules les actions de modification/suppression restent réservées au propriétaire.
        if self.action in ['update', 'partial_update', 'destroy', 'convert_to_vendable']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Production.objects.filter(lot__farm__owner=user)
        else:
            queryset = Production.objects.filter(lot__employees__user=user)
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        # Vérifier si un log existe déjà pour éviter les doublons
        existing_log = ActivityLog.objects.filter(
            related_id=instance.id,
            module="Production",
            action="Ajout Production"
        ).first()
        
        if not existing_log:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Ajout Production",
                module="Production",
                related_id=instance.id,
                description=f"Production : {instance.casiers_produits} casiers collectés (Lot {instance.lot.name})"
            )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()

        # Update existing ActivityLog instead of creating a new one to avoid duplication
        description = f"Production modifiée (Lot {new_instance.lot.name}) : {old_instance.casiers_produits} -> {new_instance.casiers_produits} casiers"
        print(f"[TEST SOLFERME] PRODUCTION UPDATE: id={new_instance.id}, old={old_instance.casiers_produits}, new={new_instance.casiers_produits}")

        # Chercher spécifiquement les logs de modification existants
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Production",
            action="Modification Production"
        ).update(
            user=self.request.user,
            farm=new_instance.lot.farm,
            lot=new_instance.lot,
            description=description
        )

        print(f"[TEST SOLFERME] PRODUCTION UPDATE: ActivityLog updated={updated}")

        if not updated:
            print(f"[TEST SOLFERME] PRODUCTION UPDATE: Creating new ActivityLog")
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.lot.farm,
                lot=new_instance.lot,
                action="Modification Production",
                module="Production",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette production est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_egg_stock_integrity
        ok, err = validate_egg_stock_integrity(instance.lot, 'NORMAL', exclude_id=instance.id, is_prod=True)
        if not ok:
            return Response({"detail": "Impossible d'annuler cette production : une partie de ces œufs a déjà été vendue. Annulez d'abord les ventes concernées."}, status=status.HTTP_400_BAD_REQUEST)

        ok, err = validate_egg_stock_integrity(instance.lot, 'BROKEN', exclude_id=instance.id, is_prod=True)
        if not ok:
            return Response({"detail": "Impossible d'annuler cette production : le stock d'œufs cassés deviendrait négatif (ventes déjà enregistrées)."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        updated = ActivityLog.objects.filter(related_id=instance.id, module="Production").update(
            action="Production Annulée",
            description=f"Production de {instance.casiers_produits} casiers annulée (Lot {instance.lot.name})"
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Production Annulée",
                module="Production",
                related_id=instance.id,
                description=f"Production de {instance.casiers_produits} casiers annulée (Lot {instance.lot.name})"
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def convert_to_vendable(self, request, pk=None):
        # ⚠️ Endpoint legacy DÉSACTIVÉ (évolution SolFerme).
        # L'ancienne implémentation mutait directement production.casiers_vendables,
        # ce qui contredisait le modèle "la production est une photographie" et risquait
        # un double comptage (futur casiers injectés AUSSI comme egg_conversions).
        #
        # La conversion se fait désormais UNIQUEMENT via une ligne egg_conversions
        # (POST /egg-conversions/) : Vendables actuels = initiaux + Σ conversions.
        # On maintient la signature HTTP (GET_object pour préserver le comportement 404)
        # mais on refuse l'opération en redirigeant vers le mécanisme officiel.
        self.get_object()
        return Response(
            {"error": "Cet endpoint de conversion est obsolète. Utilisez POST /egg-conversions/ pour rendre des casiers vendables."},
            status=status.HTTP_400_BAD_REQUEST,
        )

class EggConversionViewSet(viewsets.ModelViewSet):
    serializer_class = EggConversionSerializer

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = EggConversion.objects.filter(production__lot__farm__owner=user)
        else:
            queryset = EggConversion.objects.filter(production__lot__employees__user=user)

        production_id = self.request.query_params.get('production')
        if production_id:
            queryset = queryset.filter(production_id=production_id)

        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        return queryset.select_related('production', 'lot', 'farm', 'created_by')

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        description = f"Conversion : {instance.quantity} casiers de {instance.from_state} vers {instance.to_state} (Lot {instance.lot.name})"
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Conversion Œufs",
            module="Production",
            related_id=instance.id,
            description=description
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        description = f"Conversion du {instance.conversion_date} modifiée : {instance.quantity} casiers ({instance.from_state}→{instance.to_state})"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=instance.id,
            module="Production"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Modification Conversion",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.farm,
                lot=instance.lot,
                action="Modification Conversion",
                module="Production",
                related_id=instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette conversion est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Conversion de {instance.quantity} casiers ({instance.from_state}→{instance.to_state}) annulée"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Production", action__icontains="Conversion").update(
            action="Conversion Annulée",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.farm,
                lot=instance.lot,
                action="Conversion Annulée",
                module="Production",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Sale.objects.filter(lot__farm__owner=user)
        else:
            # Pour les employés, on limite aux lots auxquels ils sont assignés
            try:
                assigned_lots = user.employee_profile.lots.all()
                queryset = Sale.objects.filter(lot__in=assigned_lots)
            except:
                queryset = Sale.objects.none()
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def perform_create(self, serializer):
        # We save with amount_paid=0 initially so that SalePayment creation triggers the update properly.
        initial_amount_paid = serializer.validated_data.get('amount_paid', 0)
        serializer.validated_data['amount_paid'] = 0
        instance = serializer.save(created_by=self.request.user)

        if initial_amount_paid > 0:
            SalePayment.objects.create(
                sale=instance,
                farm=instance.lot.farm,
                lot=instance.lot,
                amount=initial_amount_paid,
                payment_method='CASH',
                payment_date=instance.date,
                reference='INITIAL',
                note='Paiement initial lors de la vente',
                created_by=self.request.user
            )

        if instance.product_type == 'CHICKEN':
            action_name = "Vente Poules"
            desc = f"Vente : {instance.quantity} sujets à {instance.customer_name or 'Client inconnu'}"
        else:
            action_name = "Vente"
            product_label = 'Normaux' if instance.product_type == 'NORMAL' else 'Cassés'
            desc = f"Vente : {instance.quantity} casiers ({product_label}) à {instance.customer_name or 'Client inconnu'}"

        # Vérifier si un log existe déjà pour éviter les doublons
        existing_log = ActivityLog.objects.filter(
            related_id=instance.id,
            module="Vente",
            action=action_name
        ).first()
        
        if not existing_log:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action=action_name,
                module="Vente",
                related_id=instance.id,
                description=desc
            )

    def perform_update(self, serializer):
        old_instance = self.get_object()

        # 🔒 amount_paid / payment_status sont DES CHAMPS DÉRIVÉS des SalePayment
        # (recalculés par le signal handle_sale_payment_change). Un PUT d'édition
        # de la vente ne doit JAMAIS les écraser avec une valeur fournie par le
        # client (souvent obsolète) — sinon la créance restante devient fausse.
        # On les retire du payload validé : la source de vérité reste les paiements.
        serializer.validated_data.pop('amount_paid', None)
        serializer.validated_data.pop('payment_status', None)

        new_instance = serializer.save()
        changes = []

        unit = "sujets" if new_instance.product_type == 'CHICKEN' else "casiers"

        print(f"[TEST SOLFERME] SALE UPDATE: id={new_instance.id}, customer={new_instance.customer_name}")

        if old_instance.quantity != new_instance.quantity:
            changes.append(f"Quantité : {old_instance.quantity} -> {new_instance.quantity} {unit}")
        if old_instance.status != new_instance.status:
            status_map = {'ACTIVE': 'Active', 'ANNULEE': 'Annulée'}
            changes.append(f"Statut : {status_map.get(old_instance.status, old_instance.status)} -> {status_map.get(new_instance.status, new_instance.status)}")

        print(f"[TEST SOLFERME] SALE UPDATE: changes={changes}")

        if changes:
            action_name = "Modification Vente Poules" if new_instance.product_type == 'CHICKEN' else "Modification Vente"
            description = f"Vente à {new_instance.customer_name or 'Client'} modifiée : " + ", ".join(changes)

            # Chercher spécifiquement les logs de modification existants
            updated = ActivityLog.objects.filter(
                related_id=new_instance.id,
                module="Vente",
                action=action_name
            ).update(
                user=self.request.user,
                farm=new_instance.lot.farm,
                lot=new_instance.lot,
                description=description
            )

            print(f"[TEST SOLFERME] SALE UPDATE: ActivityLog updated={updated}")

            if not updated:
                print(f"[TEST SOLFERME] SALE UPDATE: Creating new ActivityLog")
                ActivityLog.objects.create(
                    user=self.request.user,
                    farm=new_instance.lot.farm,
                    lot=new_instance.lot,
                    action=action_name,
                    module="Vente",
                    related_id=new_instance.id,
                    description=description
                )

    def destroy(self, request, *args, **kwargs):
        # ⚠️ CORRECTION (BUG B2) : SaleViewSet n'avait AUCUN destroy → ModelViewSet.destroy()
        # par défaut = HARD delete (suppression réelle + cascade SalePayment/mouvement),
        # alors que le frontend offline annule les ventes en status='ANNULEE'.
        # → divergence Online/Offline et perte de données en ligne.
        # Correctif : soft-delete aligné sur le frontend, en CONSERVANT la validation
        # métier de cohérence de stock (règles de gestion intactes).
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette vente est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Valider la cohérence du stock avant annulation (règle métier conservée)
        if instance.product_type == 'CHICKEN':
            from .serializers import validate_bird_stock_integrity
            movement_id = instance.chicken_movement.id if hasattr(instance, 'chicken_movement') and instance.chicken_movement else None
            ok, err = validate_bird_stock_integrity(instance.lot, exclude_id=movement_id)
        else:
            from .serializers import validate_egg_stock_integrity
            ok, err = validate_egg_stock_integrity(instance.lot, instance.product_type, exclude_id=instance.id, is_prod=False)

        if not ok:
            return Response({"detail": f"Impossible d'annuler cette vente : cohérence du stock compromise au {instance.date}."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        action_name = "Vente Annulée" if instance.product_type != 'CHICKEN' else "Vente Poules Annulée"
        unit = "sujets" if instance.product_type == 'CHICKEN' else "casiers"
        desc = f"Vente de {instance.quantity} {unit} à {instance.customer_name or 'un client'} annulée (Lot {instance.lot.name})"

        updated = ActivityLog.objects.filter(related_id=instance.id, module="Vente").update(
            action=action_name,
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action=action_name,
                module="Vente",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class SalePaymentViewSet(viewsets.ModelViewSet):
    serializer_class = SalePaymentSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = SalePayment.objects.filter(farm__owner=user)
        else:
            try:
                assigned_lots = user.employee_profile.lots.all()
                queryset = SalePayment.objects.filter(lot__in=assigned_lots)
            except:
                queryset = SalePayment.objects.none()
            
        sale_id = self.request.query_params.get('sale')
        if sale_id:
            queryset = queryset.filter(sale_id=sale_id)
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def create(self, request, *args, **kwargs):
        """
        🔒 Idempotence de la création d'un paiement (req. #21 : pas de double
        paiement après une perte de connexion pendant un encaissement).

        Le client envoie une `reference` unique (UUID) à chaque paiement.
        Si un paiement ACTIF avec la même (sale, reference) existe déjà (cas où
        le POST initial a été traité côté serveur mais que la réponse s'est perdue
        dans le réseau, déclenchant ensuite une ré-inscription offline à la sync),
        on retourne l'enregistrement existant au lieu d'en créer un second.
        """
        reference = request.data.get('reference')
        sale_id = request.data.get('sale')
        if reference and sale_id:
            dup = SalePayment.objects.filter(
                sale_id=sale_id, reference=reference, status='ACTIVE'
            ).first()
            if dup:
                return Response(self.get_serializer(dup).data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        # 🔧 Robustesse : si un client n'envoie pas lot/farm, on les dérive de la
        # vente (source de vérité). Évite un 400 alors que le paiement est valide
        # et rend la ré-synchronisation offline tolérante.
        data = serializer.validated_data
        sale = data.get('sale')
        if sale is not None:
            if not data.get('lot'):
                data['lot'] = sale.lot
            if not data.get('farm'):
                data['farm'] = sale.lot.farm
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Paiement Vente",
            module="Vente",
            related_id=instance.sale.id, # Link to sale
            description=f"Paiement de {instance.amount} enregistré pour la vente #{instance.sale_id}."
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        changes = []
        if old_instance.amount != new_instance.amount:
            changes.append(f"Montant : {old_instance.amount} -> {new_instance.amount}")
        if old_instance.status != new_instance.status:
            status_map = {'ACTIVE': 'Active', 'ANNULEE': 'Annulée'}
            changes.append(f"Statut : {status_map.get(old_instance.status, old_instance.status)} -> {status_map.get(new_instance.status, new_instance.status)}")
        
        if changes:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.farm,
                lot=new_instance.lot,
                action="Modification Paiement Vente",
                module="Vente",
                related_id=new_instance.sale.id,
                description=f"Paiement de la vente #{new_instance.sale_id} modifié : " + ", ".join(changes)
            )

    def destroy(self, request, *args, **kwargs):
        # ⚠️ CORRECTION (BUG B1) : ce destroy était un copier-coller de SaleViewSet qui
        # référençait des champs n'existant PAS sur SalePayment (product_type,
        # chicken_movement) → AttributeError → HTTP 500 sur chaque DELETE de paiement.
        # La file de synchronisation offline restait donc bloquée (500 ≠ erreur client).
        # Correctif : soft-delete du paiement (status='ANNULEE'), cohérent avec le mode
        # offline du frontend (sale_payments est annulable). Le post_save
        # handle_sale_payment_change recalcule automatiquement sale.amount_paid.
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Ce paiement est déjà annulé."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Paiement Vente Annulé",
            module="Vente",
            related_id=instance.sale_id,
            description=f"Paiement de {instance.amount} annulé pour la vente #{instance.sale_id}."
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

class FeedViewSet(viewsets.ModelViewSet):
    serializer_class = FeedSerializer

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Feed.objects.filter(lot__farm__owner=user)
        else:
            queryset = Feed.objects.filter(lot__employees__user=user)
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Alimentation",
            module="Alimentation",
            related_id=instance.id,
            description=f"Distribution : {instance.quantity_kg} kg de {instance.feed_type} (Lot {instance.lot.name})"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        if old_instance.quantity_kg != new_instance.quantity_kg or old_instance.status != new_instance.status:
            description = f"Distribution modifiée (Lot {new_instance.lot.name}) : {old_instance.quantity_kg}kg -> {new_instance.quantity_kg}kg"
            
            # Update existing ActivityLog instead of creating a new one to avoid duplication
            updated = ActivityLog.objects.filter(
                related_id=new_instance.id,
                module="Alimentation"
            ).exclude(
                action__icontains="Annul"
            ).update(
                user=self.request.user,
                farm=new_instance.lot.farm,
                lot=new_instance.lot,
                action="Modification Alimentation",
                description=description
            )
            
            if not updated:
                ActivityLog.objects.create(
                    user=self.request.user,
                    farm=new_instance.lot.farm,
                    lot=new_instance.lot,
                    action="Modification Alimentation",
                    module="Alimentation",
                    related_id=new_instance.id,
                    description=description
                )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette consommation est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_inventory_integrity
        ok, err = validate_inventory_integrity(instance.lot, 'FEED', instance.feed_type, exclude_id=instance.id, is_purchase=False)
        if not ok:
            return Response({"detail": "Impossible d'annuler cette distribution : le stock deviendrait incohérent à une date ultérieure."}, status=status.HTTP_400_BAD_REQUEST)

        # Restore inventory
        from .models import PreparedFeedInventory
        prepared_inventory, created = PreparedFeedInventory.objects.get_or_create(
            lot=instance.lot,
            feed_name=instance.feed_type,
            defaults={'quantity_kg': 0}
        )
        prepared_inventory.quantity_kg += instance.quantity_kg
        prepared_inventory.save()

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Distribution de {instance.quantity_kg}kg annulée (Lot {instance.lot.name})"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Alimentation", action__icontains="Alimentation").update(
            action="Distribution Annulée",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Distribution Annulée",
                module="Alimentation",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = HealthRecord.objects.filter(lot__farm__owner=user)
        else:
            queryset = HealthRecord.objects.filter(lot__employees__user=user)
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Soin Santé",
            module="Santé",
            related_id=instance.id,
            description=f"Soin {instance.type} : {instance.product_name} - {instance.quantity} {instance.unit} (Lot {instance.lot.name})"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        description = f"Soin {new_instance.product_name} modifié (Lot {new_instance.lot.name})"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Santé"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.lot.farm,
            lot=new_instance.lot,
            action="Modification Santé",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.lot.farm,
                lot=new_instance.lot,
                action="Modification Santé",
                module="Santé",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Ce soin est déjà annulé."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_inventory_integrity
        ok, err = validate_inventory_integrity(instance.lot, 'HEALTH', instance.product_name, exclude_id=instance.id, is_purchase=False)
        if not ok:
            return Response({"detail": "Impossible d'annuler ce soin : le stock de ce produit deviendrait négatif dans l'historique futur."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Soin {instance.product_name} annulé (Lot {instance.lot.name})"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Santé", action__icontains="Soin").update(
            action="Soin Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Soin Annulé",
                module="Santé",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class ChickenMovementViewSet(viewsets.ModelViewSet):
    serializer_class = ChickenMovementSerializer

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = ChickenMovement.objects.filter(lot__farm__owner=user)
        else:
            queryset = ChickenMovement.objects.filter(lot__employees__user=user)
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        type_map = {'MORT': 'Mortalité', 'MALADE': 'Maladie', 'GUERI': 'Guérison', 'AJOUT': 'Ajout'}
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Mouvement",
            module="Mouvement",
            related_id=instance.id,
            description=f"{type_map.get(instance.type, instance.type)} : {instance.quantity} sujets (Lot {instance.lot.name})"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        type_map = {'MORT': 'Mortalité', 'MALADE': 'Maladie', 'GUERI': 'Guérison', 'AJOUT': 'Ajout'}
        description = f"Mouvement {type_map.get(new_instance.type, new_instance.type)} modifié : {old_instance.quantity} -> {new_instance.quantity} sujets (Lot {new_instance.lot.name})"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Mouvement"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.lot.farm,
            lot=new_instance.lot,
            action="Modification Mouvement",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.lot.farm,
                lot=new_instance.lot,
                action="Modification Mouvement",
                module="Mouvement",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Ce mouvement est déjà annulé."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique avant annulation
        from .serializers import validate_health_integrity, validate_bird_stock_integrity

        ok, err = validate_health_integrity(instance.lot, exclude_id=instance.id)
        if not ok:
            return Response({"detail": f"Annulation impossible : {err}"}, status=status.HTTP_400_BAD_REQUEST)

        ok, err = validate_bird_stock_integrity(instance.lot, exclude_id=instance.id)
        if not ok:
            return Response({"detail": f"Annulation impossible : {err}"}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        type_map = {'MORT': 'Mortalité', 'MALADE': 'Maladie', 'GUERI': 'Guérison', 'AJOUT': 'Ajout'}
        desc = f"Mouvement {type_map.get(instance.type, instance.type)} de {instance.quantity} sujets annulé (Lot {instance.lot.name})"

        updated = ActivityLog.objects.filter(related_id=instance.id, module="Mouvement").update(
            action="Mouvement Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Mouvement Annulé",
                module="Mouvement",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Task.objects.filter(employee__farm__owner=user)
        elif user.role == 'EMPLOYE':
            queryset = Task.objects.filter(employee__user=user)
        else:
            return Task.objects.none()

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(farm_id=farm_id)

        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset.order_by('-due_date', '-due_time')

    def perform_create(self, serializer):
        employee = serializer.validated_data.get('employee')
        if self.request.user.role == 'PROPRIETAIRE':
            if employee.farm.owner != self.request.user:
                from rest_framework import serializers
                raise serializers.ValidationError("Vous ne pouvez assigner des tâches qu'à vos propres employés.")
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        comment = request.data.get('comment', '')
        task.status = 'COMPLETED'
        task.completed_at = timezone.now()
        task.completion_comment = comment
        task.save()

        ActivityLog.objects.create(
            user=request.user,
            farm=task.farm,
            lot=task.lot,
            action="Tâche Complétée",
            module="Tâches",
            related_id=task.id,
            description=f"Tâche '{task.title}' marquée comme terminée par {request.user.name}"
        )

        return Response(TaskSerializer(task).data)

class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Employee.objects.filter(farm__owner=user)
        else:
            queryset = Employee.objects.filter(user=user)

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(farm_id=farm_id)

        return queryset

    def get_permissions(self):
        if self.action in ['destroy', 'create', 'update', 'partial_update']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_update(self, serializer):
        serializer.save()

    @action(detail=False, methods=['get'])
    def me(self, request):
        try:
            employee = Employee.objects.get(user=request.user)
            serializer = self.get_serializer(employee, context={'request': request})
            return Response(serializer.data)
        except Employee.DoesNotExist:
            return Response({"detail": "Non trouvé."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Retourne les statistiques dynamiques des employés, filtrées par ferme si précisé."""
        user = request.user
        today = timezone.now().date()

        if user.role == 'PROPRIETAIRE':
            queryset = Employee.objects.filter(farm__owner=user)
        else:
            queryset = Employee.objects.filter(user=user)

        farm_id = request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(farm_id=farm_id)

        total = queryset.count()
        active = queryset.filter(status='ACTIF').count()

        # Masse salariale = somme des salaires des employés ACTIFS uniquement
        payroll_mass = queryset.filter(status='ACTIF').aggregate(
            total=Sum('salary')
        )['total'] or 0

        # Présents aujourd'hui parmi ces employés
        present_today = Attendance.objects.filter(
            employee__in=queryset,
            date=today,
            status='PRESENT'
        ).count()

        return Response({
            'total': total,
            'active': active,
            'payroll_mass': float(payroll_mass),
            'present_today': present_today,
        })

class UserInfoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        farms = Farm.objects.filter(owner=user) if user.role == 'PROPRIETAIRE' else Farm.objects.filter(employees__user=user)

        farms_data = []
        for farm in farms:
            lots = Lot.objects.filter(farm=farm).exclude(status='ANNULEE')
            farms_data.append({
                'id': farm.id,
                'name': farm.name,
                'lots': [{'id': lot.id, 'name': lot.name} for lot in lots]
            })

        data = UserSerializer(user, context={'request': request}).data
        data['farms'] = farms_data
        return Response(data)

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

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh_token")
            if not refresh_token:
                return Response({"error": "Refresh token est requis."}, status=status.HTTP_400_BAD_REQUEST)

            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response({"detail": "Déconnexion réussie."}, status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({"error": "L'email est requis."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email=email).first()
        if user:
            import random
            code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
            expires_at = timezone.now() + timezone.timedelta(minutes=15)
            PasswordResetCode.objects.create(user=user, code=code, expires_at=expires_at)

            # Here we would send an email. For now, we'll just log it or return it in dev
            print(f"Password reset code for {email}: {code}")
            # In production, DO NOT return the code in the response
            if settings.DEBUG:
                return Response({"detail": "Code de réinitialisation envoyé.", "code_dev": code}, status=status.HTTP_200_OK)

        return Response({"detail": "Si un compte existe avec cet email, un code de réinitialisation a été envoyé."}, status=status.HTTP_200_OK)

class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email')
        code = request.data.get('code')
        new_password = request.data.get('new_password')

        if not all([email, code, new_password]):
            return Response({"error": "Tous les champs sont requis."}, status=status.HTTP_400_BAD_REQUEST)

        reset_code = PasswordResetCode.objects.filter(
            user__email=email,
            code=code,
            is_used=False
        ).last()

        if not reset_code or reset_code.is_expired():
            return Response({"error": "Code invalide ou expiré."}, status=status.HTTP_400_BAD_REQUEST)

        user = reset_code.user
        user.set_password(new_password)
        user.save()

        reset_code.is_used = True
        reset_code.save()

        return Response({"detail": "Mot de passe réinitialisé avec succès."}, status=status.HTTP_200_OK)

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Expense.objects.filter(farm__owner=user)
        else:
            return Expense.objects.filter(created_by=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            action="Dépense",
            module="Finance",
            related_id=instance.id,
            description=f"Dépense : {instance.description} - {instance.amount} GNF"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        description = f"Dépense '{new_instance.description}' modifiée : {old_instance.amount} -> {new_instance.amount} GNF"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Finance"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.farm,
            action="Modification Dépense",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.farm,
                action="Modification Dépense",
                module="Finance",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette dépense est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Empêcher la suppression directe si liée à un module métier
        is_linked = False
        try:
            if instance.feed_purchase_origin or instance.health_purchase_origin or instance.payroll_origin:
                is_linked = True
        except:
            pass

        if is_linked:
            return Response({"detail": "Cette dépense est liée à un achat ou un salaire. Veuillez l'annuler depuis le module correspondant pour garantir la cohérence des stocks et de la paie."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Dépense '{instance.description}' de {instance.amount} GNF annulée"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Finance", action__icontains="Dépense").update(
            action="Dépense Annulée",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.farm,
                action="Dépense Annulée",
                module="Finance",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class ReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return Reminder.objects.filter(farm__owner=user)
        else:
            # For employees, filter reminders by their assigned lots
            try:
                employee_lots = user.employee_profile.lots.all()
                # Show reminders that are either:
                # 1. Assigned to one of the employee's lots, OR
                # 2. Global farm reminders (lot is null)
                return Reminder.objects.filter(
                    farm__employees__user=user
                ).filter(
                    Q(lot__in=employee_lots) | Q(lot__isnull=True)
                ).distinct()
            except:
                # If employee has no lots or profile, return empty queryset
                return Reminder.objects.none()

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            related_id=instance.id,
            action="Nouveau Rappel",
            module="Rappel",
            description=f"Rappel : {instance.title} prévu le {instance.date}"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        ActivityLog.objects.create(
            user=self.request.user,
            farm=new_instance.farm,
            lot=new_instance.lot,
            related_id=new_instance.id,
            action="Rappel Modifié",
            module="Rappel",
            description=f"Modification du rappel : {new_instance.title}"
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            related_id=instance.id,
            action="Rappel Retiré",
            module="Rappel",
            description=f"Rappel supprimé : {instance.title}"
        )
        return super().destroy(request, *args, **kwargs)

class ActivityLogViewSet(viewsets.ModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ActivityLog.objects.all()

        if user.role == 'PROPRIETAIRE':
            # Le propriétaire voit ses propres actions et celles de ses employés
            queryset = queryset.filter(
                Q(user=user) | Q(user__employee_profile__farm__owner=user)
            )
        else:
            # L'employé voit les actions de sa ferme (propriétaire + collègues)
            # Limité aux lots auxquels il est assigné
            try:
                employee = user.employee_profile
                farm = employee.farm
                assigned_lot_ids = employee.lots.values_list('id', flat=True)

                queryset = queryset.filter(farm=farm)
                # Si l'employé est assigné à des lots spécifiques, on filtre par ces lots
                # Note: On garde les logs sans lot (au niveau ferme) s'ils concernent la ferme
                queryset = queryset.filter(Q(lot_id__in=assigned_lot_ids) | Q(lot__isnull=True))
            except:
                queryset = queryset.filter(user=user)

        # Filtres optionnels
        farm_id = self.request.query_params.get('farm')
        lot_id = self.request.query_params.get('lot')
        module = self.request.query_params.get('module')
        period = self.request.query_params.get('period')

        if farm_id:
            queryset = queryset.filter(farm_id=farm_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if module:
            queryset = queryset.filter(module=module)

        if period and period != 'all':
            from django.utils import timezone
            from datetime import timedelta
            now = timezone.now()
            if period == 'day':
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                queryset = queryset.filter(date__gte=start_date)
            elif period == 'week':
                start_date = now - timedelta(days=7)
                queryset = queryset.filter(date__gte=start_date)
            elif period == 'month':
                start_date = now - timedelta(days=30)
                queryset = queryset.filter(date__gte=start_date)
            elif period == 'year':
                start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                queryset = queryset.filter(date__gte=start_date)

        return queryset.distinct().order_by('-date')

    def get_permissions(self):
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return super().get_permissions()

class PayrollViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Payroll.objects.filter(employee__farm__owner=user)
        else:
            queryset = Payroll.objects.filter(employee__user=user)

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(employee__farm_id=farm_id)

        employee_id = self.request.query_params.get('employee')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        month = self.request.query_params.get('month')
        if month:
            queryset = queryset.filter(month__icontains=month)

        period_key = self.request.query_params.get('period_key')
        if period_key:
            queryset = queryset.filter(period_key=period_key)

        return queryset

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save()
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.employee.farm,
            action="Paiement Salaire",
            module="Finance",
            related_id=instance.id,
            description=f"Salaire payé à {instance.employee.user.name} : {instance.amount_paid} GNF ({instance.month or 'Mois en cours'})"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        description = f"Fiche de paie de {new_instance.employee.user.name} modifiée : {old_instance.amount_paid} -> {new_instance.amount_paid} GNF"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Finance"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.employee.farm,
            action="Modification Salaire",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.employee.farm,
                action="Modification Salaire",
                module="Finance",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette fiche de paie est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Paiement de {instance.amount_paid} GNF à {instance.employee.user.name} annulé"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Finance", action__icontains="Salaire").update(
            action="Salaire Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.employee.farm,
                action="Salaire Annulé",
                module="Finance",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Retourne le résumé de paie réel selon la périodicité de chaque employé."""
        user = request.user
        now = timezone.now()
        current_year = now.year
        current_month = now.month

        if user.role == 'PROPRIETAIRE':
            all_employees = Employee.objects.filter(farm__owner=user)
        else:
            all_employees = Employee.objects.filter(user=user)

        farm_id = request.query_params.get('farm')
        if farm_id:
            all_employees = all_employees.filter(farm_id=farm_id)

        from .models import compute_period_key
        count_paid = 0
        total_paid = 0

        for emp in all_employees:
            pk = compute_period_key(emp.payment_frequency, now.date())
            payroll_active = Payroll.objects.filter(
                employee=emp,
                status='ACTIVE',
                period_key=pk
            ).first()
            if not payroll_active:
                payroll_active = Payroll.objects.filter(
                    employee=emp,
                    status='ACTIVE',
                    date__year=current_year,
                    date__month=current_month
                ).first()

            if payroll_active:
                count_paid += 1
                total_paid += payroll_active.amount_paid

        count_pending = max(0, all_employees.count() - count_paid)

        return Response({
            'total_paid': float(total_paid),
            'count_paid': count_paid,
            'count_pending': count_pending,
            'period': f"{current_month:02d}/{current_year}",
        })

class LotExpenseViewSet(viewsets.ModelViewSet):
    queryset = LotExpense.objects.all()
    serializer_class = LotExpenseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            qs = LotExpense.objects.filter(lot__farm__owner=user)
        else:
            qs = LotExpense.objects.filter(lot__farm__employees__user=user)
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            qs = qs.filter(lot_id=lot_id)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Frais Lot Ajouté",
            module="Gestion Lot",
            related_id=instance.id,
            description=f"Frais '{instance.name}' de {instance.amount} GNF ajouté au lot {instance.lot.name}"
        )

    def perform_update(self, serializer):
        old = self.get_object()
        instance = serializer.save()
        description = f"Frais '{old.name}' modifié : {old.amount} → {instance.amount} GNF"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=instance.id,
            module="Gestion Lot"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Frais Lot Modifié",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Frais Lot Modifié",
                module="Gestion Lot",
                related_id=instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        ActivityLog.objects.create(
            user=request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Frais Lot Supprimé",
            module="Gestion Lot",
            related_id=instance.id,
            description=f"Frais '{instance.name}' de {instance.amount} GNF supprimé du lot {instance.lot.name}"
        )
        return super().destroy(request, *args, **kwargs)

class BonusViewSet(viewsets.ModelViewSet):
    serializer_class = BonusSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Bonus.objects.filter(employee__farm__owner=user)
        else:
            queryset = Bonus.objects.filter(employee__user=user)

        employee_id = self.request.query_params.get('employee')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(employee__farm_id=farm_id)

        bonus_type = self.request.query_params.get('bonus_type')
        if bonus_type:
            queryset = queryset.filter(bonus_type=bonus_type)

        return queryset

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.employee.farm,
            action="Prime Attribuée",
            module="Finance",
            related_id=instance.id,
            description=f"Prime {instance.bonus_type} de {instance.amount} GNF attribuée à {instance.employee.user.name}"
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette prime est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if bonus is linked to a payroll
        payroll_exists = Payroll.objects.filter(
            employee=instance.employee,
            bonus=instance.amount,
            status='ACTIVE'
        ).exists()

        if payroll_exists:
            return Response(
                {"detail": "Cette prime est déjà incluse dans une paie active. Annulez d'abord le paiement associé."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Change status to ANNULEE instead of deleting
        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Prime {instance.bonus_type} de {instance.amount} GNF annulée (employé: {instance.employee.user.name})"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Finance", action__icontains="Prime").update(
            action="Prime Annulée",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.employee.farm,
                action="Prime Annulée",
                module="Finance",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Résumé des primes : total distribué et nombre de bénéficiaires."""
        user = request.user
        if user.role == 'PROPRIETAIRE':
            queryset = Bonus.objects.filter(employee__farm__owner=user)
        else:
            queryset = Bonus.objects.filter(employee__user=user)

        farm_id = request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(employee__farm_id=farm_id)

        total_bonuses = queryset.aggregate(total=Sum('amount'))['total'] or 0
        recipients_count = queryset.values('employee').distinct().count()

        return Response({
            'total_bonuses': float(total_bonuses),
            'recipients_count': recipients_count,
        })

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

        farm_id = self.request.query_params.get('farm')
        if farm_id:
            queryset = queryset.filter(employee__farm_id=farm_id)

        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(date=date)

        employee_id = self.request.query_params.get('employee')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        return queryset.select_related('employee__user', 'lot', 'updated_by').order_by('-date', '-clock_in')

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsProprietaire()]
        return [permissions.IsAuthenticated()]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        user = request.user
        if user.role != 'EMPLOYE':
            return Response({"detail": "Seuls les employés peuvent pointer."}, status=status.HTTP_403_FORBIDDEN)

        lot_id = request.data.get('lot_id')
        if not lot_id:
            return Response({"detail": "Le lot est obligatoire pour le pointage."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            return Response({"detail": "Profil employé non trouvé."}, status=status.HTTP_404_NOT_FOUND)

        # Vérifier si l'employé est affecté à ce lot
        if not employee.lots.filter(id=lot_id).exists():
            return Response({"detail": "Vous n'êtes pas affecté à ce lot."}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.now().date()
        now = timezone.now().time()

        attendance, created = Attendance.objects.get_or_create(
            employee=employee,
            date=today,
            lot_id=lot_id,
            defaults={'clock_in': now, 'status': 'PRESENT'}
        )

        if not created:
            if attendance.clock_in:
                return Response({"detail": "Déjà pointé à l'arrivée pour ce lot aujourd'hui."}, status=status.HTTP_400_BAD_REQUEST)
            attendance.clock_in = now
            attendance.save()

        return Response(AttendanceSerializer(attendance).data)

    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        user = request.user
        if user.role != 'EMPLOYE':
            return Response({"detail": "Seuls les employés peuvent pointer."}, status=status.HTTP_403_FORBIDDEN)

        lot_id = request.data.get('lot_id')
        if not lot_id:
            return Response({"detail": "Le lot est obligatoire pour le pointage."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            return Response({"detail": "Profil employé non trouvé."}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()
        now = timezone.now().time()

        try:
            attendance = Attendance.objects.get(employee=employee, date=today, lot_id=lot_id)
            if attendance.clock_out:
                return Response({"detail": "Déjà pointé au départ pour ce lot aujourd'hui."}, status=status.HTTP_400_BAD_REQUEST)
            attendance.clock_out = now
            attendance.save()
            return Response(AttendanceSerializer(attendance).data)
        except Attendance.DoesNotExist:
            return Response({"detail": "Aucun pointage d'arrivée trouvé pour ce lot aujourd'hui."}, status=status.HTTP_400_BAD_REQUEST)

class EmployeeRequestViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = EmployeeRequest.objects.all()

        if user.role == 'PROPRIETAIRE':
            queryset = queryset.filter(farm__owner=user)
            employee_id = self.request.query_params.get('employee')
            if employee_id:
                queryset = queryset.filter(employee_id=employee_id)
        else:
            try:
                queryset = queryset.filter(employee__user=user)
            except AttributeError:
                return EmployeeRequest.objects.none()

        return queryset.order_by('-created_at')

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "La suppression définitive d'une demande historique est désactivée pour préserver l'historique métier."},
            status=status.HTTP_400_BAD_REQUEST
        )

    def perform_create(self, serializer):
        if self.request.user.role == 'EMPLOYE':
            try:
                employee = self.request.user.employee_profile
                serializer.save(employee=employee, farm=employee.farm)
            except AttributeError:
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Profil employé introuvable pour cet utilisateur.")
        else:
            serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role != 'PROPRIETAIRE':
            return Response({"detail": "Non autorisé."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance.status in ['APPROVED', 'REJECTED']:
            return Response({"detail": "Cette demande a déjà été clôturée et ne peut pas être approuvée à nouveau."}, status=status.HTTP_400_BAD_REQUEST)
        instance.status = 'APPROVED'
        instance.save()
        return Response({'status': 'APPROVED'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role != 'PROPRIETAIRE':
            return Response({"detail": "Non autorisé."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance.status in ['APPROVED', 'REJECTED']:
            return Response({"detail": "Cette demande a déjà été clôturée et ne peut pas être refusée à nouveau."}, status=status.HTTP_400_BAD_REQUEST)
        instance.status = 'REJECTED'
        instance.save()
        return Response({'status': 'REJECTED'})

class FeedInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FeedInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        farm_id = self.request.query_params.get('farm')
        lot_id = self.request.query_params.get('lot')
        include_zero = self.request.query_params.get('include_zero', 'false').lower() == 'true'

        queryset = FeedInventory.objects.all()
        if user.role == 'PROPRIETAIRE':
            queryset = queryset.filter(lot__farm__owner=user)
        else:
            queryset = queryset.filter(lot__farm__employees__user=user)

        if farm_id:
            queryset = queryset.filter(lot__farm_id=farm_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        # Si include_zero est true, on inclut tous les stocks, sinon on filtre les stocks > 0
        if not include_zero:
            queryset = queryset.filter(quantity_kg__gt=0)

        return queryset

class HealthInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HealthInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        farm_id = self.request.query_params.get('farm')
        lot_id = self.request.query_params.get('lot')
        include_zero = self.request.query_params.get('include_zero', 'false').lower() == 'true'

        queryset = HealthInventory.objects.all()
        if user.role == 'PROPRIETAIRE':
            queryset = queryset.filter(lot__farm__owner=user)
        else:
            queryset = queryset.filter(lot__farm__employees__user=user)

        if farm_id:
            queryset = queryset.filter(lot__farm_id=farm_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        # Si include_zero est true, on inclut tous les stocks, sinon on filtre les stocks > 0
        if not include_zero:
            queryset = queryset.filter(quantity__gt=0)

        return queryset

class FeedPurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = FeedPurchaseSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return FeedPurchase.objects.filter(farm__owner=user)
        else:
            return FeedPurchase.objects.filter(farm__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Achat Aliment",
            module="Alimentation",
            related_id=instance.id,
            description=f"Achat : {instance.quantity_kg} kg de {instance.feed_type}"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        description = f"Achat {new_instance.feed_type} modifié : {old_instance.quantity_kg}kg -> {new_instance.quantity_kg}kg"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Alimentation"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.farm,
            lot=new_instance.lot,
            action="Modification Achat Aliment",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.farm,
                lot=new_instance.lot,
                action="Modification Achat Aliment",
                module="Alimentation",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cet achat d'aliment est déjà annulé."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_inventory_integrity
        ok, err = validate_inventory_integrity(instance.lot, 'FEED', instance.feed_type, exclude_id=instance.id, is_purchase=True)
        if not ok:
            return Response({"detail": "Impossible d'annuler cet achat car une partie de cet aliment a déjà été utilisée. Annulez d'abord les distributions concernées."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Achat de {instance.quantity_kg}kg ({instance.feed_type}) annulé"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Alimentation", action__icontains="Achat").update(
            action="Achat Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.farm,
                lot=instance.lot,
                action="Achat Annulé",
                module="Alimentation",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class HealthPurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = HealthPurchaseSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsProprietaire()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return HealthPurchase.objects.filter(farm__owner=user)
        else:
            return HealthPurchase.objects.filter(farm__employees__user=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.farm,
            lot=instance.lot,
            action="Achat Santé",
            module="Santé",
            related_id=instance.id,
            description=f"Achat : {instance.quantity} {instance.unit} de {instance.product_name}"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()
        description = f"Achat {new_instance.product_name} modifié : {old_instance.quantity} -> {new_instance.quantity} {new_instance.unit}"
        
        # Update existing ActivityLog instead of creating a new one to avoid duplication
        updated = ActivityLog.objects.filter(
            related_id=new_instance.id,
            module="Santé"
        ).exclude(
            action__icontains="Annul"
        ).update(
            user=self.request.user,
            farm=new_instance.farm,
            lot=new_instance.lot,
            action="Modification Achat Santé",
            description=description
        )
        
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=new_instance.farm,
                lot=new_instance.lot,
                action="Modification Achat Santé",
                module="Santé",
                related_id=new_instance.id,
                description=description
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cet achat de produit santé est déjà annulé."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_inventory_integrity
        ok, err = validate_inventory_integrity(instance.lot, 'HEALTH', instance.product_name, exclude_id=instance.id, is_purchase=True)
        if not ok:
            return Response({"detail": "Impossible d'annuler cet achat car ce produit a déjà été utilisé pour des soins. Annulez d'abord les soins concernés."}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Achat de {instance.quantity} unités de {instance.product_name} annulé"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Santé", action__icontains="Achat").update(
            action="Achat Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.farm,
                lot=instance.lot,
                action="Achat Annulé",
                module="Santé",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

class HealthAlertViewSet(viewsets.ModelViewSet):
    serializer_class = HealthAlertSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            return HealthAlert.objects.filter(farm__owner=user)
        else:
            return HealthAlert.objects.filter(lot__employees__user=user)

    @action(detail=True, methods=['post'])
    def mark_as_viewed(self, request, pk=None):
        if request.user.role != 'PROPRIETAIRE':
            return Response({"error": "Seul le propriétaire peut marquer une alerte comme vue."}, status=status.HTTP_403_FORBIDDEN)

        alert = self.get_object()
        alert.is_viewed = True
        alert.viewed_by = request.user
        alert.viewed_at = timezone.now()
        alert.save()
        return Response(self.get_serializer(alert).data)

class PreparedFeedInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PreparedFeedInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        farm_id = self.request.query_params.get('farm')
        lot_id = self.request.query_params.get('lot')
        include_zero = self.request.query_params.get('include_zero', 'false').lower() == 'true'

        queryset = PreparedFeedInventory.objects.all()
        if user.role == 'PROPRIETAIRE':
            queryset = queryset.filter(lot__farm__owner=user)
        else:
            queryset = queryset.filter(lot__farm__employees__user=user)

        if farm_id:
            queryset = queryset.filter(lot__farm_id=farm_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)

        # Si include_zero est true, on inclut tous les stocks, sinon on filtre les stocks > 0
        if not include_zero:
            queryset = queryset.filter(quantity_kg__gt=0)

        return queryset

class FeedPreparationViewSet(viewsets.ModelViewSet):
    serializer_class = FeedPreparationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PROPRIETAIRE':
            queryset = FeedPreparation.objects.filter(lot__farm__owner=user)
        else:
            queryset = FeedPreparation.objects.filter(lot__farm__employees__user=user)
            
        lot_id = self.request.query_params.get('lot')
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
            
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        ActivityLog.objects.create(
            user=self.request.user,
            farm=instance.lot.farm,
            lot=instance.lot,
            action="Préparation Aliment",
            module="Alimentation",
            related_id=instance.id,
            description=f"Mélange : {instance.quantity_produced_kg} kg de {instance.feed_name} (Lot {instance.lot.name})"
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'ANNULEE':
            return Response({"detail": "Cette préparation est déjà annulée."}, status=status.HTTP_400_BAD_REQUEST)

        # Validation chronologique
        from .serializers import validate_prepared_feed_integrity
        ok, err = validate_prepared_feed_integrity(instance.lot, instance.feed_name, exclude_id=instance.id)
        if not ok:
            return Response({"detail": f"Impossible d'annuler : {err}"}, status=status.HTTP_400_BAD_REQUEST)

        # Restore inventory
        from .models import PreparedFeedInventory
        prepared_inventory, created = PreparedFeedInventory.objects.get_or_create(
            lot=instance.lot,
            feed_name=instance.feed_name,
            defaults={'quantity_kg': 0}
        )
        prepared_inventory.quantity_kg += instance.quantity_produced_kg
        prepared_inventory.save()

        instance.status = 'ANNULEE'
        instance.save()

        desc = f"Préparation de {instance.quantity_produced_kg}kg ({instance.feed_name}) annulée"
        updated = ActivityLog.objects.filter(related_id=instance.id, module="Alimentation", action__icontains="Préparation").update(
            action="Mélange Annulé",
            description=desc
        )
        if not updated:
            ActivityLog.objects.create(
                user=self.request.user,
                farm=instance.lot.farm,
                lot=instance.lot,
                action="Mélange Annulé",
                module="Alimentation",
                related_id=instance.id,
                description=desc
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
