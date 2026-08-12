from django.test import TestCase

from .models import Farm, Lot, User
from .serializers import FarmSerializer, LotSerializer


class LotCapacityValidationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            password='Abc123!@#',
            name='Owner',
            role='PROPRIETAIRE',
        )
        self.farm = Farm.objects.create(
            owner=self.owner,
            name='Ferme test',
            capacity=5000,
        )

    def test_farm_capacity_is_serialized_and_saved(self):
        serializer = FarmSerializer(instance=self.farm, data={'capacity': 7000}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        farm = serializer.save()
        self.assertEqual(farm.capacity, 7000)

    def test_lot_quantity_cannot_exceed_farm_capacity(self):
        serializer = LotSerializer(data={
            'farm': self.farm.id,
            'name': 'Lot 1',
            'breed': 'ISA Brown',
            'initial_quantity': 8000,
            'current_quantity': 8000,
            'purchase_date': '2026-01-01',
            'purchase_price': '100.00',
            'status': 'ACTIF',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('capacité', str(serializer.errors['non_field_errors'][0]))
