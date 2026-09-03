import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, RefreshControl, Alert, ScrollView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { Screen, ScreenHeader, useContentWidth, Card, Chip, Badge, EmptyState, space, radius } from '../components/ui';

export const LotHistoryScreen = ({ route, navigation }: any) => {
  const { lotId, lotName } = route.params || {};
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const contentW = useContentWidth('narrow');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const fetchHistory = async () => {
    if (!lotId) { setLoading(false); setRefreshing(false); return; }
    if (!refreshing) setLoading(true);
    try {
      const response = await repositoryProvider.api.get(`/activity-logs/?lot=${lotId}&period=${filterPeriod}`).catch(() => ({ data: [] }));
      const rawLogs = Array.isArray(response.data) ? response.data : (response.data?.results || []);
      const seenLogs = new Map<number, any>();
      for (const log of rawLogs) {
        const existing = seenLogs.get(log.id);
        if (!existing) {
          seenLogs.set(log.id, log);
        } else if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
          if (log.id > 0 && existing.id < 0) seenLogs.set(log.id, log);
        }
      }
      setLogs(Array.from(seenLogs.values()));
    } catch (error) {
      console.log('Erreur LotHistory:', error);
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let result = [...logs];
    if (filterPeriod && filterPeriod !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startDate = (() => {
        switch (filterPeriod) {
          case 'day': return todayStart;
          case 'week': return new Date(todayStart.getTime() - 7 * 86400000);
          case 'month': return new Date(todayStart.getTime() - 30 * 86400000);
          case 'year': return new Date(todayStart.getTime() - 365 * 86400000);
          default: return null;
        }
      })();
      if (startDate) result = result.filter((log) => new Date(log.date) >= startDate);
    }
    return result.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [logs, sortOrder, filterPeriod]);

  const getModuleLabel = (module: string, action?: string) => {
    let correctedModule = module;
    if (action) {
      const actionLower = action.toLowerCase();
      if (actionLower.includes('production') || actionLower.includes('casiers') || actionLower.includes('collect')) {
        correctedModule = 'Production';
      } else if (actionLower.includes('vente') || actionLower.includes('sale') || actionLower.includes('client')) {
        correctedModule = 'Vente';
      } else if (actionLower.includes('aliment') || actionLower.includes('feed') || actionLower.includes('nutrition')) {
        correctedModule = 'Alimentation';
      } else if (actionLower.includes('santé') || actionLower.includes('health') || actionLower.includes('traitement') || actionLower.includes('vaccin')) {
        correctedModule = 'Santé';
      } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
        correctedModule = 'Mouvement';
      } else if (actionLower.includes('dépense') || actionLower.includes('expense') || actionLower.includes('finance')) {
        correctedModule = 'Finance';
      }
    }
    switch (correctedModule) {
      case 'Production': return t('actions.production');
      case 'Vente': return t('actions.sale');
      case 'Alimentation': return t('actions.nutrition') || 'Alimentation';
      case 'Santé': return t('actions.health') || 'Santé';
      case 'Mouvement': return t('actions.movement');
      case 'Finance': return t('actions.finance') || 'Finance';
      case 'Rappel': return t('actions.reminder');
      default: return correctedModule;
    }
  };

  const handleCancelAction = (item: any) => {
    console.log('[TEST SOLFERME] CANCEL HISTORY CLICK', item);
    const executeCancel = async () => {
      console.log('[TEST SOLFERME] CANCEL HISTORY CONFIRMED', item);
      try {
        let endpoint = '';
        const actionLower = item.action.toLowerCase();
        const relatedId = item.related_id || item.id;

        if (actionLower.includes('conversion')) {
          endpoint = `/egg-conversions/${relatedId}/`;
        } else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) {
          endpoint = `/sale-payments/${relatedId}/`;
        } else if (actionLower.includes('vente poules')) {
          endpoint = `/sales/${relatedId}/`;
        } else if (actionLower.includes('vente') || actionLower.includes('sale')) {
          endpoint = `/sales/${relatedId}/`;
        } else if (actionLower.includes('salaire')) {
          endpoint = `/payrolls/${relatedId}/`;
        } else if (actionLower.includes('prime')) {
          endpoint = `/bonuses/${relatedId}/`;
        } else if (actionLower.includes('dépense') || actionLower.includes('expense')) {
          endpoint = `/expenses/${relatedId}/`;
        } else if (actionLower.includes('production') || actionLower.includes('casiers')) {
          endpoint = `/productions/${relatedId}/`;
        } else if (actionLower.includes('achat aliment') || actionLower.includes('feed purchase')) {
          endpoint = `/feed-purchases/${relatedId}/`;
        } else if (actionLower.includes('préparation') || actionLower.includes('preparation')) {
          endpoint = `/feed-preparations/${relatedId}/`;
        } else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) {
          endpoint = `/feeds/${relatedId}/`;
        } else if (actionLower.includes('achat santé') || actionLower.includes('health purchase')) {
          endpoint = `/health-purchases/${relatedId}/`;
        } else if (actionLower.includes('santé') || actionLower.includes('health') || actionLower.includes('traitement') || actionLower.includes('soin')) {
          endpoint = `/health-records/${relatedId}/`;
        } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
          endpoint = `/movements/${relatedId}/`;
        } else if (actionLower.includes('rappel')) {
          endpoint = `/reminders/${relatedId}/`;
        }

        if (endpoint) {
          await repositoryProvider.api.delete(endpoint);
          import('../utils/dataEvents').then(({ emitDataChange }) => {
            emitDataChange({ tableName: 'lots' });
            emitDataChange({ tableName: 'productions' });
            emitDataChange({ tableName: 'sales' });
            emitDataChange({ tableName: 'feeds' });
            emitDataChange({ tableName: 'chicken_movements' });
            emitDataChange({ tableName: 'health_records' });
            emitDataChange({ tableName: 'expenses' });
            emitDataChange({ tableName: 'egg_conversions' });
            emitDataChange({ tableName: 'feed_purchases' });
            emitDataChange({ tableName: 'health_purchases' });
          });
          if (Platform.OS === 'web') toast.success(t('common.success'), t('common.cancelSuccess'));
          else Alert.alert(t('common.success'), t('common.cancelSuccess'));
          fetchHistory();
        }
      } catch (error: any) {
        const msg = getErrorMessage(error, "Erreur lors de l'annulation");
        if (Platform.OS === 'web') toast.error(t('common.actionImpossible'), msg);
        else Alert.alert(t('common.actionImpossible'), msg);
      }
    };

    if (Platform.OS === 'web') {
      console.log('[TEST SOLFERME] CANCEL HISTORY: web path - using window.confirm');
      if (window.confirm(t('finance.confirmCancelMsg'))) executeCancel();
      return;
    }
    Alert.alert(t('finance.confirmCancelTitle'), t('finance.confirmCancelMsg'), [
      { text: t('common.no'), style: 'cancel' },
      { text: t('finance.yesCancel'), style: 'destructive', onPress: executeCancel },
    ]);
  };

  const handleEditAction = async (item: any) => {
    try {
      setLoading(true);
      let endpoint = '';
      let screen = '';
      const actionLower = item.action.toLowerCase();
      const relatedId = item.related_id || item.id;

      if (actionLower.includes('conversion')) {
        endpoint = `/egg-conversions/${relatedId}/`;
        screen = 'ProductionConvert';
      } else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) {
        setLoading(false);
        const msg = 'Pour modifier un paiement de vente, veuillez vous rendre sur la carte de la vente correspondante et gérer ses paiements.';
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('vente poules')) {
        endpoint = `/sales/${relatedId}/`;
        screen = 'ActionVentePoules';
      } else if (actionLower.includes('vente') || actionLower.includes('sale')) {
        endpoint = `/sales/${relatedId}/`;
        screen = 'ActionVente';
      } else if (actionLower.includes('salaire')) {
        setLoading(false);
        const msg = "La modification d'un salaire depuis l'historique sera bientôt disponible. Veuillez l'annuler et le recréer pour le moment.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('prime')) {
        setLoading(false);
        const msg = 'Les primes ne peuvent pas être modifiées. Veuillez annuler la prime et en créer une nouvelle.';
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('dépense') || actionLower.includes('depense') || actionLower.includes('expense')) {
        endpoint = `/expenses/${relatedId}/`;
        screen = 'AddExpense';
      } else if (actionLower.includes('production') || actionLower.includes('casiers')) {
        endpoint = `/productions/${relatedId}/`;
        screen = 'ActionProduction';
      } else if (actionLower.includes('achat aliment') || actionLower.includes('feed purchase')) {
        endpoint = `/feed-purchases/${relatedId}/`;
        screen = 'Purchase';
      } else if (actionLower.includes('préparation') || actionLower.includes('preparation')) {
        endpoint = `/feed-preparations/${relatedId}/`;
        screen = 'ActionPreparation';
      } else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) {
        endpoint = `/feeds/${relatedId}/`;
        screen = 'ActionAlimentation';
      } else if (actionLower.includes('achat santé') || actionLower.includes('achat sante')) {
        endpoint = `/health-purchases/${relatedId}/`;
        screen = 'Purchase';
      } else if (actionLower.includes('santé') || actionLower.includes('sante') || actionLower.includes('traitement') || actionLower.includes('soin')) {
        endpoint = `/health-records/${relatedId}/`;
        screen = 'ActionSante';
      } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
        endpoint = `/movements/${relatedId}/`;
        screen = 'ActionMouvement';
      } else if (actionLower.includes('rappel')) {
        endpoint = `/reminders/${relatedId}/`;
        screen = 'ActionReminder';
      }

      if (!endpoint || !screen) {
        setLoading(false);
        const msg = "La modification de ce type d'action n'est pas encore supportée.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      }

      const response = await repositoryProvider.api.get(endpoint);
      const originalItem = response.data;

      let finalScreen = screen;
      if (originalItem.product_type === 'CHICKEN') finalScreen = 'ActionVentePoules';

      const navParams: any = {
        item: originalItem,
        lotId,
        lotName,
        farmId: item.farm || originalItem.farm,
      };

      if (screen === 'ActionReminder') {
        navParams.reminderId = relatedId;
      } else if (screen === 'Purchase') {
        navParams.type = actionLower.includes('santé') || actionLower.includes('sante') ? 'health' : 'feed';
      }

      navigation.navigate(finalScreen, navParams);
    } catch (error: any) {
      console.log('Erreur modification:', error);
      if (Platform.OS === 'web') { toast.error(t('common.error'), "Impossible de récupérer les détails de l'action (peut-être a-t-elle été supprimée ?)."); }
      else { Alert.alert(t('common.error'), "Impossible de récupérer les détails de l'action."); }
    } finally {
      setLoading(false);
    }
  };

  const handleActionPress = async (item: any) => {
    const isCancelled = item.action.toLowerCase().includes('annul') || item.action.toLowerCase().includes('suppression');
    if (isCancelled) {
      if (Platform.OS === 'web') { toast.info(t('common.info') || 'Info', 'Cette action est déjà annulée.'); }
      else { Alert.alert(t('common.info') || 'Info', 'Cette action est déjà annulée.'); }
      return;
    }

    try {
      const actionLower = item.action.toLowerCase();
      const relatedId = item.related_id || item.id;
      if (relatedId) {
        let entityEndpoint = '';
        if (actionLower.includes('conversion')) entityEndpoint = `/egg-conversions/${relatedId}/`;
        else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) entityEndpoint = `/sale-payments/${relatedId}/`;
        else if (actionLower.includes('vente')) entityEndpoint = `/sales/${relatedId}/`;
        else if (actionLower.includes('salaire')) entityEndpoint = `/payrolls/${relatedId}/`;
        else if (actionLower.includes('prime')) entityEndpoint = `/bonuses/${relatedId}/`;
        else if (actionLower.includes('dépense') || actionLower.includes('depense') || actionLower.includes('expense')) entityEndpoint = `/expenses/${relatedId}/`;
        else if (actionLower.includes('production') || actionLower.includes('casiers')) entityEndpoint = `/productions/${relatedId}/`;
        else if (actionLower.includes('achat aliment')) entityEndpoint = `/feed-purchases/${relatedId}/`;
        else if (actionLower.includes('préparation') || actionLower.includes('preparation')) entityEndpoint = `/feed-preparations/${relatedId}/`;
        else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) entityEndpoint = `/feeds/${relatedId}/`;
        else if (actionLower.includes('achat santé') || actionLower.includes('achat sante')) entityEndpoint = `/health-purchases/${relatedId}/`;
        else if (actionLower.includes('santé') || actionLower.includes('sante') || actionLower.includes('traitement') || actionLower.includes('soin')) entityEndpoint = `/health-records/${relatedId}/`;
        else if (actionLower.includes('mouvement') || actionLower.includes('movement')) entityEndpoint = `/movements/${relatedId}/`;

        if (entityEndpoint) {
          const res = await repositoryProvider.api.get(entityEndpoint).catch(() => null);
          const entity = res?.data;
          if (entity && (entity.status === 'ANNULEE' || entity.status === 'ANNULÉ' || entity.status === 'ANNULE')) {
            if (Platform.OS === 'web') {
              toast.error(t('common.info') || 'Info', 'Cette action a déjà été annulée.');
            } else {
              Alert.alert(t('common.info') || 'Info', 'Cette action a déjà été annulée. Impossible de modifier ou annuler à nouveau.');
            }
            return;
          }
        }
      }
    } catch { /* best-effort */ }

    Alert.alert("Options de l'action", 'Que souhaitez-vous faire ?', [
      { text: 'Fermer', style: 'cancel' },
      { text: 'Modifier', onPress: () => handleEditAction(item) },
      { text: "Annuler l'opération", style: 'destructive', onPress: () => handleCancelAction(item) },
    ]);
  };

  const toggleSortOrder = () => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  const onRefresh = () => { setRefreshing(true); fetchHistory(); };

  useEffect(() => { fetchHistory(); }, [lotId, filterPeriod]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchHistory(); });
    return unsubscribe;
  }, [navigation]);

  const getIcon = (item: any) => {
    const action = item.action;
    const module = item.module;
    if (action.includes('PREPARATION')) return 'blender';
    if (action.includes('PURCHASE') || action.includes('Achat')) return 'shopping-basket';
    switch (module) {
      case 'Production': return 'egg';
      case 'Vente': return 'shopping-cart';
      case 'Alimentation': return 'restaurant';
      case 'Santé': return 'medication';
      case 'Mouvement': return 'sync-alt';
      case 'Finance': return 'payments';
      case 'Rappel': return 'notifications';
      default: return 'history';
    }
  };

  const getIconColor = (item: any) => {
    const module = item.module;
    const action = item.action;
    if (action.includes('PURCHASE') || action.includes('Achat')) return '#2E7D32';
    if (action.includes('PREPARATION')) return '#9C27B0';
    switch (module) {
      case 'Production': return '#F9A825';
      case 'Vente': return '#43A047';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      case 'Finance': return '#607D8B';
      default: return theme.colors.primary;
    }
  };

  const S = useMemo(() => createStyles(theme), [theme]);

  const PERIODS: [typeof filterPeriod, string][] = [
    ['all', t('common.all')], ['day', t('common.day')], ['week', t('common.week')],
    ['month', t('common.month')], ['year', t('common.year')],
  ];

  return (
    <Screen
      header={
        <ScreenHeader
          title={`${t('history.title') || 'Historique'} — ${lotName}`}
          onBack={() => navigation.goBack()}
          actions={[{ icon: sortOrder === 'desc' ? 'arrow-downward' : 'arrow-upward', onPress: toggleSortOrder, tint: theme.colors.primary }]}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        {PERIODS.map(([val, label]) => (
          <Chip key={val} label={label} active={filterPeriod === val} onPress={() => setFilterPeriod(val)} />
        ))}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id.toString()}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingBottom: space.xxl, gap: space.sm }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="history" title={t('common.noData')} />}
          renderItem={({ item }) => {
            const isCancelled = item.action.toLowerCase().includes('annul') || item.action.toLowerCase().includes('suppression');
            const isWeb = Platform.OS === 'web';
            const inner = (
              <View style={{ opacity: isCancelled ? 0.6 : 1 }}>
                <Card style={S.card} padding={space.sm}>
                  <View style={[S.iconContainer, { backgroundColor: getIconColor(item) + '15' }]}>
                    <MaterialIcons name={getIcon(item) as any} size={20} color={getIconColor(item)} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={S.rowHead}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[S.type, isCancelled && S.strike]}>{getModuleLabel(item.module, item.action)} • {item.action}</Text>
                        {isCancelled && <Badge label={t('common.cancelled')} color={theme.colors.danger} />}
                      </View>
                      <Text style={S.date}>{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <View style={S.rowBody}>
                      <Text style={[S.desc, { color: theme.colors.text }, isCancelled && S.strike]}>{item.description}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 }}>
                        <MaterialIcons name="person" size={12} color={theme.colors.primary} />
                        <Text style={[S.user, { color: theme.colors.primary }]}>{item.user_name}</Text>
                      </View>
                    </View>
                  </View>
                  {userRole === 'PROPRIETAIRE' && isWeb && !isCancelled && (
                    <View style={[S.webActions, { borderLeftColor: theme.colors.border }]}>
                      <Pressable onPress={() => handleEditAction(item)} style={({ pressed }) => [S.actIcon, { opacity: pressed ? 0.6 : 1 }]} hitSlop={4}>
                        <MaterialIcons name="edit" size={18} color={theme.colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => handleCancelAction(item)} style={({ pressed }) => [S.actIcon, { opacity: pressed ? 0.6 : 1 }]} hitSlop={4}>
                        <MaterialIcons name="undo" size={18} color="#F57C00" />
                      </Pressable>
                    </View>
                  )}
                </Card>
              </View>
            );
            if (isWeb) return inner;
            return (
              <Pressable onPress={() => { if (userRole === 'PROPRIETAIRE') handleActionPress(item); }}>
                {inner}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: space.sm, alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 0, borderRadius: radius.md },
  iconContainer: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  rowBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  date: { fontSize: 10, color: theme.colors.textSecondary },
  desc: { fontSize: 14.5, fontWeight: '700', flex: 1 },
  user: { fontSize: 10, fontWeight: '600' },
  strike: { textDecorationLine: 'line-through' },
  webActions: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: 8, paddingLeft: 4 },
  actIcon: { padding: 8, marginHorizontal: 2 },
});
