import csv
from datetime import timedelta
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import ScopedRateThrottle
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncMonth, TruncDate
from .models import (
    User, Farm, Lot, Production, Sale, AdminAuditLog, ActivityLog,
    HealthRecord, Expense, Employee
)
from .serializers import UserSerializer, FarmSerializer, ActivityLogSerializer, LotSerializer
from .permissions import IsSuperAdmin
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import serializers


# ─────────────────────────────────────────────────────────────────────────────
# Pagination admin — scope SuperAdmin uniquement (les endpoints métier ne sont
# pas impactés). Évite de renvoyer des dizaines de milliers de lignes d'un coup.
# ─────────────────────────────────────────────────────────────────────────────

class AdminPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


# ─────────────────────────────────────────────────────────────────────────────
# Serializers admin-only
# ─────────────────────────────────────────────────────────────────────────────

class AdminAuditLogSerializer(serializers.ModelSerializer):
    admin_user_name = serializers.ReadOnlyField(source='admin_user.name')
    class Meta:
        model = AdminAuditLog
        fields = '__all__'


class AdminFarmSerializer(serializers.ModelSerializer):
    """Serializer ferme pour le SuperAdmin : expose le nom du propriétaire.
    (Le FarmSerializer métier sérialise `owner` en simple ID.)"""
    owner_name = serializers.ReadOnlyField(source='owner.name')
    owner_email = serializers.ReadOnlyField(source='owner.email')

    class Meta:
        model = Farm
        fields = [
            'id', 'name', 'location', 'capacity', 'status',
            'owner', 'owner_name', 'owner_email', 'created_at', 'updated_at',
        ]


class AdminUserSerializer(serializers.ModelSerializer):
    """Serializer lecture étendue pour le SuperAdmin (is_active visible)."""
    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'phone', 'address',
            'profile_image', 'role', 'is_active', 'is_superuser',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'email', 'is_superuser', 'created_at', 'updated_at']


# ─────────────────────────────────────────────────────────────────────────────
# Profil SuperAdmin
# ─────────────────────────────────────────────────────────────────────────────

class AdminProfileView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        """Retourne les données réelles du SuperAdmin connecté."""
        user = request.user
        # Récupérer la dernière connexion depuis l'audit
        last_login_log = AdminAuditLog.objects.filter(
            admin_user=user,
            action='ADMIN_LOGIN'
        ).order_by('-created_at').first()

        data = {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'phone': user.phone,
            'address': user.address,
            'profile_image': request.build_absolute_uri(user.profile_image.url) if user.profile_image else None,
            'role': 'SuperAdmin',
            'is_active': user.is_active,
            'created_at': user.created_at,
            'updated_at': user.updated_at,
            'last_login': last_login_log.created_at if last_login_log else None,
        }
        return Response(data)

    def patch(self, request):
        """Met à jour les champs autorisés du SuperAdmin."""
        user = request.user
        allowed_fields = ['name', 'phone', 'address']
        updated = {}
        for field in allowed_fields:
            if field in request.data:
                setattr(user, field, request.data[field])
                updated[field] = request.data[field]

        if not updated:
            return Response({'detail': 'Aucun champ modifiable fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.db import IntegrityError
        try:
            user.save()
        except IntegrityError as e:
            if 'phone' in str(e).lower():
                return Response({'detail': 'Ce numéro de téléphone est déjà utilisé.'}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'detail': 'Une erreur de base de données est survenue (doublon potentiel).'}, status=status.HTTP_400_BAD_REQUEST)

        AdminAuditLog.objects.create(
            admin_user=user,
            action='MODIFICATION_PROFIL',
            target_type='USER',
            target_id=str(user.id),
            details={'updated_fields': list(updated.keys())},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response({'detail': 'Profil mis à jour.', 'updated': updated})


class AdminChangePasswordView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        user = request.user
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        if not user.check_password(old_password):
            return Response(
                {'error': "L'ancien mot de passe est incorrect."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if new_password != confirm_password:
            return Response(
                {'error': "La confirmation du mot de passe ne correspond pas."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        # Révoquer les sessions JWT existantes : après un changement de mot de passe,
        # les anciens refresh tokens ne doivent plus être utilisables.
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass

        AdminAuditLog.objects.create(
            admin_user=user,
            action='CHANGEMENT_MOT_DE_PASSE',
            target_type='USER',
            target_id=str(user.id),
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response({'detail': 'Mot de passe modifié avec succès.'})


# ─────────────────────────────────────────────────────────────────────────────
# Statistiques globales (Dashboard)
# ─────────────────────────────────────────────────────────────────────────────

class AdminStatsViewSet(viewsets.ViewSet):
    permission_classes = [IsSuperAdmin]

    def list(self, request):
        total_users = User.objects.count()
        total_owners = User.objects.filter(role='PROPRIETAIRE').count()
        total_employees = User.objects.filter(role='EMPLOYE').count()
        active_users = User.objects.filter(is_active=True, is_superuser=False).count()
        inactive_users = User.objects.filter(is_active=False).count()

        active_farms = Farm.objects.filter(status='ACTIF').count()
        archived_farms = Farm.objects.filter(status='ARCHIVE').count()
        total_farms = active_farms + archived_farms
        total_lots = Lot.objects.count()

        total_production = Production.objects.filter(status='ACTIVE').aggregate(
            total=Sum('casiers_produits')
        )['total'] or 0
        total_sales = Sale.objects.filter(status='ACTIVE').aggregate(
            total=Sum('total_amount')
        )['total'] or 0

        # Pas d'audit ici : le dashboard est rechargé/rafraîchi en permanence,
        # une entrée par consultation n'apporte aucune valeur de sécurité et fait
        # gonfler AdminAuditLog. L'audit est réservé aux vraies actions admin.

        return Response({
            'total_users': total_users,
            'total_owners': total_owners,
            'total_employees': total_employees,
            'active_users': active_users,
            'inactive_users': inactive_users,
            'total_farms': total_farms,
            'active_farms': active_farms,
            'archived_farms': archived_farms,
            'total_lots': total_lots,
            'total_production': total_production,
            'total_sales': float(total_sales),
        })


# ─────────────────────────────────────────────────────────────────────────────
# Graphiques Dashboard
# ─────────────────────────────────────────────────────────────────────────────

class AdminChartsViewSet(viewsets.ViewSet):
    permission_classes = [IsSuperAdmin]

    def list(self, request):
        users_by_month = list(
            User.objects.annotate(month=TruncMonth('created_at'))
            .values('month').annotate(count=Count('id')).order_by('month')
        )
        farms_by_month = list(
            Farm.objects.annotate(month=TruncMonth('created_at'))
            .values('month').annotate(count=Count('id')).order_by('month')
        )

        for item in users_by_month:
            if item['month']:
                item['month'] = item['month'].strftime('%Y-%m')
        for item in farms_by_month:
            if item['month']:
                item['month'] = item['month'].strftime('%Y-%m')

        return Response({
            'users_by_month': users_by_month,
            'farms_by_month': farms_by_month,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Rapports Analytics
# ─────────────────────────────────────────────────────────────────────────────

def _parse_period(period_str):
    """Retourne (date_start, date_start_prev) selon la période choisie."""
    now = timezone.now()
    period_map = {
        '1d': 1, '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365,
    }
    days = period_map.get(period_str, 30)
    date_start = now - timedelta(days=days)
    date_start_prev = date_start - timedelta(days=days)
    return date_start, date_start_prev, now


class AdminReportsViewSet(viewsets.ViewSet):
    permission_classes = [IsSuperAdmin]

    def list(self, request):
        """KPIs avec variation par rapport à la période précédente."""
        period = request.query_params.get('period', '30d')
        date_start, date_start_prev, now = _parse_period(period)

        def variation(current, prev):
            if prev == 0:
                return None
            return round(((current - prev) / prev) * 100, 1)

        # Utilisateurs
        new_users = User.objects.filter(created_at__gte=date_start).count()
        new_users_prev = User.objects.filter(
            created_at__gte=date_start_prev, created_at__lt=date_start
        ).count()
        total_users = User.objects.count()

        # Fermes
        new_farms = Farm.objects.filter(created_at__gte=date_start).count()
        new_farms_prev = Farm.objects.filter(
            created_at__gte=date_start_prev, created_at__lt=date_start
        ).count()
        total_farms = Farm.objects.count()

        # Lots
        new_lots = Lot.objects.filter(created_at__gte=date_start).count()
        new_lots_prev = Lot.objects.filter(
            created_at__gte=date_start_prev, created_at__lt=date_start
        ).count()

        # Production (par date de création)
        prod_current = Production.objects.filter(
            status='ACTIVE', created_at__gte=date_start
        ).aggregate(total=Sum('casiers_produits'))['total'] or 0
        prod_prev = Production.objects.filter(
            status='ACTIVE', created_at__gte=date_start_prev, created_at__lt=date_start
        ).aggregate(total=Sum('casiers_produits'))['total'] or 0

        # Ventes (CA)
        sales_current = Sale.objects.filter(
            status='ACTIVE', created_at__gte=date_start
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        sales_prev = Sale.objects.filter(
            status='ACTIVE', created_at__gte=date_start_prev, created_at__lt=date_start
        ).aggregate(total=Sum('total_amount'))['total'] or 0

        # Activité (nombre d'actions)
        activity_current = ActivityLog.objects.filter(date__gte=date_start).count()
        activity_prev = ActivityLog.objects.filter(
            date__gte=date_start_prev, date__lt=date_start
        ).count()

        # Evolution temporelle (pour les graphiques)
        users_evolution = list(
            User.objects.filter(created_at__gte=date_start)
            .annotate(day=TruncDate('created_at'))
            .values('day').annotate(count=Count('id')).order_by('day')
        )
        for item in users_evolution:
            if item['day']:
                item['day'] = item['day'].strftime('%Y-%m-%d')

        farms_evolution = list(
            Farm.objects.filter(created_at__gte=date_start)
            .annotate(day=TruncDate('created_at'))
            .values('day').annotate(count=Count('id')).order_by('day')
        )
        for item in farms_evolution:
            if item['day']:
                item['day'] = item['day'].strftime('%Y-%m-%d')

        activity_evolution = list(
            ActivityLog.objects.filter(date__gte=date_start)
            .annotate(day=TruncDate('date'))
            .values('day').annotate(count=Count('id')).order_by('day')
        )
        for item in activity_evolution:
            if item['day']:
                item['day'] = item['day'].strftime('%Y-%m-%d')

        # Activité récente (top 10)
        recent_activity = list(
            ActivityLog.objects.filter(date__gte=date_start)
            .select_related('user', 'farm')
            .order_by('-date')[:10]
            .values('id', 'action', 'module', 'description', 'date',
                    'user__name', 'farm__name')
        )
        for item in recent_activity:
            if item['date']:
                item['date'] = item['date'].strftime('%Y-%m-%dT%H:%M:%S')

        return Response({
            'period': period,
            'kpi': {
                'new_users': new_users,
                'new_users_variation': variation(new_users, new_users_prev),
                'total_users': total_users,
                'new_farms': new_farms,
                'new_farms_variation': variation(new_farms, new_farms_prev),
                'total_farms': total_farms,
                'new_lots': new_lots,
                'new_lots_variation': variation(new_lots, new_lots_prev),
                'production': int(prod_current),
                'production_variation': variation(int(prod_current), int(prod_prev)),
                'sales_revenue': float(sales_current),
                'sales_variation': variation(float(sales_current), float(sales_prev)),
                'activity_count': activity_current,
                'activity_variation': variation(activity_current, activity_prev),
            },
            'evolution': {
                'users': users_evolution,
                'farms': farms_evolution,
                'activity': activity_evolution,
            },
            'recent_activity': recent_activity,
        })

    @action(detail=False, methods=['get'])
    def module_usage(self, request):
        """Utilisation par module depuis ActivityLog."""
        period = request.query_params.get('period', '30d')
        date_start, _, _ = _parse_period(period)

        usage = list(
            ActivityLog.objects.filter(date__gte=date_start)
            .values('module')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        return Response({'period': period, 'usage': usage})

    @action(detail=False, methods=['get'])
    def user_distribution(self, request):
        """Répartition des utilisateurs."""
        owners = User.objects.filter(role='PROPRIETAIRE', is_superuser=False).count()
        employees = User.objects.filter(role='EMPLOYE').count()
        active = User.objects.filter(is_active=True, is_superuser=False).count()
        inactive = User.objects.filter(is_active=False).count()
        return Response({
            'proprietaires': owners,
            'employes': employees,
            'actifs': active,
            'inactifs': inactive,
        })

    @action(detail=False, methods=['get'])
    def farm_distribution(self, request):
        """Répartition des fermes."""
        active = Farm.objects.filter(status='ACTIF').count()
        archived = Farm.objects.filter(status='ARCHIVE').count()
        return Response({
            'actives': active,
            'archivees': archived,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Gestion Utilisateurs
# ─────────────────────────────────────────────────────────────────────────────

class AdminUserViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsSuperAdmin]
    pagination_class = AdminPagination
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        queryset = User.objects.all().order_by('-created_at')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
            )
        return queryset

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        AdminAuditLog.objects.create(
            admin_user=request.user, action='CONSULTATION_UTILISATEUR',
            target_type='USER', target_id=str(instance.id),
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        user = self.get_object()
        if user.is_active:
            return Response({'detail': 'Le compte est déjà actif.'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = True
        user.save(update_fields=['is_active'])
        AdminAuditLog.objects.create(
            admin_user=request.user, action='ACTIVATION_COMPTE',
            target_type='USER', target_id=str(user.id),
            details={'user_email': user.email},
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response({
            'status': 'Compte activé',
            'user': self.get_serializer(user).data
        })

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {'error': 'Vous ne pouvez pas désactiver votre propre compte.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if user.is_superuser:
            return Response(
                {'error': 'Vous ne pouvez pas désactiver un compte SuperAdmin.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not user.is_active:
            return Response({'detail': 'Le compte est déjà désactivé.'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = False
        user.save(update_fields=['is_active'])
        AdminAuditLog.objects.create(
            admin_user=request.user, action='DESACTIVATION_COMPTE',
            target_type='USER', target_id=str(user.id),
            details={'user_email': user.email},
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response({
            'status': 'Compte désactivé',
            'user': self.get_serializer(user).data
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            import io
            
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)
            elements = []
            
            styles = getSampleStyleSheet()
            elements.append(Paragraph("Liste des Utilisateurs - SolFerme", styles['Title']))
            elements.append(Spacer(1, 12))
            
            data = [['ID', 'Nom', 'Email', 'Rôle', 'Actif', 'Création']]
            for user in self.get_queryset():
                data.append([
                    str(user.id), 
                    (user.name[:25] + '..') if user.name and len(user.name) > 25 else (user.name or ""), 
                    (user.email[:30] + '..') if user.email and len(user.email) > 30 else (user.email or ""), 
                    user.role,
                    'Oui' if user.is_active else 'Non',
                    user.created_at.strftime('%Y-%m-%d %H:%M') if user.created_at else ''
                ])
                
            t = Table(data, colWidths=[40, 160, 200, 100, 60, 120])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3498db')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,0), 12),
                ('BOTTOMPADDING', (0,0), (-1,0), 12),
                ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f5f6fa')),
                ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#bdc3c7'))
            ]))
            
            elements.append(t)
            doc.build(elements)
            
            response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="utilisateurs_solferme.pdf"'
            
            AdminAuditLog.objects.create(
                admin_user=request.user, action='EXPORT_UTILISATEURS_PDF',
                target_type='SYSTEM', target_id='ALL',
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return response
        except ImportError:
            # Fallback to CSV if reportlab is not installed somehow
            import csv
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="utilisateurs.csv"'
            response.write('\ufeff')
            writer = csv.writer(response)
            writer.writerow(['ID', 'Nom', 'Email', 'Rôle', 'Actif', 'Création'])
            for user in self.get_queryset():
                writer.writerow([
                    user.id, user.name, user.email, user.role,
                    'Oui' if user.is_active else 'Non',
                    user.created_at.strftime('%Y-%m-%d %H:%M') if user.created_at else ''
                ])
            return response


# ─────────────────────────────────────────────────────────────────────────────
# Gestion Fermes
# ─────────────────────────────────────────────────────────────────────────────

class AdminFarmViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsSuperAdmin]
    pagination_class = AdminPagination
    queryset = Farm.objects.select_related('owner').all().order_by('-created_at')
    serializer_class = AdminFarmSerializer

    def get_queryset(self):
        queryset = Farm.objects.select_related('owner').all().order_by('-created_at')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(location__icontains=search)
            )
        return queryset

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        AdminAuditLog.objects.create(
            admin_user=request.user, action='CONSULTATION_FERME',
            target_type='FARM', target_id=str(instance.id),
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Statistiques complètes d'une ferme pour la supervision SuperAdmin."""
        farm = self.get_object()

        # Lots
        lots = farm.lots.all()
        lots_total = lots.count()
        lots_actifs = lots.filter(status='ACTIF').count()
        lots_termines = lots.filter(status='TERMINE').count()

        # Employés
        employees_total = farm.employees.count()

        # Production (via lots)
        lot_ids = list(lots.values_list('id', flat=True))
        production_total = Production.objects.filter(
            lot_id__in=lot_ids, status='ACTIVE'
        ).aggregate(total=Sum('casiers_produits'))['total'] or 0

        # Ventes
        sales_qs = Sale.objects.filter(lot_id__in=lot_ids, status='ACTIVE')
        sales_count = sales_qs.count()
        sales_total = sales_qs.aggregate(total=Sum('total_amount'))['total'] or 0

        # Dépenses ferme
        expenses_total = Expense.objects.filter(
            farm=farm, status='ACTIVE'
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Alertes sanitaires
        health_alerts = HealthRecord.objects.filter(
            lot_id__in=lot_ids, status='ACTIVE'
        ).count()

        # Activité récente (derniers 10 logs liés à cette ferme)
        recent_activity = list(
            ActivityLog.objects.filter(farm=farm)
            .select_related('user')
            .order_by('-date')[:10]
            .values('action', 'module', 'description', 'date', 'user__name')
        )
        for item in recent_activity:
            if item['date']:
                item['date'] = item['date'].strftime('%Y-%m-%dT%H:%M:%S')

        # Données propriétaire
        owner = farm.owner
        owner_data = {
            'id': owner.id,
            'name': owner.name,
            'email': owner.email,
            'phone': owner.phone,
            'is_active': owner.is_active,
        }

        # Lots détaillés
        lots_data = LotSerializer(lots.order_by('-created_at'), many=True).data

        return Response({
            'farm': {
                'id': farm.id,
                'name': farm.name,
                'location': farm.location,
                'capacity': farm.capacity,
                'status': farm.status,
                'created_at': farm.created_at,
                'updated_at': farm.updated_at,
            },
            'owner': owner_data,
            'kpi': {
                'lots_total': lots_total,
                'lots_actifs': lots_actifs,
                'lots_termines': lots_termines,
                'employees_total': employees_total,
                'production_total': int(production_total),
                'sales_count': sales_count,
                'sales_total': float(sales_total),
                'expenses_total': float(expenses_total),
                'health_records': health_alerts,
            },
            'lots': lots_data,
            'recent_activity': recent_activity,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Audit Log
# ─────────────────────────────────────────────────────────────────────────────

class AdminAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsSuperAdmin]
    pagination_class = AdminPagination
    queryset = AdminAuditLog.objects.all().order_by('-created_at')
    serializer_class = AdminAuditLogSerializer


# ─────────────────────────────────────────────────────────────────────────────
# Activité Globale
# ─────────────────────────────────────────────────────────────────────────────

class AdminActivityViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsSuperAdmin]
    pagination_class = AdminPagination
    serializer_class = ActivityLogSerializer

    def get_queryset(self):
        queryset = ActivityLog.objects.select_related('user', 'farm').order_by('-date')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(action__icontains=search) |
                Q(module__icontains=search) |
                Q(description__icontains=search)
            )
        return queryset


# ─────────────────────────────────────────────────────────────────────────────
# Authentification Admin
# ─────────────────────────────────────────────────────────────────────────────

class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    def _client_ip(self):
        request = self.context.get('request')
        return request.META.get('REMOTE_ADDR') if request else None

    def validate(self, attrs):
        # ── Étape 1 : validation / authentification (AUCUNE écriture DB ici) ──
        try:
            data = super().validate(attrs)
            auth_ok = True
        except Exception:
            auth_ok = False

        # ── Étape 2 : décision + journalisation (défensive) ──
        if auth_ok and self.user.is_superuser:
            if not self.user.is_active:
                raise serializers.ValidationError({"detail": "Ce compte est désactivé."})
            # Un échec d'écriture du journal ne doit PAS transformer une
            # connexion valide en "Email ou mot de passe incorrect."
            try:
                AdminAuditLog.objects.create(
                    admin_user=self.user, action='ADMIN_LOGIN',
                    target_type='SYSTEM', target_id=str(self.user.id),
                    details={'email': self.user.email},
                    ip_address=self._client_ip(),
                )
            except Exception:
                pass
            return data

        # Echec : identifiants invalides OU compte non-SuperAdmin.
        # Message générique unique — ne jamais révéler l'existence du SuperAdmin.
        email = attrs.get("email")
        if email:
            try:
                user = User.objects.filter(email=email).first()
                if user and user.is_superuser:
                    AdminAuditLog.objects.create(
                        admin_user=None, action='ADMIN_LOGIN_FAILED',
                        target_type='SYSTEM', target_id=str(user.id),
                        details={'email': email},
                        ip_address=self._client_ip(),
                    )
            except Exception:
                pass
        raise serializers.ValidationError({"detail": "Email ou mot de passe incorrect."})


class AdminTokenObtainPairView(TokenObtainPairView):
    serializer_class = AdminTokenObtainPairSerializer
    # Anti-brute-force renforcé sur l'accès SuperAdmin : 5 tentatives / minute / IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'admin_login'
