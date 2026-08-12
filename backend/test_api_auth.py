import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_login():
    url = f"{BASE_URL}/auth/login/"
    data = {
        "email": "owner@test.com",
        "password": "Test123456"
    }
    try:
        response = requests.post(url, json=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        if response.status_code == 200:
            return response.json().get('access')
    except Exception as e:
        print(f"Error: {e}")
    return None

if __name__ == "__main__":
    test_login()
