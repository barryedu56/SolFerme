"""
Tests de sécurité et d'isolation pour le SuperAdmin SolFerme.
Couvre :
  - Phase A : Isolation de UserViewSet (Propriétaire ne voit PAS les données d'autres)
  - Phase B : Permission IsSuperAdmin (403 pour non-superusers)
  - Phase D : Endpoints /api/admin/* accessibles uniquement au SuperAdmin
  - Phase E : Création de AdminAuditLog lors des actions admin
  - Phase O : SuperAdmin n'est pas affecté par les routes métier
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from farm_management.models import User, Farm, Employee, AdminAuditLog


def create_user(email, name, role='PROPRIETAIRE', is_superuser=False, password='Test1234!'):
    user = User.objects.create_user(
        email=email, name=name, password=password, role=role
    )
    if is_superuser:
        user.is_superuser = True
        user.is_staff = True
        user.save()
    return user


class TestUserViewSetIsolation(TestCase):
    """
    Phase A : Un PROPRIETAIRE ne doit voir que ses propres employés.
    """

    def setUp(self):
        self.client = APIClient()

        # Propriétaire A avec sa ferme et son employé
        self.owner_a = create_user('owner_a@test.com', 'Owner A')
        self.farm_a = Farm.objects.create(owner=self.owner_a, name='Ferme A', capacity=100)
        self.emp_user_a = create_user('emp_a@test.com', 'Employe A', role='EMPLOYE')
        Employee.objects.create(user=self.emp_user_a, farm=self.farm_a, position='Worker', salary=100000)

        # Propriétaire B avec sa ferme et son employé
        self.owner_b = create_user('owner_b@test.com', 'Owner B')
        self.farm_b = Farm.objects.create(owner=self.owner_b, name='Ferme B', capacity=100)
        self.emp_user_b = create_user('emp_b@test.com', 'Employe B', role='EMPLOYE')
        Employee.objects.create(user=self.emp_user_b, farm=self.farm_b, position='Worker', salary=100000)

    def test_owner_a_cannot_see_owner_b(self):
        """Propriétaire A ne doit pas voir Propriétaire B dans GET /api/users/."""
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.get('/api/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [u['id'] for u in res.data]
        self.assertNotIn(self.owner_b.id, ids, "Owner A ne doit pas voir Owner B")

    def test_owner_a_cannot_see_employee_of_b(self):
        """Propriétaire A ne doit pas voir les employés de B."""
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.get('/api/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [u['id'] for u in res.data]
        self.assertNotIn(self.emp_user_b.id, ids, "Owner A ne doit pas voir Employe B")

    def test_owner_a_sees_own_employee(self):
        """Propriétaire A doit voir ses propres employés."""
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.get('/api/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [u['id'] for u in res.data]
        self.assertIn(self.emp_user_a.id, ids, "Owner A doit voir Employe A")

    def test_owner_a_sees_himself(self):
        """Propriétaire A doit se voir lui-même."""
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.get('/api/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [u['id'] for u in res.data]
        self.assertIn(self.owner_a.id, ids, "Owner A doit se voir lui-même")

    def test_unauthenticated_cannot_access_users(self):
        """Non authentifié doit recevoir 401."""
        res = self.client.get('/api/users/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class TestIsSuperAdminPermission(TestCase):
    """
    Phase B : La permission IsSuperAdmin bloque les non-superusers avec 403.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = create_user('superadmin@test.com', 'Super Admin', is_superuser=True)
        self.owner = create_user('owner@test.com', 'Owner Normal')
        self.employee = create_user('emp@test.com', 'Employe Normal', role='EMPLOYE')

    def test_superadmin_can_access_overview(self):
        """SuperAdmin doit pouvoir accéder à /api/admin/overview/."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/overview/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_owner_cannot_access_admin_overview(self):
        """Un PROPRIETAIRE ne doit pas accéder à /api/admin/overview/ (403)."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.get('/api/admin/overview/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_cannot_access_admin_overview(self):
        """Un EMPLOYE ne doit pas accéder à /api/admin/overview/ (403)."""
        self.client.force_authenticate(user=self.employee)
        res = self.client.get('/api/admin/overview/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_access_admin_overview(self):
        """Non authentifié doit recevoir 401."""
        res = self.client.get('/api/admin/overview/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_superadmin_can_access_admin_users(self):
        """SuperAdmin doit pouvoir accéder à /api/admin/users/."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_owner_cannot_access_admin_users(self):
        """Un PROPRIETAIRE ne doit pas accéder à /api/admin/users/ (403)."""
        self.client.force_authenticate(user=self.owner)
        res = self.client.get('/api/admin/users/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_access_admin_farms(self):
        """SuperAdmin doit pouvoir accéder à /api/admin/farms/."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/farms/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_superadmin_can_access_audit_logs(self):
        """SuperAdmin doit pouvoir accéder à /api/admin/audit-logs/."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/audit-logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class TestAdminUserActions(TestCase):
    """
    Phase D/E : Actions d'activation/désactivation + enregistrement dans AdminAuditLog.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = create_user('superadmin@test.com', 'Super Admin', is_superuser=True)
        self.target_user = create_user('target@test.com', 'Target User')

    def test_superadmin_can_deactivate_user(self):
        """SuperAdmin peut désactiver un compte."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(f'/api/admin/users/{self.target_user.id}/deactivate/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target_user.refresh_from_db()
        self.assertFalse(self.target_user.is_active)

    def test_deactivation_creates_audit_log(self):
        """La désactivation doit créer une entrée dans AdminAuditLog."""
        self.client.force_authenticate(user=self.superadmin)
        self.client.post(f'/api/admin/users/{self.target_user.id}/deactivate/')
        log = AdminAuditLog.objects.filter(
            action='DESACTIVATION_COMPTE',
            target_id=str(self.target_user.id)
        ).first()
        self.assertIsNotNone(log, "AdminAuditLog doit être créé lors d'une désactivation")
        self.assertEqual(log.admin_user, self.superadmin)

    def test_superadmin_can_reactivate_user(self):
        """SuperAdmin peut réactiver un compte désactivé."""
        self.target_user.is_active = False
        self.target_user.save()
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(f'/api/admin/users/{self.target_user.id}/activate/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.is_active)

    def test_activation_creates_audit_log(self):
        """L'activation doit créer une entrée dans AdminAuditLog."""
        self.target_user.is_active = False
        self.target_user.save()
        self.client.force_authenticate(user=self.superadmin)
        self.client.post(f'/api/admin/users/{self.target_user.id}/activate/')
        log = AdminAuditLog.objects.filter(
            action='ACTIVATION_COMPTE',
            target_id=str(self.target_user.id)
        ).first()
        self.assertIsNotNone(log, "AdminAuditLog doit être créé lors d'une activation")

    def test_superadmin_cannot_deactivate_himself(self):
        """SuperAdmin ne peut pas désactiver son propre compte."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(f'/api/admin/users/{self.superadmin.id}/deactivate/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.superadmin.refresh_from_db()
        self.assertTrue(self.superadmin.is_active)

    def test_owner_cannot_deactivate_user(self):
        """Un PROPRIETAIRE ne peut pas utiliser l'endpoint de désactivation admin."""
        owner = create_user('owner2@test.com', 'Owner')
        self.client.force_authenticate(user=owner)
        res = self.client.post(f'/api/admin/users/{self.target_user.id}/deactivate/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.is_active)


class TestSuperAdminOverviewStats(TestCase):
    """
    Phase L : Statistiques calculées côté backend, pas d'inventaire toutes-données.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = create_user('superadmin@test.com', 'Super Admin', is_superuser=True)
        # Créer quelques données
        owner = create_user('owner_stats@test.com', 'Owner Stats')
        Farm.objects.create(owner=owner, name='Ferme Stats', capacity=200)

    def test_overview_returns_expected_keys(self):
        """L'endpoint overview doit retourner les clés statistiques attendues."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/overview/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        expected_keys = [
            'total_users', 'total_owners', 'total_employees',
            'active_farms', 'archived_farms', 'total_lots',
        ]
        for key in expected_keys:
            self.assertIn(key, res.data, f"La clé '{key}' doit être présente dans la réponse overview")

    def test_overview_does_not_expose_passwords(self):
        """L'overview ne doit jamais exposer des mots de passe ou tokens."""
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get('/api/admin/overview/')
        forbidden = ['password', 'hash', 'token', 'secret', 'refresh']
        response_str = str(res.data).lower()
        for f in forbidden:
            self.assertNotIn(f, response_str, f"'{f}' ne doit pas être exposé dans l'overview")


class TestAdminAuthentication(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = create_user('superadmin@test.com', 'Super Admin', is_superuser=True)
        self.owner = create_user('owner@test.com', 'Owner Normal')
        
        # S'assurer du mot de passe
        self.superadmin.set_password('Test1234!')
        self.superadmin.save()
        self.owner.set_password('Test1234!')
        self.owner.save()

    def test_superadmin_can_login_via_admin_auth(self):
        "SuperAdmin peut se connecter via /api/admin/auth/login/."
        res = self.client.post('/api/admin/auth/login/', {'email': 'superadmin@test.com', 'password': 'Test1234!'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)

    def test_superadmin_cannot_login_via_normal_auth(self):
        "SuperAdmin est bloqué sur /api/auth/login/ et reçoit une erreur générique."
        res = self.client.post('/api/auth/login/', {'email': 'superadmin@test.com', 'password': 'Test1234!'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Email ou mot de passe incorrect.', str(res.data))

    def test_owner_cannot_login_via_admin_auth(self):
        "PROPRIETAIRE est bloqué sur /api/admin/auth/login/ et reçoit une erreur générique."
        res = self.client.post('/api/admin/auth/login/', {'email': 'owner@test.com', 'password': 'Test1234!'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Email ou mot de passe incorrect.', str(res.data))

    def test_cannot_create_second_superadmin(self):
        "Le système bloque la création d'un second SuperAdmin."
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            second_admin = create_user('admin2@test.com', 'Admin 2', is_superuser=True)

    def test_login_ok_even_if_audit_write_fails(self):
        "Un échec d'écriture du journal ne doit pas transformer une connexion valide en échec (I4)."
        from unittest.mock import patch
        with patch(
            'farm_management.admin_views.AdminAuditLog.objects.create',
            side_effect=Exception('DB indisponible'),
        ):
            res = self.client.post(
                '/api/admin/auth/login/',
                {'email': 'superadmin@test.com', 'password': 'Test1234!'},
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)


class TestAdminPagination(TestCase):
    """I1 : les listes admin doivent être paginées (protection charge serveur)."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = create_user('superadmin@test.com', 'Super Admin', is_superuser=True)
        for i in range(30):
            create_user(f'owner{i}@test.com', f'Owner {i}')
        self.client.force_authenticate(user=self.superadmin)

    def test_admin_users_is_paginated(self):
        res = self.client.get('/api/admin/users/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('results', res.data)
        self.assertIn('count', res.data)
        self.assertLessEqual(len(res.data['results']), 25)
        self.assertGreaterEqual(res.data['count'], 30)

    def test_admin_users_second_page(self):
        page1 = self.client.get('/api/admin/users/').data
        self.assertIsNotNone(page1['next'])
        page2 = self.client.get('/api/admin/users/?page=2').data
        ids1 = {u['id'] for u in page1['results']}
        ids2 = {u['id'] for u in page2['results']}
        self.assertEqual(ids1 & ids2, set(), "Les pages ne doivent pas se chevaucher")
