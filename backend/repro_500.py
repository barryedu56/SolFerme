import os
import django
import sys

# Ensure project root is in sys.path
sys.path.append('D:/SolFerme/backend')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Employee
from farm_management.views import EmployeeViewSet
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

def test_update(user, employee_id, data, label):
    factory = APIRequestFactory()
    url = f'/api/employees/{employee_id}/'
    request = factory.patch(url, data, format='json')
    force_authenticate(request, user=user)

    view = EmployeeViewSet.as_view({'patch': 'partial_update'})

    print(f"--- Testing: {label} ---")
    print(f"User: {user.email} (Role: {user.role})")
    print(f"Target Employee ID: {employee_id}")
    print(f"Payload: {data}")

    try:
        response = view(request, pk=str(employee_id))
        print(f"Response Status: {response.status_code}")
        if response.status_code == 500:
            print("REPRODUCED: HTTP 500")
        elif response.status_code >= 400:
            print(f"Error Response Data: {response.data}")
        else:
            print("Success")
    except Exception as e:
        import traceback
        print(f"Exception occurred: {e}")
        traceback.print_exc()
    print("-" * 30)

def reproduce():
    # 1. Proprietor updating an employee's status (triggers signal)
    proprietor = User.objects.filter(role='PROPRIETAIRE').first()
    employee = Employee.objects.first()

    if proprietor and employee:
        test_update(proprietor, employee.id, {'status': 'INACTIF'}, "Proprietor updating status (triggers signal)")
        # Reset status
        employee.status = 'ACTIF'
        employee.save()

    # 2. Employee updating themselves (allowed position, but not salary/lots)
    if employee:
        test_update(employee.user, employee.id, {'position': 'New Position'}, "Employee updating own position")

    # 3. Employee updating restricted fields (should be 400, not 500)
    if employee:
        test_update(employee.user, employee.id, {'salary': '1000000'}, "Employee updating own salary (restricted)")

    # 4. Test with profile image if possible
    # (We'd need to mock an image or set a path, but let's see if the above trigger anything first)

if __name__ == "__main__":
    reproduce()
