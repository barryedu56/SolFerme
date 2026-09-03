import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { toast } from '../utils/toast';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { BrandLogo } from '../components/BrandLogo';
import { PasswordStrengthBar, isPasswordStrong } from '../components/PasswordStrengthBar';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const RegisterScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktopOrTablet), [theme, isDesktopOrTablet]);

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
            <Text style={styles.title}>{t('auth.registerTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
          </View>

          <View style={styles.card}>
            <Input
              label={t('auth.fullName')}
              placeholder={t('auth.fullNamePlaceholder')}
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              autoCapitalize="words"
              returnKeyType="next"
              error={errors.name}
            />
            <Input
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={(v) => { setEmail(v); clearError('email'); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.email}
            />
            <Input
              label={t('auth.phone')}
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onChangeText={(v) => { setPhone(v); clearError('phone'); }}
              isPhone
              returnKeyType="next"
              error={errors.phone}
            />
            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={(v) => { setPassword(v); clearError('password'); }}
              secureTextEntry
              returnKeyType="next"
              error={errors.password}
            />
            <PasswordStrengthBar value={password} />
            <Input
              label={t('auth.confirmPassword')}
              placeholder={t('auth.passwordPlaceholder')}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError('confirmPassword'); }}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              error={errors.confirmPassword}
            />

            <Button
              title={t('auth.registerButton')}
              onPress={handleRegister}
              loading={loading}
              style={styles.submit}
              textColor="#000000"
            />
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.footerLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.linkText}>
              {t('auth.haveAccount')}<Text style={styles.linkBold}>{t('auth.login')}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
};

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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
  },
  submit: { marginTop: theme.spacing.s, height: 54, borderRadius: theme.borderRadius.xl },
  footerLink: { marginTop: theme.spacing.l, alignItems: 'center', paddingBottom: theme.spacing.xl },
  linkText: { color: theme.colors.textSecondary, fontSize: 14 },
  linkBold: { fontWeight: '800', color: theme.colors.text },
});
