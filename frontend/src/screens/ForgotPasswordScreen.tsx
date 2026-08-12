import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Request Code, 2: Confirm Reset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCode = async () => {
    setError(null);
    if (!email) {
      setError(t('auth.emailRequired'));
      return;
    }
    
    setLoading(true);
    try {
      const res = await repositoryProvider.api.post('/auth/password-reset-request/', { email });
      setLoading(false);

      // In DEBUG mode, we might get the code back for testing
      if (res.data.code_dev) {
        Alert.alert(
          t('auth.emailSent'),
          `DEBUG MODE: Code: ${res.data.code_dev}`
        );
        setCode(res.data.code_dev);
      } else {
        Alert.alert(
          t('auth.emailSent'),
          t('auth.resetEmailSentDesc')
        );
      }
      setStep(2);
    } catch (e: any) {
      setLoading(false);
      setError(getErrorMessage(e));
    }
  };

  const handleConfirmReset = async () => {
    setError(null);
    if (!code || !newPassword) {
      setError(t('profile.fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      await repositoryProvider.api.post('/auth/password-reset-confirm/', {
        email,
        code,
        new_password: newPassword
      });
      setLoading(false);
      Alert.alert(
        t('common.success'),
        t('profile.passwordSuccess'),
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (e: any) {
      setLoading(false);
      setError(getErrorMessage(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.resetPassword')}</Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? t('auth.resetPasswordSubtitle')
              : t('auth.resetPasswordConfirmSubtitle')
            }
          </Text>
        </View>
        
        <Card style={styles.card}>
          {step === 1 ? (
            <>
              <Input
                label={t('auth.email')}
                placeholder="votre@email.com"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={error && error.includes('email') ? error : undefined}
              />

              {error && !error.includes('email') && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              <Button
                title={t('auth.sendLink')}
                onPress={handleRequestCode}
                loading={loading}
                style={styles.submitButton}
              />
            </>
          ) : (
            <>
              <Input
                label={t('auth.code')}
                placeholder="123456"
                value={code}
                onChangeText={(text) => { setCode(text); setError(null); }}
                keyboardType="numeric"
                error={error && (error.includes('code') || error.includes('lien')) ? error : undefined}
              />

              <Input
                label={t('profile.newPassword')}
                placeholder="********"
                value={newPassword}
                onChangeText={(text) => { setNewPassword(text); setError(null); }}
                secureTextEntry
                error={error && error.includes('passe') ? error : undefined}
              />

              {error && !error.includes('code') && !error.includes('lien') && !error.includes('passe') && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              <Button
                title={t('common.confirm')}
                onPress={handleConfirmReset}
                loading={loading}
                style={styles.submitButton}
              />

              <TouchableOpacity
                onPress={() => { setStep(1); setError(null); }}
                style={{ marginTop: 15, alignItems: 'center' }}
              >
                <Text style={{ color: theme.colors.primary }}>{t('common.back')}</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.m,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  backArrow: {
    fontSize: 32,
    color: theme.colors.primary,
    marginRight: 8,
    fontWeight: '300',
  },
  backText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  header: {
    marginBottom: theme.spacing.l,
    paddingHorizontal: theme.spacing.s,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.s,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    padding: theme.spacing.l,
    ...theme.shadows.medium,
  },
  submitButton: {
    marginTop: theme.spacing.m,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    marginBottom: theme.spacing.m,
    textAlign: 'center',
  }
});