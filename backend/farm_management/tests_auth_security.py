"""Tests de sécurité pour l'authentification : inscription, changement et
réinitialisation de mot de passe (Partie 2 de l'audit final)."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework import status

from farm_management.models import User, PasswordResetCode, ContactMessage, Farm, Employee

STRONG = "Str0ng!Pass"
STRONG2 = "An0ther!Pass"


class TestRegistrationPassword(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_rejects_weak_password(self):
        for weak in ["short1!", "alllowercase1!", "ALLUPPER1!", "NoDigits!!", "NoSpecial123"]:
            r = self.client.post('/api/users/', {
                'name': 'X', 'email': f'w_{weak[:3]}@t.com', 'password': weak, 'role': 'PROPRIETAIRE',
            }, format='json')
            self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST, f"{weak} devrait être rejeté: {r.data}")

    def test_register_accepts_strong_password(self):
        r = self.client.post('/api/users/', {
            'name': 'Good', 'email': 'good@t.com', 'password': STRONG, 'role': 'PROPRIETAIRE',
        }, format='json')
        self.assertIn(r.status_code, (200, 201), r.data)
        self.assertTrue(User.objects.filter(email='good@t.com').exists())


class TestChangePassword(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='cp@t.com', name='CP', password=STRONG, role='PROPRIETAIRE')
        self.client.force_authenticate(user=self.user)

    def test_wrong_old_password(self):
        r = self.client.post('/api/auth/change-password/', {'old_password': 'bad', 'new_password': STRONG2}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_weak_new_password_rejected(self):
        r = self.client.post('/api/auth/change-password/', {'old_password': STRONG, 'new_password': 'weak'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_strong_new_password_ok_and_notifies(self):
        from django.core import mail
        mail.outbox.clear()
        r = self.client.post('/api/auth/change-password/', {'old_password': STRONG, 'new_password': STRONG2}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(STRONG2))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)


class TestUserSerializerPasswordHashing(TestCase):
    """Régression : PATCH /api/users/<id>/ (ex. un propriétaire modifiant le
    mot de passe d'un employé) doit hasher le mot de passe, jamais l'écrire
    en clair. Le ModelSerializer.update() par défaut de DRF fait un simple
    setattr() sur chaque champ, ce qui stockait le mot de passe en clair et
    cassait ensuite toute connexion (check_password échoue sur une valeur
    qui n'est pas un hash Django valide)."""

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(email='boss@t.com', name='Boss', password=STRONG, role='PROPRIETAIRE')
        self.farm = Farm.objects.create(owner=self.owner, name='Ferme test', capacity=1000)
        self.employee_user = User.objects.create_user(email='emp@t.com', name='Emp', password=STRONG, role='EMPLOYE')
        Employee.objects.create(user=self.employee_user, farm=self.farm, position='Ouvrier', salary=100)
        self.client.force_authenticate(user=self.owner)

    def test_owner_changing_employee_password_is_hashed(self):
        r = self.client.patch(f'/api/users/{self.employee_user.id}/', {'password': STRONG2}, format='json')
        self.assertEqual(r.status_code, 200, r.data)

        self.employee_user.refresh_from_db()
        # Ne doit jamais être stocké en clair.
        self.assertNotEqual(self.employee_user.password, STRONG2)
        self.assertTrue(self.employee_user.password.startswith(('pbkdf2_', 'argon2', 'bcrypt')))
        self.assertTrue(self.employee_user.check_password(STRONG2))

    def test_employee_can_login_after_owner_resets_password(self):
        self.client.patch(f'/api/users/{self.employee_user.id}/', {'password': STRONG2}, format='json')

        login_client = APIClient()
        r = login_client.post('/api/auth/login/', {'email': 'emp@t.com', 'password': STRONG2}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('access', r.data)

    def test_self_profile_update_without_password_does_not_touch_hash(self):
        original_hash = self.owner.password
        r = self.client.patch('/api/auth/user/', {'name': 'Nouveau Nom'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.password, original_hash)
        self.assertEqual(self.owner.name, 'Nouveau Nom')


@override_settings(DEBUG=True)
class TestPasswordReset(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='pr@t.com', name='PR', password=STRONG, role='PROPRIETAIRE')

    def _request_code(self, email='pr@t.com'):
        r = self.client.post('/api/auth/password-reset-request/', {'email': email}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data.get('code_dev')

    def test_request_unknown_email_is_generic(self):
        r = self.client.post('/api/auth/password-reset-request/', {'email': 'nobody@t.com'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('code_dev', r.data)

    def test_new_request_invalidates_previous_code(self):
        code1 = self._request_code()
        code2 = self._request_code()
        self.assertNotEqual(code1, code2)
        r = self.client.post('/api/auth/password-reset-confirm/', {
            'email': 'pr@t.com', 'code': code1, 'new_password': STRONG2,
        }, format='json')
        self.assertEqual(r.status_code, 400, "L'ancien code ne doit plus fonctionner")

    def test_code_is_hashed_at_rest(self):
        code = self._request_code()
        prc = PasswordResetCode.objects.filter(user=self.user).order_by('-created_at').first()
        self.assertNotEqual(prc.code, code, "Le code ne doit pas être stocké en clair")
        self.assertTrue(prc.check_code(code))
        self.assertFalse(prc.check_code('000000'))

    def test_confirm_wrong_code_then_lock_after_5(self):
        good_code = self._request_code()
        wrong = '000000' if good_code != '000000' else '111111'
        for i in range(5):
            r = self.client.post('/api/auth/password-reset-confirm/', {
                'email': 'pr@t.com', 'code': wrong, 'new_password': STRONG2,
            }, format='json')
            self.assertEqual(r.status_code, 400)
        # 6e tentative même avec le BON code → verrouillé
        r = self.client.post('/api/auth/password-reset-confirm/', {
            'email': 'pr@t.com', 'code': good_code, 'new_password': STRONG2,
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('tentatives', str(r.data).lower())

    def test_confirm_weak_password_rejected(self):
        code = self._request_code()
        r = self.client.post('/api/auth/password-reset-confirm/', {
            'email': 'pr@t.com', 'code': code, 'new_password': 'weak',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_confirm_success_and_code_single_use(self):
        from django.core import mail
        code = self._request_code()
        mail.outbox.clear()
        r = self.client.post('/api/auth/password-reset-confirm/', {
            'email': 'pr@t.com', 'code': code, 'new_password': STRONG2,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(STRONG2))
        # Email de notification "mot de passe modifié" envoyé
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('modifié', mail.outbox[0].subject.lower())
        # Réutilisation du code → refusée
        r2 = self.client.post('/api/auth/password-reset-confirm/', {
            'email': 'pr@t.com', 'code': code, 'new_password': STRONG,
        }, format='json')
        self.assertEqual(r2.status_code, 400)


class TestContactForm(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_valid_message_saved_and_emailed(self):
        from django.core import mail
        mail.outbox.clear()
        r = self.client.post('/api/contact/', {
            'name': 'Amadou Barry', 'email': 'a@ferme.com',
            'subject': 'Question', 'message': "Bonjour, j'aimerais en savoir plus.",
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(ContactMessage.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_rejects_short_message(self):
        r = self.client.post('/api/contact/', {
            'name': 'X', 'email': 'a@ferme.com', 'message': 'court',
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ContactMessage.objects.count(), 0)

    def test_rejects_bad_email(self):
        r = self.client.post('/api/contact/', {
            'name': 'Amadou', 'email': 'pas-un-email', 'message': 'Un message assez long ici.',
        }, format='json')
        self.assertEqual(r.status_code, 400)
