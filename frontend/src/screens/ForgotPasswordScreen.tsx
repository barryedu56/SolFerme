import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { MaterialIcons } from '@expo/vector-icons';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { BrandLogo } from '../components/BrandLogo';
import { PasswordStrengthBar, isPasswordStrong } from '../components/PasswordStrengthBar';
import { toast } from '../utils/toast';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktopOrTablet), [theme, isDesktopOrTablet]);

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
    <SafeAreaWrapper style={styles.container}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <BrandLogo size={72} shape="squircle" style={styles.logo} />
            <Text style={styles.title}>{t('auth.resetPassword')}</Text>
            <Text style={styles.subtitle}>
              {step === 1 ? t('auth.resetPasswordSubtitle') : t('auth.resetPasswordConfirmSubtitle')}
            </Text>
          </View>

          {/* Indicateur d'étapes */}
          <View style={styles.stepper}>
            <StepDot n={1} active={step >= 1} current={step === 1} label={t('auth.stepRequestCode')} theme={theme} />
            <View style={[styles.stepLine, { backgroundColor: step >= 2 ? theme.colors.primary : theme.colors.border }]} />
            <StepDot n={2} active={step >= 2} current={step === 2} label={t('auth.stepNewPassword')} theme={theme} />
          </View>

          <View style={styles.card}>
            {step === 1 ? (
              <>
                <Input
                  label={t('auth.email')}
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
                <Button title={t('auth.sendLink')} onPress={requestCode} loading={loading} style={styles.submit} textColor="#000000" />
              </>
            ) : (
              <>
                <View style={styles.sentTo}>
                  <MaterialIcons name="mark-email-read" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.sentToText}>{t('auth.codeSentTo')} {email}</Text>
                </View>

                <Input
                  label={t('auth.code')}
                  placeholder="123456"
                  value={code}
                  onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); clearError('code'); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="next"
                  error={errors.code}
                />
                <Input
                  label={t('auth.newPassword')}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={newPassword}
                  onChangeText={(v) => { setNewPassword(v); clearError('newPassword'); }}
                  secureTextEntry
                  returnKeyType="next"
                  error={errors.newPassword}
                />
                <PasswordStrengthBar value={newPassword} />
                <Input
                  label={t('auth.confirmNewPassword')}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={confirm}
                  onChangeText={(v) => { setConfirm(v); clearError('confirm'); }}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={confirmReset}
                  error={errors.confirm}
                />

                <Button title={t('common.confirm')} onPress={confirmReset} loading={loading} style={styles.submit} textColor="#000000" />

                <View style={styles.step2Links}>
                  <TouchableOpacity onPress={requestCode} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.linkAction}>{t('auth.resendCode')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setStep(1); setErrors({}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.linkAction}>{t('auth.changeEmail')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.footerLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
};

const StepDot = ({ n, active, current, label, theme }: any) => (
  <View style={stepStyles.wrap}>
    <View style={[
      stepStyles.dot,
      { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: current ? theme.colors.primary : theme.colors.surface },
    ]}>
      <Text style={[stepStyles.dotText, { color: current ? '#000' : active ? theme.colors.primary : theme.colors.textSecondary }]}>{n}</Text>
    </View>
    <Text style={[stepStyles.label, { color: current ? theme.colors.text : theme.colors.textSecondary }]} numberOfLines={1}>{label}</Text>
  </View>
);

const stepStyles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 110 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 13, fontWeight: '800' },
  label: { fontSize: 11, marginTop: 6, fontWeight: '600', textAlign: 'center' },
});

const createStyles = (theme: any, wide: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: {
    flexGrow: 1,
    padding: theme.spacing.l,
    paddingTop: theme.spacing.xl,
    ...(wide && { maxWidth: 460, alignSelf: 'center', width: '100%' }),
  },
  header: { alignItems: 'center', marginBottom: theme.spacing.l },
  logo: { marginBottom: theme.spacing.m, borderRadius: 20, ...theme.shadows.light },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20, maxWidth: 340 },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginBottom: theme.spacing.l },
  stepLine: { height: 2, flex: 0.4, marginTop: 14, maxWidth: 60 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
  },
  sentTo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.m, padding: 10, marginBottom: theme.spacing.m },
  sentToText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary },
  submit: { marginTop: theme.spacing.s, height: 54, borderRadius: theme.borderRadius.xl },
  step2Links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.m },
  linkAction: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  footerLink: { marginTop: theme.spacing.l, alignItems: 'center', paddingBottom: theme.spacing.xl },
  linkText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
