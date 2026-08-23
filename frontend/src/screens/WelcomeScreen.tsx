import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const WelcomeScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop, isDesktopOrTablet), [theme, isDesktop, isDesktopOrTablet]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="egg" size={50} color="#000000" />
          </View>
          <Text style={styles.brandName}>SolFerme</Text>
        </View>

        <View style={styles.textSection}>
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button 
            title={t('welcome.getStarted')}
            onPress={() => navigation.navigate('Login')} 
            style={styles.button}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>{t('welcome.createAccount')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false, isDesktopOrTablet: boolean = false) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xl * 1.5,
    ...(isDesktopOrTablet && {
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    }),
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
    ...(isDesktopOrTablet && {
      maxWidth: 400,
      alignSelf: 'center',
    }),
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
