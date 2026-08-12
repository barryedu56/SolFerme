import os
import django
from rest_framework.test import APIClient
from rest_framework import status

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'solferme_api.settings')
django.setup()

from farm_management.models import User, Employee

def reproduce():
    client = APIClient()

    # Use a proprietor user
    proprietor = User.objects.filter(role='PROPRIETAIRE').first()
    if not proprietor:
        print("No proprietor found")
        return

    client.force_authenticate(user=proprietor)

    employee = Employee.objects.first()
    if not employee:
        print("No employee found")
        return

    print(f"Testing update on Employee ID: {employee.id} (User: {employee.user.name})")

    # Try a partial update
    url = f'/api/employees/{employee.id}/'
    data = {'position': 'Updated Position'}

    try:
        response = client.patch(url, data, format='json')
        print(f"PATCH Response Status: {response.status_code}")
        if response.status_code == 500:
            print("REPRODUCED: HTTP 500")
            if hasattr(response, 'data'):
                print(f"Response Data: {response.data}")
            else:
                print("No response data (check server console/logs)")
        else:
            print(f"Response content: {response.content.decode('utf-8')[:500]}")
    except Exception as e:
        print(f"Exception occurred: {e}")

if __name__ == "__main__":
    reproduce()
