import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { repositoryProvider } from '../repositories';
import { requestGlobalExportFormat } from '../utils/reportGenerator';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeAllLocalTables, fetchRows, updateSyncQueueItem, deleteSyncQueueItem, deleteRow, runSqlAsync } from '../database/localDatabase';
import { syncManager } from '../utils/syncManager';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Screen, ScreenHeader, Card, space, radius } from '../components/ui';

// Libellés lisibles des tables de la file de synchronisation.
const TABLE_LABELS: Record<string, string> = {
  farms: 'Ferme', lots: 'Salle / lot', lot_expenses: 'Frais de lot', productions: 'Production',
  egg_conversions: 'Conversion d’œufs', sales: 'Vente', sale_payments: 'Paiement de vente',
  feeds: 'Distribution d’aliment', chicken_movements: 'Mouvement', health_records: 'Soin',
  employees: 'Employé', expenses: 'Dépense', feed_purchases: 'Achat d’aliment',
  health_purchases: 'Achat santé', feed_preparations: 'Mélange', payrolls: 'Salaire',
  attendances: 'Pointage', tasks: 'Tâche', reminders: 'Rappel', bonuses: 'Prime',
  employee_requests: 'Demande d’employé', farm_users: 'Accès à la ferme', users: 'Utilisateur',
};
const OPERATION_LABELS: Record<string, string> = { CREATE: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };

type QueueRow = {
  id: number; operation: string; table_name: string; local_id: number;
  error_message?: string | null; created_at?: string; payload_json?: string;
};

const describeItem = (it: QueueRow): string => {
  let name = '';
  try {
    const p = JSON.parse(it.payload_json || '{}');
    name = p.name || p.description || p.feed_type || p.product_name || p.title || p.customer_name || '';
  } catch { /* payload illisible */ }
  const label = TABLE_LABELS[it.table_name] || it.table_name;
  return `${OPERATION_LABELS[it.operation] || it.operation} — ${label}${name ? ` « ${name} »` : ''}`;
};

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
  const [failedItems, setFailedItems] = useState<QueueRow[]>([]);

  // « En attente » = PENDING + PROCESSING ; « refusés » = FAILED (le serveur a
  // répondu non). Avant, seuls les PENDING étaient comptés : un élément refusé
  // disparaissait du compteur et l'écran affichait « tout est sauvegardé ».
  const loadStatusInfo = async (): Promise<{ pending: number; failed: QueueRow[] }> => {
    try {
      const info = await AsyncStorage.getItem('last_backup_date');
      setLastBackup(info || 'Aucune sauvegarde récente');
      const pending = await fetchRows<QueueRow>('sync_queue', "status IN ('PENDING', 'PROCESSING')");
      const failed = await fetchRows<QueueRow>('sync_queue', "status = 'FAILED' ORDER BY created_at");
      setPendingItems(pending.length);
      setFailedItems(failed);
      return { pending: pending.length, failed };
    } catch (e) {
      console.error('Error loading sync info', e);
      return { pending: 0, failed: [] };
    }
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const retryItem = async (it: QueueRow) => {
    await updateSyncQueueItem(it.id, { status: 'PENDING', retry_count: 0, error_message: null, updated_at: new Date().toISOString() });
    await handleServerBackup();
  };

  const removeItem = (it: QueueRow) => {
    const isLocalCreate = it.operation === 'CREATE' && typeof it.local_id === 'number' && it.local_id < 0;
    const msg = isLocalCreate
      ? `« ${describeItem(it)} » n'existe que sur ce téléphone et sera supprimé définitivement. Tu pourras le ressaisir correctement ensuite.`
      : `Cette ${(OPERATION_LABELS[it.operation] || 'opération').toLowerCase()} ne sera pas envoyée au serveur.`;
    const execute = async () => {
      try {
        await deleteSyncQueueItem(it.id);
        if (isLocalCreate) {
          // Les autres opérations en file sur ce même enregistrement local n'ont plus d'objet.
          await runSqlAsync('DELETE FROM sync_queue WHERE local_id = ? AND table_name = ?', [it.local_id, it.table_name]);
          await deleteRow(it.table_name, it.local_id).catch(() => {});
        }
      } finally {
        await loadStatusInfo();
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) execute();
      return;
    }
    Alert.alert('Supprimer cet élément ?', msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: execute },
    ]);
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
    if (syncManager.busy) {
      notify('Synchronisation en cours', 'Une synchronisation est déjà en cours. Réessaie dans quelques secondes.');
      return;
    }
    setBackingUp(true);
    try {
      const ran = await syncManager.syncAll();
      const { pending, failed } = await loadStatusInfo();
      if (!ran) {
        notify('Synchronisation impossible', 'Vérifie ta connexion Internet, ou reconnecte-toi si ta session a expiré.');
      } else if (failed.length > 0) {
        notify(
          `${failed.length} élément(s) refusé(s) par le serveur`,
          `${failed.map((f) => `• ${describeItem(f)}\n  ${f.error_message || 'raison inconnue'}`).join('\n')}\n\nCorrige ou supprime-les depuis cet écran.`
        );
      } else if (pending > 0) {
        notify('Synchronisation incomplète', `${pending} élément(s) toujours en attente (connexion lente ou coupée). Ils partiront automatiquement dès que possible.`);
      } else {
        const now = new Date().toLocaleString('fr-FR');
        await AsyncStorage.setItem('last_backup_date', now);
        setLastBackup(now);
        notify('Succès', 'Toutes les données ont été synchronisées avec le serveur.');
      }
    } catch (error) {
      notify('Erreur', 'La synchronisation a échoué. Vérifie ta connexion.');
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
        setFailedItems([]);
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
      <View style={[styles.statusBanner, { backgroundColor: failedItems.length > 0 ? theme.colors.danger + '18' : pendingItems > 0 ? '#F57C0018' : '#2E7D3218' }]}>
        <MaterialIcons
          name={failedItems.length > 0 ? 'error-outline' : pendingItems > 0 ? 'sync-problem' : 'cloud-done'}
          size={22}
          color={failedItems.length > 0 ? theme.colors.danger : pendingItems > 0 ? '#F57C00' : '#2E7D32'}
        />
        <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
          {failedItems.length > 0
            ? `${failedItems.length} élément(s) refusé(s) par le serveur${pendingItems > 0 ? ` · ${pendingItems} en attente` : ''}`
            : pendingItems > 0
              ? `${pendingItems} élément(s) en attente de synchronisation`
              : 'Données à jour — tout est sauvegardé'}
        </Text>
      </View>

      {failedItems.length > 0 && (
        <Card style={{ padding: space.sm, marginBottom: space.md }}>
          <Text style={[styles.failedHeader, { color: theme.colors.text }]}>Refusés par le serveur</Text>
          <Text style={styles.actionDesc}>
            Ces éléments sont sur ce téléphone mais le serveur les a refusés. Lis la raison, puis réessaie (si tu as corrigé la cause) ou supprime-les et ressaisis-les.
          </Text>
          {failedItems.map((it) => (
            <View key={it.id} style={[styles.failedRow, { borderColor: theme.colors.border }]}>
              <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{describeItem(it)}</Text>
              <Text style={[styles.failedReason, { color: theme.colors.danger }]}>{it.error_message || 'Raison inconnue'}</Text>
              <View style={styles.failedActions}>
                <Pressable onPress={() => retryItem(it)} disabled={backingUp} style={styles.failedBtn}>
                  <MaterialIcons name="refresh" size={16} color="#2980b9" />
                  <Text style={[styles.failedBtnText, { color: '#2980b9' }]}>Réessayer</Text>
                </Pressable>
                <Pressable onPress={() => removeItem(it)} disabled={backingUp} style={styles.failedBtn}>
                  <MaterialIcons name="delete-outline" size={16} color={theme.colors.danger} />
                  <Text style={[styles.failedBtnText, { color: theme.colors.danger }]}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}

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
  failedHeader: { fontSize: 13.5, fontWeight: '800', marginBottom: 4 },
  failedRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, marginTop: space.sm },
  failedReason: { fontSize: 12.5, fontWeight: '600', marginTop: 3 },
  failedActions: { flexDirection: 'row', gap: space.md, marginTop: 6 },
  failedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  failedBtnText: { fontSize: 13, fontWeight: '700' },
});
