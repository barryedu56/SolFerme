from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, FarmViewSet, FarmUserViewSet, LotViewSet, ProductionViewSet,
    SaleViewSet, SalePaymentViewSet, FeedViewSet, HealthRecordViewSet,
    ChickenMovementViewSet, EmployeeViewSet, ExpenseViewSet, ReminderViewSet, PayrollViewSet, AttendanceViewSet, TaskViewSet, ActivityLogViewSet,
    FeedInventoryViewSet, HealthInventoryViewSet, FeedPurchaseViewSet, HealthPurchaseViewSet, HealthAlertViewSet,
    PreparedFeedInventoryViewSet, FeedPreparationViewSet, BonusViewSet,
    EmployeeRequestViewSet, LotExpenseViewSet, EggConversionViewSet,
    UserInfoView, ChangePasswordView, LogoutView, CustomTokenObtainPairView,
    PasswordResetRequestView, PasswordResetConfirmView, ContactMessageView,
    DeviceTokenView
)
from rest_framework_simplejwt.views import (
    TokenRefreshView,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'farm-users', FarmUserViewSet, basename='farm-user')
router.register(r'farms', FarmViewSet, basename='farm')
router.register(r'lots', LotViewSet, basename='lot')
router.register(r'productions', ProductionViewSet, basename='production')
router.register(r'sales', SaleViewSet, basename='sale')
router.register(r'sale-payments', SalePaymentViewSet, basename='sale-payment')
router.register(r'feeds', FeedViewSet, basename='feed')
router.register(r'health-records', HealthRecordViewSet, basename='healthrecord')
router.register(r'movements', ChickenMovementViewSet, basename='chickenmovement')
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'reminders', ReminderViewSet, basename='reminder')
router.register(r'payrolls', PayrollViewSet, basename='payroll')
router.register(r'attendances', AttendanceViewSet, basename='attendance')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'activity-logs', ActivityLogViewSet, basename='activitylog')
router.register(r'feed-inventory', FeedInventoryViewSet, basename='feed-inventory')
router.register(r'health-inventory', HealthInventoryViewSet, basename='health-inventory')
router.register(r'feed-purchases', FeedPurchaseViewSet, basename='feed-purchase')
router.register(r'health-purchases', HealthPurchaseViewSet, basename='health-purchase')
router.register(r'health-alerts', HealthAlertViewSet, basename='health-alert')
router.register(r'prepared-feed-inventory', PreparedFeedInventoryViewSet, basename='prepared-feed-inventory')
router.register(r'feed-preparations', FeedPreparationViewSet, basename='feed-preparation')
router.register(r'bonuses', BonusViewSet, basename='bonus')
router.register(r'employee-requests', EmployeeRequestViewSet, basename='employee-request')
router.register(r'lot-expenses', LotExpenseViewSet, basename='lot-expense')
router.register(r'egg-conversions', EggConversionViewSet, basename='egg-conversion')

from .admin_views import (
    AdminStatsViewSet, AdminUserViewSet, AdminFarmViewSet,
    AdminAuditLogViewSet, AdminTokenObtainPairView,
    AdminChartsViewSet, AdminActivityViewSet, AdminReportsViewSet,
    AdminProfileView, AdminChangePasswordView,
)

admin_router = DefaultRouter()
admin_router.register(r'overview', AdminStatsViewSet, basename='admin-overview')
admin_router.register(r'charts', AdminChartsViewSet, basename='admin-charts')
admin_router.register(r'users', AdminUserViewSet, basename='admin-users')
admin_router.register(r'farms', AdminFarmViewSet, basename='admin-farms')
admin_router.register(r'audit-logs', AdminAuditLogViewSet, basename='admin-audit-logs')
admin_router.register(r'activity', AdminActivityViewSet, basename='admin-activity')
admin_router.register(r'reports', AdminReportsViewSet, basename='admin-reports')

urlpatterns = [
    path('admin/auth/login/', AdminTokenObtainPairView.as_view(), name='admin_token_obtain_pair'),
    path('admin/profile/', AdminProfileView.as_view(), name='admin_profile'),
    path('admin/profile/change-password/', AdminChangePasswordView.as_view(), name='admin_change_password'),
    path('admin/', include(admin_router.urls)),
    path('', include(router.urls)),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/user/', UserInfoView.as_view(), name='user_info'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('devices/', DeviceTokenView.as_view(), name='device_token'),
    path('auth/password-reset-request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('auth/password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('contact/', ContactMessageView.as_view(), name='contact_message'),
]
