from django.contrib import admin
from .models import (
    User, Farm, FarmUser, Lot, Production, Sale, Feed,
    HealthRecord, ChickenMovement, Employee, Expense,
    FeedInventory, HealthInventory, FeedPurchase, HealthPurchase,
    Reminder, ActivityLog, Payroll, Task, Attendance, HealthAlert,
    PreparedFeedInventory, FeedPreparation, FeedPreparationIngredient,
    Bonus, EmployeeRequest, PasswordResetCode, EggConversion
)

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'role', 'is_staff', 'is_active')
    search_fields = ('email', 'name')

@admin.register(Farm)
class FarmAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'location')

@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display = ('name', 'farm', 'status', 'current_quantity')

admin.site.register(FarmUser)
admin.site.register(Production)
admin.site.register(Sale)
admin.site.register(Feed)
admin.site.register(HealthRecord)
admin.site.register(ChickenMovement)
admin.site.register(Employee)
admin.site.register(Expense)
admin.site.register(FeedInventory)
admin.site.register(HealthInventory)
admin.site.register(FeedPurchase)
admin.site.register(HealthPurchase)
admin.site.register(Reminder)
admin.site.register(ActivityLog)
admin.site.register(Payroll)
admin.site.register(Task)
admin.site.register(Attendance)
admin.site.register(HealthAlert)
admin.site.register(PreparedFeedInventory)
admin.site.register(FeedPreparation)
admin.site.register(FeedPreparationIngredient)
admin.site.register(Bonus)
admin.site.register(EmployeeRequest)
admin.site.register(PasswordResetCode)
admin.site.register(EggConversion)
