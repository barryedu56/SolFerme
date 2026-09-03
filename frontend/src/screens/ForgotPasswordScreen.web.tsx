/**
 * SolFerme — Mot de passe oublié, WEB UNIQUEMENT (résolu par Metro via
 * l'extension `.web.tsx`). Android/iOS continuent d'utiliser
 * ForgotPasswordScreen.tsx, inchangé. Logique de réinitialisation strictement
 * identique — seule la présentation change.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Keyboard, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { isPasswordStrong } from '../components/PasswordStrengthBar';
import { toast } from '../utils/toast';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';
import {
  AuthWebShell, WebField, WebPasswordField, WebButton, WebPasswordStrength, WebFormTitle, C,
} from './auth/authWebKit';

const StepDot = ({ n, active, current, label }: { n: number; active: boolean; current: boolean; label: string }) => (
  <View style={stepStyles.wrap}>
    <View style={[stepStyles.dot, { borderColor: active ? C.orange : C.border, backgroundColor: current ? C.orange : C.surface }]}>
      <Text style={[stepStyles.dotText, { color: current ? '#fff' : active ? C.orange : C.muted }]}>{n}</Text>
    </View>
    <Text style={[stepStyles.label, { color: current ? C.text : C.muted }]} numberOfLines={1}>{label}</Text>
  </View>
);

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const requestCode = async () => {
    Keyboard.dismiss();
    if (!email.trim()) { setErrors({ email: t('auth.emailRequired') }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErrors({ email: t('auth.invalidEmail') }); return; }
    setLoading(true);
    try {
      const res = await repositoryProvider.api.post('/auth/password-reset-request/', { email: email.trim() });
      if (res.data?.code_dev) { setCode(String(res.data.code_dev)); toast.info('DEBUG', `Code : ${res.data.code_dev}`); }
      else toast.success(t('auth.emailSent'), t('auth.resetEmailSentDesc'));
      setStep(2);
    } catch (e: any) {
      setErrors({ email: getErrorMessage(e) });
    } finally { setLoading(false); }
  };

  const confirmReset = async () => {
    Keyboard.dismiss();
    const e: Record<string, string> = {};
    if (code.trim().length < 4) e.code = t('auth.linkInvalid');
    if (!isPasswordStrong(newPassword)) e.newPassword = t('auth.passwordComplexity');
    if (newPassword !== confirm) e.confirm = t('auth.passwordMismatch');
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      await repositoryProvider.api.post('/auth/password-reset-confirm/', {
        email: email.trim(), code: code.trim(), new_password: newPassword,
      });
      toast.success(t('common.success'), t('auth.resetSuccess'));
      navigation.navigate('Login');
    } catch (err: any) {
      const msg = getErrorMessage(err);
      if (/code|expir/i.test(msg)) setErrors({ code: msg });
      else if (/mot de passe|password|caract/i.test(msg)) setErrors({ newPassword: msg });
      else toast.error(t('common.actionImpossible') || 'Action impossible', msg);
    } finally { setLoading(false); }
  };

  return (
    <AuthWebShell
      onBackHome={() => navigation.navigate('Welcome')}
      eyebrow="Récupération sécurisée"
      headline="Retrouvez l'accès à votre compte en quelques instants."
      bullets={[
        { icon: 'email-fast-outline', text: 'Un code de vérification vous est envoyé par email' },
        { icon: 'shield-lock-outline', text: 'Code à usage unique, valable un temps limité' },
        { icon: 'lock-check-outline', text: 'Choisissez un nouveau mot de passe robuste' },
      ]}
    >
      <WebFormTitle
        icon="lock-reset"
        title={t('auth.resetPassword')}
        subtitle={step === 1 ? t('auth.resetPasswordSubtitle') : t('auth.resetPasswordConfirmSubtitle')}
      />

      <View style={styles.stepper}>
        <StepDot n={1} active={step >= 1} current={step === 1} label={t('auth.stepRequestCode')} />
        <View style={[styles.stepLine, { backgroundColor: step >= 2 ? C.orange : C.border }]} />
        <StepDot n={2} active={step >= 2} current={step === 2} label={t('auth.stepNewPassword')} />
      </View>

      {step === 1 ? (
        <>
          <WebField
            label={t('auth.email')}
            icon="alternate-email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={(v) => { setEmail(v); clearError('email'); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={requestCode}
            error={errors.email}
          />
          <WebButton title={t('auth.sendLink')} onPress={requestCode} loading={loading} icon="send" />
        </>
      ) : (
        <>
          <View style={styles.sentTo}>
            <MaterialIcons name="mark-email-read" size={17} color={C.muted} />
            <Text style={styles.sentToText}>{t('auth.codeSentTo')} {email}</Text>
          </View>

          <WebField
            label={t('auth.code')}
            icon="dialpad"
            placeholder="123456"
            value={code}
            onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); clearError('code'); }}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="next"
            error={errors.code}
          />
          <WebPasswordField
            label={t('auth.newPassword')}
            placeholder={t('auth.passwordPlaceholder')}
            value={newPassword}
            onChangeText={(v) => { setNewPassword(v); clearError('newPassword'); }}
            returnKeyType="next"
            error={errors.newPassword}
          />
          <WebPasswordStrength value={newPassword} />
          <WebPasswordField
            label={t('auth.confirmNewPassword')}
            placeholder={t('auth.passwordPlaceholder')}
            value={confirm}
            onChangeText={(v) => { setConfirm(v); clearError('confirm'); }}
            returnKeyType="done"
            onSubmitEditing={confirmReset}
            error={errors.confirm}
          />

          <WebButton title={t('common.confirm')} onPress={confirmReset} loading={loading} icon="check-circle-outline" />

          <View style={styles.step2Links}>
            <Pressable onPress={requestCode} disabled={loading} hitSlop={8}>
              <Text style={styles.linkAction}>{t('auth.resendCode')}</Text>
            </Pressable>
            <Pressable onPress={() => { setStep(1); setErrors({}); }} hitSlop={8}>
              <Text style={styles.linkAction}>{t('auth.changeEmail')}</Text>
            </Pressable>
          </View>
        </>
      )}

      <Pressable onPress={() => navigation.navigate('Login')} style={styles.footerLink} hitSlop={8}>
        <Text style={styles.footerLinkText}>{t('auth.backToLogin')}</Text>
      </Pressable>
    </AuthWebShell>
  );
};

const stepStyles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 120 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 13, fontWeight: '800' },
  label: { fontSize: 11, marginTop: 6, fontWeight: '700', textAlign: 'center' },
});

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 24 },
  stepLine: { height: 2, flex: 0.4, marginTop: 14, maxWidth: 60 },
  sentTo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orangeSoft, borderRadius: 11, padding: 11, marginBottom: 16 },
  sentToText: { flex: 1, fontSize: 13, color: C.muted, fontWeight: '600' },
  step2Links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  linkAction: { fontSize: 13.5, fontWeight: '800', color: C.orange },
  footerLink: { alignItems: 'center', marginTop: 20 },
  footerLinkText: { fontSize: 13.5, color: C.muted, fontWeight: '700' },
});
