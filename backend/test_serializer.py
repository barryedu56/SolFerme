import os
import django
import sys

# Ensure project root is in sys.path
sys.path.append('D:/SolFerme/backend')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Employee
from farm_management.serializers import EmployeeSerializer
from rest_framework.test import APIRequestFactory

def test_serialization():
    # Find or create a user with an image
    user = User.objects.filter(id=42).first()
    if not user:
        print("User 42 not found, using first user")
        user = User.objects.first()

    if not user:
        print("No users found")
        return

    # Mock profile image path if not present
    if not user.profile_image:
        user.profile_image = 'profiles/test.jpg'
        user.save()
        print(f"Set dummy profile image for user {user.id}")

    employee = Employee.objects.filter(user=user).first()
    if not employee:
        # Create an employee profile if missing
        from farm_management.models import Farm
        farm = Farm.objects.first()
        if not farm:
            print("No farm found to create employee")
            return
        employee = Employee.objects.create(
            user=user,
            farm=farm,
            position='Test Position',
            salary=1000
        )
        print(f"Created employee profile for user {user.id}")

    factory = APIRequestFactory()
    request = factory.get('/')

    print("--- Testing serialization WITH request context ---")
    serializer = EmployeeSerializer(employee, context={'request': request})
    try:
        data = serializer.data
        print("Serialization successful")
        print(f"User Image URL: {data.get('user_image')}")
    except Exception as e:
        print(f"FAILED with request context: {e}")
        import traceback
        traceback.print_exc()

    print("\n--- Testing serialization WITHOUT request context ---")
    serializer = EmployeeSerializer(employee, context={})
    try:
        data = serializer.data
        print("Serialization successful")
        print(f"User Image URL: {data.get('user_image')}")
    except Exception as e:
        print(f"FAILED without request context: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_serialization()
