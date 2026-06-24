import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';

export const RegisterScreen = ({ navigation }: any) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires.');
      return;
    }
    
    setLoading(true);
    try {
      await apiClient.post('/users/', {
        name,
        email,
        phone,
        password,
        role: 'PROPRIETAIRE'
      });
      Alert.alert('Succès', 'Compte créé avec succès !');
      navigation.navigate('Login');
    } catch (error: any) {
      Alert.alert('Erreur', "L'inscription a échoué.");
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Rejoindre SolFerme</Text>
            <Text style={styles.subtitle}>Créez votre compte propriétaire pour commencer l'aventure.</Text>
          </View>
          
          <Card style={styles.card}>
            <Input
              label="Nom complet"
              placeholder="Ex: Jean Dupont"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Input
              label="Email"
              placeholder="jean@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Téléphone (Optionnel)"
              placeholder="+225 ..."
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              label="Mot de passe"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button
              title="Créer mon compte"
              onPress={handleRegister}
              loading={loading}
              style={styles.submitButton}
            />
          </Card>

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.footerLink}
          >
            <Text style={styles.linkText}>Déjà inscrit ? <Text style={styles.linkBold}>Se connecter</Text></Text>
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
