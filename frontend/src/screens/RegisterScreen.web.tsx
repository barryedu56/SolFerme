/**
 * SolFerme — Inscription, WEB UNIQUEMENT (résolu par Metro via l'extension
 * `.web.tsx`). Android/iOS continuent d'utiliser RegisterScreen.tsx, inchangé.
 * Logique d'inscription strictement identique — seule la présentation change.
 */
import React, { useState } from 'react';
import { Keyboard, Pressable, Text, StyleSheet } from 'react-native';
import { toast } from '../utils/toast';
import { isPasswordStrong } from '../components/PasswordStrengthBar';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';
import {
  AuthWebShell, WebField, WebPasswordField, WebButton, WebPasswordStrength, WebFormTitle, C,
} from './auth/authWebKit';

export const RegisterScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('auth.fillRequired');
    if (!email.trim()) e.email = t('auth.fillRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = t('auth.invalidEmail');
    if (!password) e.password = t('auth.fillRequired');
    else if (!isPasswordStrong(password)) e.password = t('auth.passwordComplexity');
    if (password !== confirmPassword) e.confirmPassword = t('auth.passwordMismatch');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    Keyboard.dismiss();
    if (!validate()) return;
    setLoading(true);
    try {
      await repositoryProvider.api.post('/users/', {
        name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
        password, role: 'PROPRIETAIRE',
      });
      toast.success(t('common.success'), t('auth.registerSuccess'));
      navigation.navigate('Login');
    } catch (error: any) {
      const msg = getErrorMessage(error, t('auth.registerError'));
      if (/email/i.test(msg)) setErrors({ email: msg });
      else if (/t[ée]l[ée]phone|num[ée]ro/i.test(msg)) setErrors({ phone: msg });
      else if (/mot de passe|password/i.test(msg)) setErrors({ password: msg });
      else toast.error(t('common.actionImpossible') || 'Action impossible', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthWebShell
      onBackHome={() => navigation.navigate('Welcome')}
      eyebrow="Créez votre exploitation"
      headline="Rejoignez les éleveurs qui pilotent leur ferme avec SolFerme."
      bullets={[
        { icon: 'account-plus-outline', text: 'Compte propriétaire gratuit en 2 minutes' },
        { icon: 'shield-check-outline', text: 'Vos données restent privées et sécurisées' },
        { icon: 'cellphone-link', text: 'Accessible sur mobile, tablette et ordinateur' },
      ]}
    >
      <WebFormTitle icon="person-add-alt" title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} />

      <WebField
        label={t('auth.fullName')}
        icon="person-outline"
        placeholder={t('auth.fullNamePlaceholder')}
        value={name}
        onChangeText={(v) => { setName(v); clearError('name'); }}
        autoCapitalize="words"
        returnKeyType="next"
        error={errors.name}
      />
      <WebField
        label={t('auth.email')}
        icon="alternate-email"
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={(v) => { setEmail(v); clearError('email'); }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        error={errors.email}
      />
      <WebField
        label={t('auth.phone')}
        icon="phone"
        placeholder={t('auth.phonePlaceholder')}
        value={phone}
        onChangeText={(v) => { setPhone(v); clearError('phone'); }}
        keyboardType="phone-pad"
        returnKeyType="next"
        error={errors.phone}
      />
      <WebPasswordField
        label={t('auth.password')}
        placeholder={t('auth.passwordPlaceholder')}
        value={password}
        onChangeText={(v) => { setPassword(v); clearError('password'); }}
        returnKeyType="next"
        error={errors.password}
      />
      <WebPasswordStrength value={password} />
      <WebPasswordField
        label={t('auth.confirmPassword')}
        placeholder={t('auth.passwordPlaceholder')}
        value={confirmPassword}
        onChangeText={(v) => { setConfirmPassword(v); clearError('confirmPassword'); }}
        returnKeyType="done"
        onSubmitEditing={handleRegister}
        error={errors.confirmPassword}
      />

      <WebButton title={t('auth.registerButton')} onPress={handleRegister} loading={loading} icon="person-add-alt" />

      <Pressable onPress={() => navigation.navigate('Login')} style={styles.footerLink} hitSlop={8}>
        <Text style={styles.footerLinkText}>
          {t('auth.haveAccount')}<Text style={styles.footerLinkBold}>{t('auth.login')}</Text>
        </Text>
      </Pressable>
    </AuthWebShell>
  );
};

const styles = StyleSheet.create({
  footerLink: { alignItems: 'center', marginTop: 20 },
  footerLinkText: { fontSize: 13.5, color: C.muted, fontWeight: '600' },
  footerLinkBold: { fontWeight: '800', color: C.orange },
});
