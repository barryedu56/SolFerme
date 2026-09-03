import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen, ScreenHeader, space, radius } from '../components/ui';

export const SettingsScreen = ({ navigation }: any) => {
  const { themeMode, setThemeMode, isDarkMode, notifications, toggleNotifications, theme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { userName, userRole } = useAuth();
  const styles = React.useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);
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
        setCacheSize('~1.2 MB');
      }
    } catch (e) {
      setCacheSize('0.0 MB');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      t('settings.clearCache'),
      t('settings.clearCacheConfirm') || 'Voulez-vous vraiment vider le cache local ? Cela supprimera les fichiers temporaires.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                const files = await FileSystem.readDirectoryAsync(cacheDir);
                for (const file of files) {
                  await FileSystem.deleteAsync(cacheDir + file, { idempotent: true });
                }
              }
              await AsyncStorage.multiRemove(['farms_cache', 'lots_cache', 'productions_cache']);
              setCacheSize('0.0 MB');
              Alert.alert(t('common.success'), t('common.success'));
            } catch (e) {
              Alert.alert(t('common.error'), t('settings.clearCacheError') || 'Échec du nettoyage.');
            }
          },
        },
      ],
    );
  };

  /* ── Sélecteur segmenté (thème / langue) ── */
  const Segmented = ({ options, value, onChange }: { options: { key: string; label: string; icon: any; lib?: 'm' | 'c' }[]; value: string; onChange: (k: string) => void }) => (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segBtn, active && { backgroundColor: theme.colors.primary }]}>
            {o.lib === 'c'
              ? <MaterialCommunityIcons name={o.icon} size={17} color={active ? '#1A1A1A' : theme.colors.textSecondary} />
              : <MaterialIcons name={o.icon} size={17} color={active ? '#1A1A1A' : theme.colors.textSecondary} />}
            <Text style={[styles.segTxt, { color: active ? '#1A1A1A' : theme.colors.textSecondary }, active && { fontWeight: '800' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const Row = ({ icon, title, subtitle, value, onValueChange, onPress, danger, right }: any) => (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={[styles.rowIcon, { backgroundColor: (danger ? theme.colors.danger : theme.colors.primary) + '16' }]}>
        <MaterialIcons name={icon} size={19} color={danger ? theme.colors.danger : theme.colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: danger ? theme.colors.danger : theme.colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {onValueChange !== undefined ? (
        <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#767577', true: theme.colors.primary }} thumbColor="#FFFFFF" />
      ) : right !== undefined ? right : onPress ? (
        <MaterialIcons name="chevron-right" size={20} color={theme.colors.border} />
      ) : null}
    </Pressable>
  );

  const Section = ({ icon, label, children }: any) => (
    <>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={14} color={theme.colors.primary} />
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      <Card style={styles.card}>{children}</Card>
    </>
  );
  const Div = () => <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;

  return (
    <Screen
      scroll
      width="narrow"
      header={<ScreenHeader title={t('settings.title')} large onMenu={Platform.OS !== 'web' ? () => navigation.openDrawer() : undefined} />}
    >
      {/* Carte identité */}
      <Card style={styles.hero}>
        <View style={[styles.heroAvatar, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.heroAvatarTxt}>{(userName || 'U').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.heroName, { color: theme.colors.text }]} numberOfLines={1}>{userName}</Text>
          <Text style={styles.heroRole}>{userRole === 'EMPLOYE' ? t('profile.employee') : t('profile.owner')}</Text>
        </View>
        <Pressable style={[styles.heroBtn, { borderColor: theme.colors.border }]} onPress={() => navigation.navigate('Profile')}>
          <Text style={[styles.heroBtnTxt, { color: theme.colors.primary }]}>{t('common.edit')}</Text>
        </Pressable>
      </Card>

      <Section icon="palette-outline" label={t('settings.appearance')}>
        <View style={{ padding: space.md, gap: space.sm }}>
          <Text style={styles.pickerLabel}>{t('settings.appearance')}</Text>
          <Segmented
            value={themeMode}
            onChange={setThemeMode as any}
            options={[
              { key: 'light', label: t('settings.themeLight'), icon: 'light-mode' },
              { key: 'dark', label: t('settings.themeDark'), icon: 'dark-mode' },
              { key: 'auto', label: t('settings.themeAuto'), icon: 'brightness-auto' },
            ]}
          />
          <Text style={[styles.pickerLabel, { marginTop: space.xs }]}>{t('settings.language')}</Text>
          <Segmented
            value={language}
            onChange={setLanguage as any}
            options={[
              { key: 'fr', label: 'Français', icon: 'flag-outline', lib: 'c' },
              { key: 'en', label: 'English', icon: 'flag-outline', lib: 'c' },
              { key: 'auto', label: t('settings.langAuto'), icon: 'auto-mode' },
            ]}
          />
        </View>
      </Section>

      <Section icon="shield-lock-outline" label={t('settings.security')}>
        <Row icon="lock" title={t('profile.changePassword')} onPress={() => navigation.navigate('Profile', { showPasswordModal: true })} />
        <Div />
        <Row icon="notifications" title={t('profile.notifications')} value={notifications} onValueChange={toggleNotifications} />
      </Section>

      <Section icon="database-outline" label={t('settings.localStorage')}>
        <Row icon="storage" title={t('settings.cacheSize')} right={<Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>{cacheSize}</Text>} />
        <Div />
        <Row icon="sync" title={t('settings.lastSync')} right={<Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>{lastSync}</Text>} />
        <Div />
        <Row icon="delete-sweep" title={t('settings.clearCache')} danger onPress={handleClearCache} />
      </Section>

      <Section icon="information-outline" label={t('common.info')}>
        <Row icon="verified" title={t('common.version')} right={<Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>v{Constants.expoConfig?.version || '2.1.0'}</Text>} />
        <Div />
        <Row icon="policy" title={t('settings.legal')} subtitle={t('settings.privacy')} onPress={() => Alert.alert(t('settings.legal'), t('settings.legalDesc'))} />
      </Section>

      <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>SolFerme © {new Date().getFullYear()}</Text>
    </Screen>
  );
};

const createStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg, borderRadius: radius.lg },
  heroAvatar: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heroAvatarTxt: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  heroName: { fontSize: 16, fontWeight: '800' },
  heroRole: { fontSize: 12.5, color: theme.colors.primary, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  heroBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  heroBtnTxt: { fontSize: 13, fontWeight: '800' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: space.xs, marginLeft: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { padding: 0, marginBottom: space.lg, borderRadius: radius.lg, overflow: 'hidden' },

  pickerLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  segmented: { flexDirection: 'row', backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.sm },
  segTxt: { fontSize: 12, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: 13 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowValue: { fontSize: 13.5, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62, opacity: 0.5 },
  footerText: { textAlign: 'center', fontSize: 12, marginTop: space.sm, opacity: 0.6 },
});
