import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { BrandLogo } from '../../components/BrandLogo';
import { A } from './ui';

export const AdminLoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const handleLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('/admin/auth/login/', { email, password });
      const { access, refresh } = response.data;
      await login(access, refresh);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Identifiants incorrects ou accès refusé.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />

      <View style={styles.card}>
        <View style={styles.header}>
          <BrandLogo size={64} shape="squircle" />
          <View style={styles.chip}>
            <MaterialIcons name="shield" size={12} color={A.primary} />
            <Text style={styles.chipTxt}>Console d'administration</Text>
          </View>
          <Text style={styles.title}>Connexion administrateur</Text>
          <Text style={styles.subtitle}>Accès réservé aux SuperAdmins SolFerme</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color={A.danger} />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Email administrateur</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons name="mail-outline" size={19} color={A.inkFaint} />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="admin@solferme.com"
            placeholderTextColor={A.inkFaint}
            onSubmitEditing={handleLogin}
          />
        </View>

        <Text style={styles.label}>Mot de passe</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons name="lock-outline" size={19} color={A.inkFaint} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            placeholder="••••••••"
            placeholderTextColor={A.inkFaint}
            onSubmitEditing={handleLogin}
          />
          <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
            <MaterialIcons name={showPw ? 'visibility-off' : 'visibility'} size={19} color={A.inkFaint} />
          </Pressable>
        </View>

        <Pressable style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.buttonTxt}>Se connecter</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </Pressable>

        <Pressable
          style={styles.backLink}
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.history.replaceState(null, '', '/');
            }
            navigation.navigate('Welcome');
          }}
        >
          <MaterialIcons name="arrow-back" size={15} color={A.inkSoft} />
          <Text style={styles.backTxt}>Retour à l'accueil</Text>
        </Pressable>
      </View>

      <Text style={styles.legal}>Toute tentative d'accès non autorisée est enregistrée.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: A.sidebar, justifyContent: 'center', alignItems: 'center', padding: 22, overflow: 'hidden' },
  glowA: { position: 'absolute', width: 420, height: 420, borderRadius: 210, backgroundColor: A.primary, opacity: 0.18, top: -120, right: -100 },
  glowB: { position: 'absolute', width: 360, height: 360, borderRadius: 180, backgroundColor: '#0EA5E9', opacity: 0.12, bottom: -120, left: -90 },
  card: {
    backgroundColor: A.surface, borderRadius: A.radiusLg, padding: 32, width: '100%', maxWidth: 420,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)' } as any
      : { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 12 }),
  },
  header: { alignItems: 'center', marginBottom: 24, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.primarySoft, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginTop: 4 },
  chipTxt: { fontSize: 11.5, fontWeight: '800', color: A.primaryInk, letterSpacing: 0.3 },
  title: { fontSize: 20, fontWeight: '800', color: A.ink, marginTop: 4 },
  subtitle: { fontSize: 13, color: A.inkSoft, textAlign: 'center' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: A.dangerSoft, padding: 12, borderRadius: 10, marginBottom: 18 },
  errorTxt: { flex: 1, color: A.danger, fontSize: 13, fontWeight: '600' },
  label: { fontSize: 12.5, fontWeight: '700', color: A.ink, marginBottom: 7, marginTop: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: A.surfaceAlt, borderRadius: 11, borderWidth: 1, borderColor: A.border, paddingHorizontal: 14, marginBottom: 14 },
  input: { flex: 1, height: 48, fontSize: 14.5, color: A.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null) },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: A.primary, borderRadius: 12, height: 50, marginTop: 8 },
  buttonTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 18 },
  backTxt: { color: A.inkSoft, fontSize: 13, fontWeight: '600' },
  legal: { color: '#475569', fontSize: 11, marginTop: 22, textAlign: 'center' },
});
