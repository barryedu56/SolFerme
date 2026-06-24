from django.core.management.base import BaseCommand
from django.utils import timezone
from farm_management.models import Reminder

class Command(BaseCommand):
    help = 'Process reminders and mark overdue ones'

    def handle(self, *args, **kwargs):
        today = timezone.now().date()
        overdue_reminders = Reminder.objects.filter(status='PENDING', date__lt=today)
        count = overdue_reminders.update(status='OVERDUE')
        
        self.stdout.write(self.style.SUCCESS(f'Successfully updated {count} overdue reminders.'))
