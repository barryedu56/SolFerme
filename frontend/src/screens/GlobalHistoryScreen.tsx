import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Alert, ScrollView } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { formatNumber } from '../utils/formatters';
import { isNormalEgg, isBrokenEgg } from '../utils/inventory';

export const GlobalHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userRole, userName } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  // Filtres
  const [farms, setFarms] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'month'>('all');

  const fetchLogs = async () => {
    try {
      if (!refreshing) setLoading(true);

      const queryParams = [];
      if (selectedFarm) queryParams.push(`farm=${selectedFarm}`);
      if (selectedLot) queryParams.push(`lot=${selectedLot}`);
      if (selectedType) queryParams.push(`module=${selectedType}`);
      if (filterPeriod && filterPeriod !== 'all') queryParams.push(`period=${filterPeriod}`);
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const [farmsRes, lotsRes, logsRes] = await Promise.all([
        repositoryProvider.api.get('/farms/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
        repositoryProvider.api.get(`/activity-logs/${queryString}`).catch(() => ({ data: [] })),
      ]);

      setFarms(farmsRes.data.results || farmsRes.data);
      setLots(lotsRes.data.results || lotsRes.data);

      const rawLogsRaw = logsRes.data.results || logsRes.data;
      // 🔧 Déduplication par entité : on ne garde que l'action la plus récente
      // pour une entité donnée (module + related_id).
      const sortedLogs = rawLogsRaw.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const seenGlobal = new Map<number, any>();
      for (const log of sortedLogs) {
        const existing = seenGlobal.get(log.id);
        if (!existing) {
          seenGlobal.set(log.id, log);
        } else if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
          if (log.id > 0 && existing.id < 0) {
            seenGlobal.set(log.id, log);
          }
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

          // Sanitisation pour les employés : masquer les montants dans les descriptions
          if (isEmployee && (log.module === 'Vente' || log.action.includes('Achat'))) {
            description = description ? String(description).replace(/(\d[\d\s]*\s*GNF|\d[\d\s]*\s*FG)/gi, '*** GNF') : description;
          }

          // Mappage pour l'UI
          if (log.module === 'Production') {
            title = t('actions.production');
            icon = 'egg';
            color = '#FBC02D';
          } else if (log.module === 'Vente') {
            title = t('actions.sale');
            icon = 'shopping-cart';
            color = '#4CAF50';
          } else if (log.module === 'Alimentation') {
            icon = log.action.includes('Achat') ? 'shopping-basket' : (log.action.includes('Préparation') ? 'blender' : 'restaurant');
            color = log.action.includes('Achat') ? theme.colors.success : (log.action.includes('Préparation') ? '#9C27B0' : '#03A9F4');
          } else if (log.module === 'Santé') {
            icon = log.action.includes('Achat') ? 'shopping-basket' : 'medication';
            color = log.action.includes('Achat') ? theme.colors.success : '#E91E63';
          } else if (log.module === 'Mouvement') {
            title = t('actions.movement');
            icon = 'sync-alt';
            color = '#FF5722';
          } else if (log.module === 'Finance') {
            icon = 'payments';
            color = '#607D8B';
          } else if (log.module === 'Rappel') {
            title = t('actions.reminder');
            icon = 'notifications';
          }

          return {
            ...log,
            title,
            icon,
            iconColor: color,
            details: description,
            description: description,
            // On garde la structure pour le filtrage
            farm_id: log.farm,
            lot_id: log.lot
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

    Alert.alert(
      t('common.confirm'),
      t('history.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await repositoryProvider.api.delete(`/activity-logs/${logId}/`);
              setLogs(prev => prev.filter(log => log.id !== logId));
              Alert.alert(t('common.success'), t('history.deleteSuccess'));
            } catch (error) {
              console.log('Erreur suppression log:', error);
              Alert.alert(t('common.error'), t('history.deleteError'));
            }
          }
        }
      ]
    );
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

    if (selectedFarm) {
      result = result.filter(log => log.farm_id === selectedFarm);
    }
    if (selectedLot) {
      result = result.filter(log => log.lot_id === selectedLot);
    }
    if (selectedType) {
      result = result.filter(log => log.module === selectedType);
    }

    // 🔧 Filtrage période côté client (fallback offline — le paramètre 'period'
    // ne peut pas être traduit en clause WHERE SQLite)
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
      if (startDate) {
        result = result.filter(log => {
          const logDate = new Date(log.date);
          return logDate >= startDate;
        });
      }
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
    if (action.includes('PURCHASE')) return theme.colors.success;
    if (action.includes('PREPARATION')) return '#9C27B0';
    switch (module) {
      case 'Production': return '#FBC02D';
      case 'Vente': return '#4CAF50';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      case 'Finance': return '#607D8B';
      default: return theme.colors.primary;
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedFarm, selectedLot, selectedType, filterPeriod]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchLogs();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {userRole === 'EMPLOYE' ? t('history.myActions') : t('history.globalTitle')}
        </Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Périodes */}
          <TouchableOpacity
            style={[styles.filterChip, filterPeriod === 'all' && styles.activeChip]}
            onPress={() => setFilterPeriod('all')}
          >
            <Text style={[styles.filterChipText, filterPeriod === 'all' && styles.activeChipText]}>{t('common.all')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPeriod === 'day' && styles.activeChip]}
            onPress={() => setFilterPeriod('day')}
          >
            <Text style={[styles.filterChipText, filterPeriod === 'day' && styles.activeChipText]}>{t('common.day')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPeriod === 'week' && styles.activeChip]}
            onPress={() => setFilterPeriod('week')}
          >
            <Text style={[styles.filterChipText, filterPeriod === 'week' && styles.activeChipText]}>{t('common.week')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPeriod === 'month' && styles.activeChip]}
            onPress={() => setFilterPeriod('month')}
          >
            <Text style={[styles.filterChipText, filterPeriod === 'month' && styles.activeChipText]}>{t('common.month')}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Modules */}
          {['Production', 'Alimentation', 'Santé', 'Vente', 'Finance']
            .filter(type => userRole !== 'EMPLOYE' || type !== 'Finance')
            .map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.filterChip, selectedType === type && styles.activeChip]}
                onPress={() => setSelectedType(selectedType === type ? null : type)}
              >
                <Text style={[styles.filterChipText, selectedType === type && styles.activeChipText]}>
                  {getModuleLabel(type)}
                </Text>
              </TouchableOpacity>
            ))}

          <View style={styles.divider} />

          {/* Fermes */}
          {farms.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, selectedFarm === f.id && styles.activeChip]}
              onPress={() => setSelectedFarm(selectedFarm === f.id ? null : f.id)}
            >
              <Text style={[styles.filterChipText, selectedFarm === f.id && styles.activeChipText]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={64} color={theme.colors.border} />
              <Text style={styles.emptyText}>{t('common.noData')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCancelled =
              item.action.toLowerCase().includes('annul') ||
              item.action.toLowerCase().includes('suppression');
            return (
              <TouchableOpacity
                onLongPress={() => userRole === 'PROPRIETAIRE' && handleDeleteLog(item.id)}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                <View style={{ opacity: isCancelled ? 0.6 : 1 }}>
                  <Card style={[styles.logCard, isCancelled && styles.cancelledCard]}>
                    <View style={[styles.iconContainer, { backgroundColor: getIconColor(item) + '15' }]}>
                      <MaterialIcons name={getIcon(item) as any} size={22} color={getIconColor(item)} />
                    </View>
                    <View style={styles.logContent}>
                      <View style={styles.row}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Text style={[styles.logAction, isCancelled && styles.strike]}>
                            {getModuleLabel(item.module)} • {item.action}
                          </Text>
                          {isCancelled && (
                            <View style={styles.cancelledBadge}>
                              <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.logDate}>
                          {new Date(item.date).toLocaleDateString(t('common.dateLocale'), {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>

                      <Text style={[styles.logDesc, isCancelled && styles.strike]}>{item.description}</Text>

                      <View style={styles.footerRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <MaterialIcons name="person" size={12} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
                          <Text style={styles.logUser}>{item.user_name}</Text>
                        </View>
                        {item.lot_name && (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="layers" size={12} color={theme.colors.primary} style={{ marginRight: 4 }} />
                            <Text style={styles.logLot}>{item.lot_name}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {userRole === 'PROPRIETAIRE' && (
                      <TouchableOpacity
                        onPress={() => handleDeleteLog(item.id)}
                        style={styles.deleteIconButton}
                      >
                        <MaterialIcons name="delete-outline" size={20} color={theme.colors.textSecondary + '80'} />
                      </TouchableOpacity>
                    )}
                  </Card>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, flex: 1, textAlign: 'center' },
  refreshButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  filterContainer: { paddingVertical: 8, backgroundColor: theme.colors.background },
  filterScroll: { paddingHorizontal: theme.spacing.m },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: theme.colors.surface, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border
  },
  activeChip: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText: { fontSize: 12, color: theme.colors.textSecondary },
  activeChipText: { color: '#fff', fontWeight: 'bold' },
  divider: { width: 1, height: 20, backgroundColor: theme.colors.border, alignSelf: 'center', marginHorizontal: 4, marginRight: 12 },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, opacity: 0.5 },
  emptyText: { marginTop: 10, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  logCard: {
    flexDirection: 'row', padding: theme.spacing.s, marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l, borderWidth: 0.5, borderColor: theme.colors.border,
  },
  cancelledCard: { borderColor: theme.colors.textSecondary + '40' },
  iconContainer: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.s,
  },
  logContent: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logAction: { fontSize: 13, fontWeight: 'bold', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  logDate: { fontSize: 10, color: theme.colors.textSecondary },
  logDesc: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, marginTop: 2 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  logDetails: { fontSize: 12, color: theme.colors.textSecondary, flex: 1 },
  logLot: { fontSize: 11, color: theme.colors.primary, fontWeight: '600', marginLeft: 8 },
  logUser: { fontSize: 11, color: theme.colors.textSecondary, fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  cancelledBadge: {
    marginLeft: 8, backgroundColor: theme.colors.danger + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  cancelledText: { fontSize: 9, color: theme.colors.danger, fontWeight: 'bold' },
  deleteIconButton: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
