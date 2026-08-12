import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User

email = 'barryedu56@gmail.com'
password = 'password123'

try:
    user = User.objects.get(email=email)
    user.set_password(password)
    user.save()
    print(f"Password reset for {email}")
except User.DoesNotExist:
    print(f"User {email} not found")
