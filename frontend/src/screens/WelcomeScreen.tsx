import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';

export const WelcomeScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="egg" size={50} color={theme.colors.text} />
          </View>
          <Text style={styles.brandName}>SolFerme</Text>
        </View>

        <View style={styles.textSection}>
          <Text style={styles.title}>Gérez votre ferme {"\n"}comme un pro</Text>
          <Text style={styles.subtitle}>
            Le SaaS agricole moderne pour le suivi {"\n"}de votre production et de vos lots.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button 
            title="Get Started"
            onPress={() => navigation.navigate('Login')} 
            style={styles.button}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>Créer un nouveau compte</Text>
          </TouchableOpacity>
        </View>
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
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xl * 1.5,
  },
  logoSection: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
    marginBottom: theme.spacing.m,
  },
  brandName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    letterSpacing: 2,
  },
  textSection: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.m,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    marginBottom: theme.spacing.xl,
  },
  button: {
    height: 60,
    borderRadius: theme.borderRadius.xl,
  },
  secondaryAction: {
    marginTop: theme.spacing.l,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
    textDecorationLine: 'underline',
  }
});
