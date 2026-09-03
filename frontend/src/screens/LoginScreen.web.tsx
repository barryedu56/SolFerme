/**
 * SolFerme — Connexion, WEB UNIQUEMENT (résolu par Metro via l'extension
 * `.web.tsx`). Android/iOS continuent d'utiliser LoginScreen.tsx, inchangé.
 * Logique de connexion strictement identique — seule la présentation change.
 */
import React, { useState } from 'react';
import { Keyboard, View, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { getErrorMessage } from '../utils/errors';
import {
  AuthWebShell, WebField, WebPasswordField, WebButton, WebErrorBox, WebLink, WebFormTitle,
} from './auth/authWebKit';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const { t } = useTranslation();

  const handleLogin = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!email || !password) {
      setError(t('profile.fillAllFields'));
      return;
    }
    setLoading(true);
    try {
      const response = await repositoryProvider.api.post('/auth/login/', { email, password });
      const { access, refresh } = response.data;
      await login(access, refresh);
    } catch (err: any) {
      setError(getErrorMessage(err, t('auth.wrongCredentials')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthWebShell
      onBackHome={() => navigation.navigate('Welcome')}
      eyebrow="Espace propriétaire & équipe"
      headline="Pilotez votre exploitation avicole, où que vous soyez."
      bullets={[
        { icon: 'chart-line', text: 'Suivi de production et des ventes en temps réel' },
        { icon: 'wifi-off', text: 'Fonctionne même sans connexion Internet' },
        { icon: 'account-group-outline', text: 'Gestion multi-fermes, lots et employés' },
      ]}
    >
      <WebFormTitle icon="login" title={t('auth.login', { defaultValue: 'Connexion' })} subtitle={t('auth.subtitle', { defaultValue: 'Connectez-vous à votre exploitation' })} />

      {error && <WebErrorBox message={error} />}

      <WebField
        label={t('auth.email')}
        icon="alternate-email"
        placeholder="votre@email.com"
        value={email}
        onChangeText={(v) => { setEmail(v); setError(null); }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />
      <WebPasswordField
        label={t('auth.password')}
        placeholder="••••••••"
        value={password}
        onChangeText={(v) => { setPassword(v); setError(null); }}
        returnKeyType="done"
        onSubmitEditing={handleLogin}
      />

      <WebButton title={t('auth.login')} onPress={handleLogin} loading={loading} icon="login" />

      <View style={styles.footerLinks}>
        <WebLink label={t('auth.forgotPassword')} onPress={() => navigation.navigate('ForgotPassword')} />
        <View style={styles.dot} />
        <WebLink label={t('auth.createAccount', { defaultValue: 'Créer un compte' })} onPress={() => navigation.navigate('Register')} bold />
      </View>
    </AuthWebShell>
  );
};

const styles = StyleSheet.create({
  footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#C9BB99' },
});
