"""Tests des notifications push / alertes (backend).

Ces tests ne touchent JAMAIS le réseau : sans DeviceToken, `notify_users`
retourne avant tout appel HTTP à Expo. On vérifie donc l'orchestration, pas
l'envoi réel.
"""
from datetime import timedelta, time as dtime
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .models import User, Farm, Lot, ChickenMovement, Reminder, DeviceToken
from .notifications import notify_due_reminders, notify_health_alert


class DeviceTokenAPITest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='o@example.com', name='O', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.other = User.objects.create_user(
            email='e@example.com', name='E', password='Abc123!@#', role='EMPLOYE'
        )
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def test_register_and_reassign_token(self):
        r = self.c.post('/api/devices/', {'token': 'ExponentPushToken[abc]', 'platform': 'android'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)
        dt = DeviceToken.objects.get()
        self.assertEqual(dt.user, self.user)

        # Le même jeton, depuis un autre compte → réaffecté (pas de doublon).
        c2 = APIClient()
        c2.force_authenticate(self.other)
        r2 = c2.post('/api/devices/', {'token': 'ExponentPushToken[abc]'}, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)
        self.assertEqual(DeviceToken.objects.get().user, self.other)

    def test_unregister_token(self):
        self.c.post('/api/devices/', {'token': 'ExponentPushToken[xyz]'}, format='json')
        r = self.c.delete('/api/devices/', {'token': 'ExponentPushToken[xyz]'}, format='json')
        self.assertEqual(r.status_code, 204)
        self.assertEqual(DeviceToken.objects.count(), 0)

    def test_rejects_oversized_token(self):
        r = self.c.post('/api/devices/', {'token': 'x' * 300}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_requires_auth(self):
        r = APIClient().post('/api/devices/', {'token': 't'}, format='json')
        self.assertIn(r.status_code, (401, 403))


class HealthAlertNotificationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='owner@example.com', name='Owner', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='F', capacity=1000)
        self.lot = Lot.objects.create(
            farm=self.farm, name='Lot A', breed='ISA Brown',
            initial_quantity=100, current_quantity=100,
            purchase_date=timezone.now().date(), purchase_price=10000,
        )

    def test_mortality_movement_triggers_notification_on_commit(self):
        with patch('farm_management.notifications.notify_users') as mock_push:
            with self.captureOnCommitCallbacks(execute=True):
                ChickenMovement.objects.create(
                    lot=self.lot, type='MORT', quantity=3,
                    date=timezone.now().date(), status='ACTIVE', created_by=self.user,
                )
            # Le propriétaire est notifié (push).
            self.assertTrue(mock_push.called)
            args = mock_push.call_args[0]
            self.assertIn(self.user, args[0])
            self.assertIn('Mortalité', args[1])

    def test_ajout_movement_does_not_notify(self):
        with patch('farm_management.notifications.notify_users') as mock_push:
            with self.captureOnCommitCallbacks(execute=True):
                ChickenMovement.objects.create(
                    lot=self.lot, type='AJOUT', quantity=10,
                    date=timezone.now().date(), status='ACTIVE', created_by=self.user,
                )
            self.assertFalse(mock_push.called)

    def test_notify_health_alert_is_safe_without_tokens(self):
        mv = ChickenMovement.objects.create(
            lot=self.lot, type='MALADE', quantity=2,
            date=timezone.now().date(), status='ACTIVE', created_by=self.user,
        )
        # Aucun DeviceToken → pas d'appel réseau, pas d'exception.
        notify_health_alert(mv)


class DueRemindersTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='o@example.com', name='O', password='Abc123!@#', role='PROPRIETAIRE'
        )
        self.farm = Farm.objects.create(owner=self.user, name='F', capacity=1000)

    def _reminder(self, date, time=None, status='PENDING'):
        return Reminder.objects.create(
            farm=self.farm, title='Vaccin', type='VACCIN',
            date=date, time=time, status=status, created_by=self.user,
        )

    def test_past_reminder_is_marked_push_sent(self):
        r = self._reminder(timezone.localdate() - timedelta(days=1))
        with patch('farm_management.notifications.notify_users') as mock_push:
            processed = notify_due_reminders()
        r.refresh_from_db()
        self.assertEqual(processed, 1)
        self.assertTrue(r.push_sent)
        self.assertTrue(mock_push.called)

    def test_future_reminder_untouched(self):
        r = self._reminder(timezone.localdate() + timedelta(days=2))
        notify_due_reminders()
        r.refresh_from_db()
        self.assertFalse(r.push_sent)

    def test_not_notified_twice(self):
        self._reminder(timezone.localdate() - timedelta(days=1))
        self.assertEqual(notify_due_reminders(), 1)
        self.assertEqual(notify_due_reminders(), 0)

    def test_push_flag_resets_when_date_pushed_forward(self):
        r = self._reminder(timezone.localdate() - timedelta(days=1))
        notify_due_reminders()
        r.refresh_from_db()
        self.assertTrue(r.push_sent)
        # On repousse l'échéance (rappel répétitif) → le flag doit se réarmer.
        r.date = timezone.localdate() + timedelta(days=7)
        r.save()
        r.refresh_from_db()
        self.assertFalse(r.push_sent)
