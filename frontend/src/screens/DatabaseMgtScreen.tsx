import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { repositoryProvider } from '../repositories';
import { requestGlobalExportFormat } from '../utils/reportGenerator';
import { runStressTestSyncQueue } from '../utils/stressSync';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeAllLocalTables } from '../database/localDatabase';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export const DatabaseMgtScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [runningStressTest, setRunningStressTest] = useState(false);
  const [lastBackup, setLastBackup] = useState<string>(t('dbMgt.loading'));

  useEffect(() => {
    loadLastBackupInfo();
  }, []);

  const loadLastBackupInfo = async () => {
    const info = await AsyncStorage.getItem('last_backup_date');
    setLastBackup(info || t('dbMgt.noRecentBackup'));
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
             <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('dbMgt.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Accès Restreint</Text>
          <Text style={[styles.filterText, { textAlign: 'center', marginTop: 10 }]}>
            Cette section est réservée aux propriétaires de la ferme.
          </Text>
          <Button
            title="Retour"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 30, width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const handleExport = async () => {
    console.log('[TEST SOLFERME] EXPORT DATABASE CLICK');
    setExporting(true);
    try {
      const [farms, lots, productions, sales, expenses, employees, health, feeds, movements, feedPurchases, healthPurchases] = await Promise.all([
        repositoryProvider.api.fetchAll('/farms/'),
        repositoryProvider.api.fetchAll('/lots/'),
        repositoryProvider.api.fetchAll('/productions/'),
        repositoryProvider.api.fetchAll('/sales/'),
        repositoryProvider.api.fetchAll('/expenses/'),
        repositoryProvider.api.fetchAll('/employees/'),
        repositoryProvider.api.fetchAll('/health-records/').catch(() => []),
        repositoryProvider.api.fetchAll('/feeds/').catch(() => []),
        repositoryProvider.api.fetchAll('/movements/').catch(() => []),
        repositoryProvider.api.fetchAll('/feed-purchases/').catch(() => []),
        repositoryProvider.api.fetchAll('/health-purchases/').catch(() => []),
      ]);

      const allData: any = {
        [t('farms.title')]: farms,
        [t('farms.batches')]: lots.filter((l: any) => l.status !== 'ANNULEE'),
        [t('production.title')]: productions.filter((p: any) => p.status !== 'ANNULEE'),
        [t('sales.title')]: sales.filter((s: any) => s.status !== 'ANNULEE'),
        [t('expenses.title')]: expenses.filter((e: any) => e.status !== 'ANNULEE'),
        [t('employees.title')]: employees,
        [t('health.title')]: health,
        [t('feed.title')]: feeds,
        [t('movement.title')]: movements,
        [t('feed.tabPurchase')]: feedPurchases.filter((p: any) => p.status !== 'ANNULEE'),
        [t('health.tabPurchase')]: healthPurchases.filter((p: any) => p.status !== 'ANNULEE'),
      };

      requestGlobalExportFormat(allData, "SolFerme_Global_Export", t);
    } catch (error) {
      console.error('[TEST SOLFERME] EXPORT DATABASE ERROR:', error);
      Alert.alert(t('common.error'), t('dbMgt.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const handleServerBackup = async () => {
    setBackingUp(true);
    try {
      // Simulation d'un appel backend pour backup
      await new Promise(resolve => setTimeout(resolve, 2000));
      const now = new Date().toLocaleString();
      await AsyncStorage.setItem('last_backup_date', now);
      setLastBackup(now);
      Alert.alert(t('common.success'), t('dbMgt.backupSuccess'));
    } catch (error) {
      Alert.alert(t('common.error'), t('dbMgt.backupError'));
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearLocal = () => {
    const executeClear = async () => {
      try {
        await wipeAllLocalTables();
        await AsyncStorage.multiRemove(['farms_cache', 'lots_cache', 'productions_cache']);
        Alert.alert(t('common.success'), t('dbMgt.clearSuccess') || 'Base locale vidée avec succès.');
      } catch (e: any) {
        Alert.alert(t('common.error'), e?.message || 'Erreur lors du vidage.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm((t('dbMgt.clearConfirmDesc') || 'Toutes les données locales seront supprimées. Les données serveur seront re-téléchargées à la prochaine synchronisation.') + '\n\n⚠️ Les modifications non synchronisées seront PERDUES.')) {
        executeClear();
      }
      return;
    }

    Alert.alert(
      t('dbMgt.clearConfirmTitle') || 'Vider la base locale',
      (t('dbMgt.clearConfirmDesc') || 'Toutes les données locales seront supprimées. Les données serveur seront re-téléchargées à la prochaine synchronisation.') + '\n\n⚠️ Les modifications non synchronisées seront PERDUES.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete') || 'Vider',
          style: 'destructive',
          onPress: executeClear
        }
      ]
    );
  };

  const handleStressTest = async () => {
    setRunningStressTest(true);
    try {
      await runStressTestSyncQueue();
      Alert.alert(t('dbMgt.stressTest'), t('dbMgt.testFinished'));
    } catch (error) {
      Alert.alert(t('common.error'), t('dbMgt.testError'));
    } finally {
      setRunningStressTest(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('dbMgt.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('dbMgt.exportSave')}</Text>

        <Card style={styles.card}>
           <View style={styles.optionRow}>
              <View style={styles.iconContainer}>
                 <MaterialIcons name="file-download" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.optionTextContainer}>
                 <Text style={styles.optionTitle}>{t('dbMgt.globalExport')}</Text>
                 <Text style={styles.optionDesc}>{t('dbMgt.globalExportDesc')}</Text>
              </View>
           </View>
           <Button
            title={exporting ? t('dbMgt.fetchingData') : t('dbMgt.exportBtn')}
            onPress={handleExport}
            loading={exporting}
            style={styles.actionBtn}
           />
        </Card>

        <Card style={styles.card}>
           <View style={styles.optionRow}>
              <View style={styles.iconContainer}>
                 <MaterialIcons name="cloud-upload" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.optionTextContainer}>
                 <Text style={styles.optionTitle}>{t('dbMgt.serverBackup')}</Text>
                 <Text style={styles.optionDesc}>{t('dbMgt.lastBackup', { date: lastBackup })}</Text>
              </View>
           </View>
           <Button
            title={t('dbMgt.launchBackup')}
            onPress={handleServerBackup}
            loading={backingUp}
            variant="secondary"
            style={styles.actionBtn}
           />
        </Card>

        <Text style={[styles.sectionTitle, { color: theme.colors.danger, marginTop: theme.spacing.l }]}>{t('dbMgt.security')}</Text>

        <Card style={[styles.card, { borderColor: theme.colors.danger, borderWidth: 0.8 }]}>
           <View style={styles.optionRow}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.danger + '10' }]}>
                 <MaterialIcons name="delete-sweep" size={24} color={theme.colors.danger} />
              </View>
              <View style={styles.optionTextContainer}>
                 <Text style={styles.optionTitle}>{t('dbMgt.cacheClean')}</Text>
                 <Text style={styles.optionDesc}>{t('dbMgt.cacheCleanDesc')}</Text>
              </View>
           </View>
           <Button
            title={t('dbMgt.clearLocalBtn')}
            onPress={handleClearLocal}
            variant="danger"
            style={styles.actionBtn}
           />
        </Card>

        <Text style={[styles.sectionTitle, { marginTop: theme.spacing.l }]}>{t('dbMgt.devTools')}</Text>

        <Card style={styles.card}>
           <View style={styles.optionRow}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.secondary + '15' }]}>
                 <MaterialIcons name="speed" size={24} color={theme.colors.secondary} />
              </View>
              <View style={styles.optionTextContainer}>
                 <Text style={styles.optionTitle}>{t('dbMgt.stressTest')}</Text>
                 <Text style={styles.optionDesc}>{t('dbMgt.stressTestDesc')}</Text>
              </View>
           </View>
           <Button
            title={runningStressTest ? t('dbMgt.runningTest') : t('dbMgt.launchTest')}
            onPress={handleStressTest}
            loading={runningStressTest}
            variant="secondary"
            style={styles.actionBtn}
           />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border
  },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  content: { padding: theme.spacing.m, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m, textTransform: 'uppercase', letterSpacing: 1 },
  filterText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  card: { padding: theme.spacing.m, marginBottom: theme.spacing.m, borderRadius: theme.borderRadius.xl },
  optionRow: { flexDirection: 'row', marginBottom: theme.spacing.m, alignItems: 'center' },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  optionTextContainer: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  optionDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2, lineHeight: 18 },
  actionBtn: { marginTop: theme.spacing.s, borderRadius: 12 },
});