import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { toast } from '../utils/toast';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';

export const RegisterScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = t('auth.fillRequired');
    if (!email) {
      newErrors.email = t('auth.fillRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('auth.invalidEmail');
    }

    if (!password) {
      newErrors.password = t('auth.fillRequired');
    } else {
      // Aligné avec la validation backend (serializers.py:187-198) : 8+ caractères, majuscule, minuscule, chiffre, caractère spécial
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
      if (!passwordRegex.test(password)) {
        newErrors.password = t('auth.passwordComplexity');
      }
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('auth.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await repositoryProvider.api.post('/users/', {
        name,
        email,
        phone,
        password,
        role: 'PROPRIETAIRE'
      });
      toast.success(t('common.success'), t('auth.registerSuccess'));
      navigation.navigate('Login');
    } catch (error: any) {
      const errorMessage = getErrorMessage(error, t('auth.registerError'));
      if (errorMessage.includes('email')) {
        setErrors({ email: errorMessage });
      } else if (errorMessage.includes('téléphone') || errorMessage.includes('numéro')) {
        setErrors({ phone: errorMessage });
      } else {
        toast.error(t('common.actionImpossible') || "Action impossible", errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.registerTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
          </View>
          
          <Card style={styles.card}>
            <Input
              label={t('auth.fullName')}
              placeholder={t('auth.fullNamePlaceholder')}
              value={name}
              onChangeText={(text) => { setName(text); setErrors({ ...errors, name: '' }); }}
              autoCapitalize="words"
              error={errors.name}
            />
            <Input
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={(text) => { setEmail(text); setErrors({ ...errors, email: '' }); }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />
            <Input
              label={t('auth.phone')}
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onChangeText={(text) => { setPhone(text); setErrors({ ...errors, phone: '' }); }}
              isPhone
              maxLength={9}
              error={errors.phone}
            />
            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={(text) => { setPassword(text); setErrors({ ...errors, password: '' }); }}
              secureTextEntry
              error={errors.password}
            />
            <Input
              label={t('auth.confirmPassword')}
              placeholder="********"
              value={confirmPassword}
              onChangeText={(text) => { setConfirmPassword(text); setErrors({ ...errors, confirmPassword: '' }); }}
              secureTextEntry
              error={errors.confirmPassword}
            />

            <Button
              title={t('auth.registerButton')}
              onPress={handleRegister}
              loading={loading}
              style={styles.submitButton}
              textColor="#000000"
            />
          </Card>

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.footerLink}
          >
            <Text style={styles.linkText}>{t('auth.alreadyRegistered')}<Text style={styles.linkBold}>{t('auth.login')}</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
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
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    padding: theme.spacing.l,
    ...theme.shadows.medium,
  },
  submitButton: {
    marginTop: theme.spacing.m,
    height: 56,
  },
  footerLink: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
    paddingBottom: theme.spacing.xl,
  },
  linkText: {
    color: theme.colors.text,
    fontSize: 14,
  },
  linkBold: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  }
});