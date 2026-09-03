import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { repositoryProvider } from '../repositories';
import { requestGlobalExportFormat } from '../utils/reportGenerator';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeAllLocalTables, getPendingSyncQueueItems } from '../database/localDatabase';
import { syncManager } from '../utils/syncManager';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Screen, ScreenHeader, Card, space, radius } from '../components/ui';

export const DatabaseMgtScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string>(t('dbMgt.loading') || 'Chargement...');
  const [pendingItems, setPendingItems] = useState<number>(0);

  const loadStatusInfo = async () => {
    try {
      const info = await AsyncStorage.getItem('last_backup_date');
      setLastBackup(info || 'Aucune sauvegarde récente');
      const queue = await getPendingSyncQueueItems();
      setPendingItems(queue.length);
    } catch (e) {
      console.error('Error loading sync info', e);
    }
  };

  useFocusEffect(useCallback(() => { loadStatusInfo(); }, []));

  if (!isOwner) {
    return (
      <Screen width="narrow" header={<ScreenHeader title="Exports & Sauvegardes" onBack={() => navigation.goBack()} />}>
        <View style={styles.center}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[styles.restrictTitle, { color: theme.colors.text }]}>Accès Restreint</Text>
          <Text style={[styles.restrictText, { color: theme.colors.textSecondary }]}>Cette section est réservée aux propriétaires de la ferme.</Text>
          <Button title="Retour" onPress={() => navigation.goBack()} style={{ marginTop: 30, width: '100%' }} />
        </View>
      </Screen>
    );
  }

  const handleExport = async () => {
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
        'Fermes': farms,
        'Lots': lots.filter((l: any) => l.status !== 'ANNULEE'),
        'Productions': productions.filter((p: any) => p.status !== 'ANNULEE'),
        'Ventes': sales.filter((s: any) => s.status !== 'ANNULEE'),
        'Dépenses': expenses.filter((e: any) => e.status !== 'ANNULEE'),
        'Employés': employees,
        'Santé': health,
        'Alimentation': feeds,
        'Mouvements': movements,
        'Achats Aliments': feedPurchases.filter((p: any) => p.status !== 'ANNULEE'),
        'Achats Médicaments': healthPurchases.filter((p: any) => p.status !== 'ANNULEE'),
      };

      requestGlobalExportFormat(allData, 'SolFerme_Global_Export', t);
    } catch (error) {
      Alert.alert(t('common.error') || 'Erreur', "Erreur lors de l'exportation globale.");
    } finally {
      setExporting(false);
    }
  };

  const handleServerBackup = async () => {
    setBackingUp(true);
    try {
      await syncManager.syncAll();
      const now = new Date().toLocaleString('fr-FR');
      await AsyncStorage.setItem('last_backup_date', now);
      setLastBackup(now);
      await loadStatusInfo();
      if (Platform.OS === 'web') alert('Synchronisation et sauvegarde réussies.');
      else Alert.alert('Succès', 'Toutes les données ont été synchronisées avec le serveur.');
    } catch (error) {
      if (Platform.OS === 'web') alert('Erreur de synchronisation. Vérifiez votre connexion.');
      else Alert.alert('Erreur', 'La sauvegarde a échoué. Veuillez vérifier votre connexion.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearLocal = () => {
    const executeClear = async () => {
      try {
        await wipeAllLocalTables();
        await AsyncStorage.multiRemove(['farms_cache', 'lots_cache', 'productions_cache', 'last_backup_date']);
        setLastBackup('Aucune sauvegarde récente');
        setPendingItems(0);
        if (Platform.OS === 'web') alert('Base locale vidée avec succès.');
        else Alert.alert('Succès', 'Base locale vidée avec succès.');
      } catch (e: any) {
        if (Platform.OS === 'web') alert(e?.message || 'Erreur lors du vidage.');
        else Alert.alert('Erreur', e?.message || 'Erreur lors du vidage.');
      }
    };

    const confirmMsg = 'Toutes les données locales seront supprimées. Les données serveur seront re-téléchargées à la prochaine connexion.\n\n⚠️ Les modifications non synchronisées seront PERDUES.';
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) executeClear();
      return;
    }
    Alert.alert('Vider la base locale', confirmMsg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Vider', style: 'destructive', onPress: executeClear },
    ]);
  };

  const ActionRow = ({ icon, iconBg, iconColor, title, desc, onPress, busy, danger }: any) => (
    <Pressable style={styles.actionRow} onPress={onPress} disabled={busy}>
      <View style={[styles.actionIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={21} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.actionTitle, { color: danger ? theme.colors.danger : theme.colors.text }]}>{title}</Text>
        <Text style={styles.actionDesc}>{desc}</Text>
      </View>
      <MaterialIcons name={busy ? 'hourglass-empty' : 'chevron-right'} size={20} color={danger ? theme.colors.danger : theme.colors.textSecondary} />
    </Pressable>
  );

  return (
    <Screen scroll width="narrow" header={<ScreenHeader title="Exports & Sauvegardes" onBack={() => navigation.goBack()} />}>
      <View style={[styles.statusBanner, { backgroundColor: pendingItems > 0 ? '#F57C0018' : '#2E7D3218' }]}>
        <MaterialIcons name={pendingItems > 0 ? 'sync-problem' : 'cloud-done'} size={22} color={pendingItems > 0 ? '#F57C00' : '#2E7D32'} />
        <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
          {pendingItems > 0 ? `${pendingItems} élément(s) en attente de synchronisation` : 'Données à jour — tout est sauvegardé'}
        </Text>
      </View>

      <Card style={{ padding: space.xs }}>
        <ActionRow icon="file-download" iconBg={theme.colors.primary + '18'} iconColor={theme.colors.primary}
          title="Export Global (Excel)" desc="Télécharger toutes les données de la ferme" onPress={handleExport} busy={exporting} />
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <ActionRow icon="cloud-upload" iconBg="#2980b918" iconColor="#2980b9"
          title="Forcer la sauvegarde" desc={`Dernière : ${lastBackup}`} onPress={handleServerBackup} busy={backingUp} />
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <ActionRow icon="delete-sweep" iconBg={theme.colors.danger + '14'} iconColor={theme.colors.danger}
          title="Réinitialiser l'appareil" desc="Vide la mémoire locale (données serveur préservées)" onPress={handleClearLocal} danger />
      </Card>
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  restrictTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  restrictText: { fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '600' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', padding: space.sm, borderRadius: radius.md, marginBottom: space.md, gap: 10 },
  statusTitle: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: space.xs, gap: space.sm },
  actionIcon: { width: 38, height: 38, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
});
