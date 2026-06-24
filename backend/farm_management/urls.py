from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, FarmViewSet, LotViewSet, ProductionViewSet, 
    SaleViewSet, FeedViewSet, HealthRecordViewSet, 
    ChickenMovementViewSet, EmployeeViewSet, ExpenseViewSet, ReminderViewSet, PayrollViewSet, AttendanceViewSet, TaskViewSet, ActivityLogViewSet,
    FeedInventoryViewSet, HealthInventoryViewSet, FeedPurchaseViewSet, HealthPurchaseViewSet,
    UserInfoView, ChangePasswordView
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'farms', FarmViewSet, basename='farm')
router.register(r'lots', LotViewSet, basename='lot')
router.register(r'productions', ProductionViewSet, basename='production')
router.register(r'sales', SaleViewSet, basename='sale')
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

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/user/', UserInfoView.as_view(), name='user_info'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
]
