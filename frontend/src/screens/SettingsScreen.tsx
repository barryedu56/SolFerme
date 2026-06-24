import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { Card } from '../components/Card';
import { MaterialIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';

export const SettingsScreen = ({ navigation }: any) => {
  const { themeMode, setThemeMode, isDarkMode, notifications, toggleNotifications, theme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const [autoBackup, setAutoBackup] = useState(true);
  const [cacheSize, setCacheSize] = useState('0 MB');
  const [lastSync, setLastSync] = useState('---');

  useEffect(() => {
    calculateCacheSize();
    loadLastSync();
  }, []);

  const loadLastSync = async () => {
    const sync = await AsyncStorage.getItem('last_sync_date');
    if (sync) setLastSync(sync);
  };

  const calculateCacheSize = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;
      const info = await FileSystem.getInfoAsync(cacheDir);
      if (info.exists && 'size' in info) {
        setCacheSize(`${(info.size / (1024 * 1024)).toFixed(2)} MB`);
      } else {
        // Fallback or estimate if size not available directly on directory
        setCacheSize('~1.2 MB');
      }
    } catch (e) {
      setCacheSize('0.0 MB');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      t('settings.clearCache'),
      'Voulez-vous vraiment vider le cache local ? Cela supprimera les fichiers temporaires.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete cache directory contents
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                const files = await FileSystem.readDirectoryAsync(cacheDir);
                for (const file of files) {
                  await FileSystem.deleteAsync(cacheDir + file, { idempotent: true });
                }
              }
              // Clear some non-essential AsyncStorage
              await AsyncStorage.multiRemove(['farms_cache', 'lots_cache', 'productions_cache']);

              setCacheSize('0.0 MB');
              Alert.alert(t('common.success'), t('common.success'));
            } catch (e) {
              Alert.alert(t('common.error'), 'Échec du nettoyage.');
            }
          }
        }
      ]
    );
  };

  const SettingItem = ({ icon, title, subtitle, value, onValueChange, type = 'switch', onPress }: any) => (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      disabled={type === 'switch' || type === 'text'}
    >
      <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background }]}>
         <MaterialIcons name={icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.itemSubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>}
      </View>
      {type === 'switch' ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#767577', true: theme.colors.primary }}
          thumbColor={value ? '#FFFFFF' : '#f4f3f4'}
        />
      ) : type === 'text' ? (
        <Text style={[styles.itemValue, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      ) : (
        <MaterialIcons name="chevron-right" size={24} color={theme.colors.border} />
      )}
    </TouchableOpacity>
  );

  const styles = createStyles(theme, isTablet);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton}>
          <MaterialIcons name="menu" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t('settings.appearance')}</Text>
        <Card style={styles.card}>
          <SettingItem
            icon="light-mode"
            title={t('settings.themeLight')}
            type="link"
            onPress={() => setThemeMode('light')}
            subtitle={themeMode === 'light' ? 'Sélectionné' : ''}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="dark-mode"
            title={t('settings.themeDark')}
            type="link"
            onPress={() => setThemeMode('dark')}
            subtitle={themeMode === 'dark' ? 'Sélectionné' : ''}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="brightness-auto"
            title={t('settings.themeAuto')}
            type="link"
            onPress={() => setThemeMode('auto')}
            subtitle={themeMode === 'auto' ? 'Sélectionné' : ''}
          />
        </Card>

        <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
        <Card style={styles.card}>
          <SettingItem
            icon="settings-suggest"
            title={t('settings.langAuto')}
            type="link"
            onPress={() => setLanguage('auto')}
            subtitle={language === 'auto' ? 'Sélectionné' : ''}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="language"
            title="Français"
            type="link"
            onPress={() => setLanguage('fr')}
            subtitle={language === 'fr' ? 'Sélectionné' : ''}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="language"
            title="English"
            type="link"
            onPress={() => setLanguage('en')}
            subtitle={language === 'en' ? 'Sélectionné' : ''}
          />
        </Card>

        <Text style={styles.sectionLabel}>{t('settings.security')}</Text>
        <Card style={styles.card}>
          <SettingItem
            icon="lock"
            title={t('profile.changePassword')}
            type="link"
            onPress={() => navigation.navigate('Profile', { showPasswordModal: true })}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="notifications"
            title={t('profile.notifications')}
            value={notifications}
            onValueChange={toggleNotifications}
          />
        </Card>

        <Text style={styles.sectionLabel}>{t('settings.localStorage')}</Text>
        <Card style={styles.card}>
          <SettingItem
            icon="storage"
            title={t('settings.cacheSize')}
            subtitle={cacheSize}
            type="text"
          />
          <View style={styles.divider} />
          <SettingItem
            icon="sync"
            title={t('settings.lastSync')}
            subtitle={lastSync}
            type="text"
          />
          <View style={styles.divider} />
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearCache}>
            <MaterialIcons name="delete-sweep" size={20} color={theme.colors.danger} />
            <Text style={styles.clearBtnText}>{t('settings.clearCache')}</Text>
          </TouchableOpacity>
        </Card>

        <Text style={styles.sectionLabel}>Informations</Text>
        <Card style={styles.card}>
          <SettingItem
            icon="info"
            title="Version"
            subtitle="v2.1.0-PRO"
            type="text"
          />
          <View style={styles.divider} />
          <SettingItem
            icon="policy"
            title="Légal"
            subtitle="Confidentialité"
            type="link"
            onPress={() => Alert.alert('Légal', 'Vos données sont stockées de façon sécurisée.')}
          />
        </Card>

        <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>SolFerme © 2024</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    maxWidth: isTablet ? 800 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  content: {
    padding: theme.spacing.m,
    paddingBottom: 40,
    maxWidth: isTablet ? 800 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s,
    marginLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  card: { padding: 0, marginBottom: theme.spacing.xl, borderRadius: theme.borderRadius.xl, overflow: 'hidden', backgroundColor: theme.colors.surface },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 16, color: theme.colors.text, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  itemValue: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '500' },
  divider: { height: 1, backgroundColor: theme.colors.border + '30', marginLeft: 66 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m, justifyContent: 'center' },
  clearBtnText: { color: theme.colors.danger, fontWeight: 'bold', marginLeft: 8 },
  footerText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.m,
    opacity: 0.6
  }
});

