import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { getErrorMessage } from '../utils/errors';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const { login } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Ref pour passer automatiquement au champ mot de passe
  const passwordRef = useRef<TextInput>(null);

  const togglePasswordVisibility = () => {
    setPasswordVisible((visible) => !visible);
    passwordRef.current?.focus();
  };

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
    <SafeAreaWrapper style={styles.container}>
      {/*
        ─── GESTION CLAVIER ────────────────────────────────────────────────────
        • KeyboardAvoidingView behavior="padding" : fiable sur Android ET iOS.
        • ScrollView keyboardShouldPersistTaps="handled" : les taps sur boutons
          et champs restent actifs même quand le clavier est ouvert.
        • PAS de Pressable/TouchableWithoutFeedback autour du formulaire :
          sur Android, cela intercepterait les touches et appellerait
          Keyboard.dismiss() avant que le TextInput reçoive le focus.
        ────────────────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.kavContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/*
            ✅ View simple — PAS de Pressable/TouchableWithoutFeedback ici.
            Sur Android, un Pressable wrappant des TextInputs intercepte
            les touch events et appelle Keyboard.dismiss() avant que le
            TextInput reçoive le focus → clavier bloqué.
          */}
          <View style={styles.pressableWrapper}>

            {/* ── HEADER / LOGO ── */}
            <View style={styles.header}>
              <View style={styles.logoOuter}>
                <View style={[styles.logoInner, { backgroundColor: theme.colors.primary }]}>
                  <MaterialCommunityIcons name="egg" size={46} color="#000000" />
                </View>
              </View>
              <Text style={styles.brandName}>SolFerme</Text>
              <Text style={styles.subtitle}>
                {t('auth.subtitle', { defaultValue: 'Connectez-vous à votre exploitation' })}
              </Text>
            </View>

            {/* ── FORMULAIRE ── */}
            <View style={styles.formCard}>

              {/* Badge "Connexion" */}
              <View style={styles.formTitleRow}>
                <MaterialIcons name="lock-open" size={18} color={theme.colors.primary} />
                <Text style={styles.formTitle}>{t('auth.login', { defaultValue: 'Connexion' })}</Text>
              </View>

              {/* Champ email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
                <View style={[
                  styles.fieldWrapper,
                  emailFocused && styles.fieldWrapperFocused,
                ]}>
                  <MaterialIcons
                    name="alternate-email"
                    size={20}
                    color={emailFocused ? theme.colors.primary : theme.colors.textSecondary}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={[styles.textInput, { color: theme.colors.text }]}
                    placeholder="votre@email.com"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={email}
                    onChangeText={(text) => { setEmail(text); setError(null); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    blurOnSubmit={false}
                  />
                </View>
              </View>

              {/* Champ mot de passe */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
                <View style={[
                  styles.fieldWrapper,
                  passwordFocused && styles.fieldWrapperFocused,
                ]}>
                  <MaterialIcons
                    name="lock-outline"
                    size={20}
                    color={passwordFocused ? theme.colors.primary : theme.colors.textSecondary}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    ref={passwordRef}
                    style={[styles.textInput, { color: theme.colors.text, flex: 1 }]}
                    placeholder="••••••••"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={password}
                    onChangeText={(text) => { setPassword(text); setError(null); }}
                    secureTextEntry={!passwordVisible}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                  />
                  {/* Bouton afficher/masquer mot de passe */}
                  <TouchableOpacity
                    onPress={togglePasswordVisibility}
                    style={styles.eyeButton}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <MaterialCommunityIcons
                      name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Message d'erreur global */}
              {error && (
                <View style={styles.errorBox}>
                  <MaterialIcons name="error-outline" size={16} color={theme.colors.danger} />
                  <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
                </View>
              )}

              {/* Bouton connexion */}
              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { backgroundColor: theme.colors.primary },
                  loading && styles.loginButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.82}
              >
                {loading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <View style={styles.loginButtonContent}>
                    <MaterialIcons name="login" size={20} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.loginButtonText}>{t('auth.login')}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Liens footer */}
              <View style={styles.footerLinks}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.linkText, { color: theme.colors.textSecondary }]}>
                    {t('auth.forgotPassword')}
                  </Text>
                </TouchableOpacity>
                <View style={styles.footerDivider} />
                <TouchableOpacity
                  onPress={() => navigation.navigate('Register')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.linkText, { color: theme.colors.primary }]}>
                    {t('auth.createAccount', { defaultValue: 'Créer un compte' })}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Mention basse */}
            <Text style={[styles.mention, { color: theme.colors.textSecondary }]}>
              🌾 Gestion avicole & ferme intelligente
            </Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  kavContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.l,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
  },
  pressableWrapper: {
    justifyContent: 'center',
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: `${theme.colors.primary}33`, // ~20% opacity
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  brandName: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  // ── Formulaire ──
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
    gap: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginLeft: 6,
  },

  // ── Champs de saisie ──
  fieldGroup: {
    marginBottom: theme.spacing.m,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.inputBackground,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 4,
    minHeight: 54,
  },
  fieldWrapperFocused: {
    borderColor: theme.colors.primary,
    // Suppression de l'élévation dynamique et de l'ombre au focus.
    // Ajouter "elevation" au vol sur Android force un recalcul de la vue 
    // au niveau du système, ce qui annule instantanément l'ouverture du clavier.
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },

  // ── Erreur ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    borderRadius: theme.borderRadius.s,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.m,
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.danger,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },

  // ── Bouton connexion ──
  loginButton: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.s,
    marginBottom: theme.spacing.m,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.3,
  },

  // ── Footer ──
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  footerDivider: {
    width: 1,
    height: 14,
    backgroundColor: theme.colors.border,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Mention ──
  mention: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: theme.spacing.xl,
    opacity: 0.7,
  },
});