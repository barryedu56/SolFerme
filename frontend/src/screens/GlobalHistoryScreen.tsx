import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, RefreshControl, Alert, ScrollView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { Screen, ScreenHeader, useContentWidth, Card, Chip, Badge, EmptyState, space, radius } from '../components/ui';

export const GlobalHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userRole } = useAuth();
  const { t } = useTranslation();
  const contentW = useContentWidth('narrow');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const [farms, setFarms] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'month'>('all');

  // On charge TOUT le journal une seule fois (au montage / focus / pull-to-refresh)
  // et les filtres (ferme, lot, module, période) sont appliqués côté client via
  // `filteredLogs` ci-dessous — instantané, sans aller-retour réseau à chaque clic.
  const fetchLogs = async () => {
    try {
      if (!refreshing) setLoading(true);

      const [farmsRes, lotsRes, logsRes] = await Promise.all([
        repositoryProvider.api.get('/farms/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/activity-logs/').catch(() => ({ data: [] })),
      ]);

      setFarms(farmsRes.data.results || farmsRes.data);
      setLots(lotsRes.data.results || lotsRes.data);

      const rawLogsRaw = logsRes.data.results || logsRes.data;
      const seenGlobal = new Map<number, any>();
      for (const log of rawLogsRaw) {
        const existing = seenGlobal.get(log.id);
        if (!existing) {
          seenGlobal.set(log.id, log);
        } else if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
          if (log.id > 0 && existing.id < 0) seenGlobal.set(log.id, log);
        }
      }
      const rawLogs = Array.from(seenGlobal.values());
      const isEmployee = userRole === 'EMPLOYE';

      const combinedLogs = rawLogs
        .filter((log: any) => !isEmployee || log.module !== 'Finance')
        .map((log: any) => {
          let title = log.action;
          let icon: any = 'history';
          let color = theme.colors.primary;
          let description = log.description;

          if (isEmployee && (log.module === 'Vente' || log.action.includes('Achat'))) {
            description = description ? String(description).replace(/(\d[\d\s]*\s*GNF|\d[\d\s]*\s*FG)/gi, '*** GNF') : description;
          }

          if (log.module === 'Production') {
            title = t('actions.production'); icon = 'egg'; color = '#F9A825';
          } else if (log.module === 'Vente') {
            title = t('actions.sale'); icon = 'shopping-cart'; color = '#43A047';
          } else if (log.module === 'Alimentation') {
            icon = log.action.includes('Achat') ? 'shopping-basket' : (log.action.includes('Préparation') ? 'blender' : 'restaurant');
            color = log.action.includes('Achat') ? '#2E7D32' : (log.action.includes('Préparation') ? '#9C27B0' : '#03A9F4');
          } else if (log.module === 'Santé') {
            icon = log.action.includes('Achat') ? 'shopping-basket' : 'medication';
            color = log.action.includes('Achat') ? '#2E7D32' : '#E91E63';
          } else if (log.module === 'Mouvement') {
            title = t('actions.movement'); icon = 'sync-alt'; color = '#FF5722';
          } else if (log.module === 'Finance') {
            icon = 'payments'; color = '#607D8B';
          } else if (log.module === 'Rappel') {
            title = t('actions.reminder'); icon = 'notifications';
          }

          return {
            ...log, title, icon, iconColor: color, details: description, description,
            farm_id: log.farm, lot_id: log.lot,
          };
        });

      setLogs(combinedLogs);
    } catch (error) {
      console.log('Erreur historique global:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteLog = (logId: number) => {
    if (userRole !== 'PROPRIETAIRE') return;
    const executeDelete = async () => {
      try {
        await repositoryProvider.api.delete(`/activity-logs/${logId}/`);
        setLogs((prev) => prev.filter((log) => log.id !== logId));
        Alert.alert(t('common.success'), t('history.deleteSuccess'));
      } catch (error) {
        console.log('Erreur suppression log:', error);
        Alert.alert(t('common.error'), t('history.deleteError'));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('history.deleteConfirm'))) executeDelete();
      return;
    }
    Alert.alert(t('common.confirm'), t('history.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: executeDelete },
    ]);
  };

  const getModuleLabel = (module: string) => {
    switch (module) {
      case 'Production': return t('actions.production');
      case 'Vente': return t('actions.sale');
      case 'Alimentation': return t('actions.nutrition') || 'Alimentation';
      case 'Santé': return t('actions.health') || 'Santé';
      case 'Mouvement': return t('actions.movement');
      case 'Finance': return t('actions.finance') || 'Finance';
      case 'Rappel': return t('actions.reminder');
      default: return module;
    }
  };

  const filteredLogs = useMemo(() => {
    let result = [...logs];
    if (selectedFarm) result = result.filter((log) => log.farm_id === selectedFarm);
    if (selectedLot) result = result.filter((log) => log.lot_id === selectedLot);
    if (selectedType) result = result.filter((log) => log.module === selectedType);
    if (filterPeriod && filterPeriod !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startDate = (() => {
        switch (filterPeriod) {
          case 'day': return todayStart;
          case 'week': return new Date(todayStart.getTime() - 7 * 86400000);
          case 'month': return new Date(todayStart.getTime() - 30 * 86400000);
          default: return null;
        }
      })();
      if (startDate) result = result.filter((log) => new Date(log.date) >= startDate);
    }
    return result;
  }, [logs, selectedFarm, selectedLot, selectedType, filterPeriod]);

  const getIcon = (item: any) => {
    const action = item.action;
    const module = item.module;
    if (action.includes('PREPARATION')) return 'blender';
    if (action.includes('PURCHASE')) return 'shopping-basket';
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
    if (action.includes('PURCHASE')) return '#2E7D32';
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

  useEffect(() => { fetchLogs(); }, []);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchLogs(); });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchLogs(); };

  const S = useMemo(() => createStyles(theme), [theme]);

  const PERIODS: ['all' | 'day' | 'week' | 'month', string][] = [
    ['all', t('common.all')], ['day', t('common.day')], ['week', t('common.week')], ['month', t('common.month')],
  ];
  const MODULES = ['Production', 'Alimentation', 'Santé', 'Vente', 'Finance'].filter((type) => userRole !== 'EMPLOYE' || type !== 'Finance');

  return (
    <Screen
      header={
        <ScreenHeader
          title={userRole === 'EMPLOYE' ? t('history.myActions') : t('history.globalTitle')}
          onBack={() => navigation.goBack()}
          actions={[{ icon: 'refresh', onPress: onRefresh, tint: theme.colors.primary }]}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        {PERIODS.map(([val, label]) => (
          <Chip key={val} label={label} active={filterPeriod === val} onPress={() => setFilterPeriod(val)} />
        ))}
        <View style={[S.sep, { backgroundColor: theme.colors.border }]} />
        {MODULES.map((type) => (
          <Chip key={type} label={getModuleLabel(type)} active={selectedType === type} onPress={() => setSelectedType(selectedType === type ? null : type)} />
        ))}
        {farms.length > 0 && <View style={[S.sep, { backgroundColor: theme.colors.border }]} />}
        {farms.map((f) => (
          <Chip key={f.id} label={f.name} active={selectedFarm === f.id} onPress={() => setSelectedFarm(selectedFarm === f.id ? null : f.id)} />
        ))}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => String(item.id)}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingBottom: space.xxl, gap: space.sm }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="history" title={t('common.noData')} />}
          renderItem={({ item }) => {
            const isCancelled = item.action.toLowerCase().includes('annul') || item.action.toLowerCase().includes('suppression');
            return (
              <View style={{ opacity: isCancelled ? 0.6 : 1 }}>
                <Card style={S.logCard} padding={space.sm}>
                  <View style={[S.iconContainer, { backgroundColor: getIconColor(item) + '15' }]}>
                    <MaterialIcons name={getIcon(item) as any} size={20} color={getIconColor(item)} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={S.row}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[S.logAction, isCancelled && S.strike]}>{getModuleLabel(item.module)} • {item.action}</Text>
                        {isCancelled && <Badge label={t('common.cancelled')} color={theme.colors.danger} />}
                      </View>
                      <Text style={S.logDate}>
                        {new Date(item.date).toLocaleDateString(t('common.dateLocale'), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={[S.logDesc, { color: theme.colors.text }, isCancelled && S.strike]}>{item.description}</Text>
                    <View style={S.footerRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialIcons name="person" size={12} color={theme.colors.textSecondary} />
                        <Text style={S.logUser}>{item.user_name}</Text>
                      </View>
                      {item.lot_name && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialIcons name="layers" size={12} color={theme.colors.primary} />
                          <Text style={[S.logLot, { color: theme.colors.primary }]}>{item.lot_name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {userRole === 'PROPRIETAIRE' && (
                    <Pressable onPress={() => handleDeleteLog(item.id)} style={({ pressed }) => [S.deleteBtn, { opacity: pressed ? 0.6 : 1 }]} hitSlop={6}>
                      <MaterialIcons name="delete-outline" size={19} color={theme.colors.danger + '99'} />
                    </Pressable>
                  )}
                </Card>
              </View>
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
  sep: { width: 1, height: 20, marginHorizontal: 4 },
  logCard: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 0, borderRadius: radius.md },
  iconContainer: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  logAction: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  logDate: { fontSize: 10, color: theme.colors.textSecondary },
  logDesc: { fontSize: 14.5, fontWeight: '700', marginTop: 2 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  logLot: { fontSize: 11, fontWeight: '600' },
  logUser: { fontSize: 11, color: theme.colors.textSecondary, fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  deleteBtn: { paddingLeft: 4, justifyContent: 'center', alignItems: 'center' },
});
