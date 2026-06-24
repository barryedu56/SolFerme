import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.emailRequired', { defaultValue: 'Veuillez renseigner votre adresse email.' }));
      return;
    }
    
    setLoading(true);
    // Simulation d'un appel réseau (Mock UI) car le backend Django n'a pas encore de serveur SMTP configuré
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        t('auth.emailSent'),
        t('auth.resetEmailSentDesc', { defaultValue: "Si un compte est associé à cet email, vous recevrez un lien de réinitialisation d'ici quelques minutes." })
      );
      navigation.goBack();
    }, 1500);
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
          <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>
        </View>
        
        <Card style={styles.card}>
          <Input
            label={t('auth.email')}
            placeholder="votre@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <Button 
            title={t('auth.sendLink')}
            onPress={handleReset} 
            loading={loading}
            style={styles.submitButton}
          />
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
  }
});
