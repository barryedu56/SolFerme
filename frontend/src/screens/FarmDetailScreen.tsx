import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatters';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

import { EmptyState } from '../components/EmptyState';
import { toast } from '../utils/toast';

export const FarmDetailScreen = ({ route, navigation }: any) => {
  const { farmId, farmName } = route.params;
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const { userRole } = useAuth();
  const styles = useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);

  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalBirds: 0, totalProduction: 0 });
  const [productions, setProductions] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [farm, setFarm] = useState<any>(null);

  const fetchLots = async () => {
    setLoading(true);
    try {
      const [lotsRes, prodRes, movementsRes, farmRes] = await Promise.all([
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/productions/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/movements/').catch(() => ({ data: [] })),
        repositoryProvider.api.get(`/farms/${farmId}/`).catch(() => ({ data: {} }))
      ]);

      setFarm(farmRes.data);
      const farmLots = lotsRes.data.filter((l: any) => l.farm === farmId);
      setLots(farmLots);
      setProductions(prodRes.data);
      setMovements(movementsRes.data);

      // Filtrer uniquement les lots actifs pour les statistiques opérationnelles
      const activeLots = farmLots.filter((l: any) => l.status === 'ACTIF');
      const totalBirds = activeLots.reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);

      const lotIds = activeLots.map((l: any) => l.id);
      const totalProd = prodRes.data
        .filter((p: any) => lotIds.includes(p.lot))
        .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);

      setStats({ totalBirds, totalProduction: totalProd });
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchLots();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLots();
  };

  const handleReactivate = async () => {
    try {
      await repositoryProvider.api.post(`/farms/${farmId}/reactivate/`);
      toast.success(t('common.success'), t('farms.reactivateSuccess'));
      fetchLots();
    } catch (e: any) {
      toast.error(t('common.error'), e.response?.data?.error || t('farms.reactivateError'));
    }
  };

  const calculateAge = (purchaseDate: string) => {
    const diffTime = Math.abs(new Date().getTime() - new Date(purchaseDate).getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return { value: diffDays, unit: 'days' };
    } else {
      const diffWeeks = Math.floor(diffDays / 7);
      return { value: diffWeeks, unit: 'weeks' };
    }
  };

  const getLayingRate = (lot: any) => {
    if (lot.status !== 'ACTIF' || lot.current_quantity === 0) return '0%';

    const lotProds = productions
      .filter((p: any) => p.lot === lot.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7);

    if (lotProds.length === 0) return '0%';

    const avgCasiers = lotProds.reduce((sum, p) => sum + (p.casiers_produits || 0), 0) / lotProds.length;
    const rate = (avgCasiers * 30 / lot.current_quantity) * 100;
    return `${Math.min(100, Math.round(rate))}%`;
  };

  const getPerformance = (lot: any) => {
    if (lot.status !== 'ACTIF' || lot.current_quantity === 0) return 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const lotProds = productions.filter((p: any) =>
      p.lot === lot.id &&
      new Date(p.date) >= sevenDaysAgo &&
      p.status !== 'ANNULEE'
    );

    if (lotProds.length === 0) return 0;

    const recentProductionEggs = lotProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
    const daysWithData = new Set(lotProds.map((p: any) => p.date)).size || 1;

    const lotMovements = movements.filter((m: any) => m.lot === lot.id && m.status !== 'ANNULEE');
    const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + m.quantity, 0);
    const recoveredCount = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + m.quantity, 0);
    const currentSick = Math.max(0, totalSick - recoveredCount);

    return calculatePerformance(
      lot.initial_quantity,
      lot.current_quantity,
      currentSick,
      recentProductionEggs,
      daysWithData
    );
  };

  const renderLotItem = (item: any) => (
    <Card key={item.id} style={styles.lotCard}>
      <TouchableOpacity
        onPress={() => navigation.navigate('LotDetail', { farmId, farmName, lotId: item.id, lotName: item.name })}
        activeOpacity={0.7}
      >
        <View style={styles.lotHeader}>
          <View style={styles.lotTitleContainer}>
            <View style={styles.lotIconCircle}>
              <MaterialIcons name="inventory-2" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.lotName}>{item.name}</Text>
              <Text style={styles.lotBreed}>{item.breed || 'ISA Brown'}</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
        </View>

        <View style={styles.lotStatsGrid}>
          <View style={styles.lotStatItem}>
            <MaterialIcons name="groups" size={16} color={theme.colors.textSecondary} />
            <View style={styles.lotStatTexts}>
              <Text style={styles.lotStatValue}>{formatNumber(item.current_quantity)}</Text>
              <Text style={styles.lotStatLabel}>{t('dashboard.totalBirds')}</Text>
            </View>
          </View>
          <View style={styles.lotStatItem}>
            <MaterialIcons name="speed" size={16} color={getPerformanceLabel(getPerformance(item)).color} />
            <View style={styles.lotStatTexts}>
              <Text style={[styles.lotStatValue, { color: getPerformanceLabel(getPerformance(item)).color }]}>{getPerformance(item)}%</Text>
              <Text style={styles.lotStatLabel}>{t('lots.performance')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.lotFooter}>
          <Text style={styles.lotAgeText}>
            {(() => {
              const age = calculateAge(item.purchase_date);
              return t(age.unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: age.value });
            })()}
          </Text>
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: item.status === 'ACTIF' ?
                (isDarkMode ? '#1B5E20' : '#E8F5E9') :
                item.status === 'TERMINE' ? (isDarkMode ? '#3E2723' : '#FFF3E0') :
                (isDarkMode ? '#B71C1C' : '#FFEBEE')
            }
          ]}>
            <Text style={[
              styles.statusText,
              {
                color: item.status === 'ACTIF' ?
                  (isDarkMode ? '#A5D6A7' : '#2E7D32') :
                  item.status === 'TERMINE' ? (isDarkMode ? '#FFB74D' : '#E65100') :
                  (isDarkMode ? '#EF9A9A' : '#C62828')
              }
            ]}>
              {item.status === 'ACTIF' ? t('lots.status.active') || 'Actif' :
               item.status === 'TERMINE' ? t('lots.status.finished') || 'Terminé' :
               t('lots.status.archived') || 'Archivé'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  );

  return (
    <SafeAreaWrapper style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.headerTitle}>{farmName}</Text>
            {farm?.status === 'ARCHIVE' && (
              <View style={styles.archiveBadge}>
                <Text style={styles.archiveBadgeText}>{t('profile.inactive')}</Text>
              </View>
            )}
          </View>
        </View>
        {userRole !== 'EMPLOYE' && (
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateFarm', { farm })}
            style={{ marginRight: 15 }}
          >
             <MaterialIcons name="edit" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
           <MaterialIcons name="more-vert" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          <>
            {farm?.status === 'ARCHIVE' && (
               <Card style={styles.archiveAlert}>
                  <MaterialIcons name="info-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.archiveAlertText}>
                    Cette ferme est archivée. Elle n'apparaît plus dans les statistiques globales.
                  </Text>
                  <TouchableOpacity onPress={handleReactivate} style={styles.reactivateBtn}>
                    <Text style={styles.reactivateBtnText}>Réactiver</Text>
                  </TouchableOpacity>
               </Card>
            )}
            <View style={styles.statsOverview}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>{t('farms.totalBirds')}</Text>
                <Text style={styles.overviewValue}>{formatNumber(stats.totalBirds)}</Text>
              </View>
              <View style={[styles.overviewItem, { borderLeftWidth: 0.8, borderLeftColor: theme.colors.border + '40' }]}>
                <Text style={styles.overviewLabel}>{t('farms.cumulativeProduction')}</Text>
                <Text style={styles.overviewValue}>{formatNumber(stats.totalProduction)} <Text style={{fontSize: 12}}>{t('lots.traysProduced')}</Text></Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t('farms.batchesInFarm')}</Text>

            {/* Filtre Actifs / Archivés */}
            <View style={styles.filterContainer}>
              <TouchableOpacity
                style={[styles.filterButton, !showArchived && styles.filterButtonActive]}
                onPress={() => setShowArchived(false)}
              >
                <MaterialIcons name="inventory-2" size={16} color={!showArchived ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.filterButtonText, !showArchived && styles.filterButtonTextActive]}>
                  {t('lots.status.active') || 'Actifs'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, showArchived && styles.filterButtonActive]}
                onPress={() => setShowArchived(true)}
              >
                <MaterialIcons name="archive" size={16} color={showArchived ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.filterButtonText, showArchived && styles.filterButtonTextActive]}>
                  {t('lots.status.archived') || 'Archivés'}
                </Text>
              </TouchableOpacity>
            </View>

            {lots.filter((l: any) => showArchived ? l.status === 'ARCHIVE' : l.status !== 'ARCHIVE').length > 0 ? (
              lots.filter((l: any) => showArchived ? l.status === 'ARCHIVE' : l.status !== 'ARCHIVE').map(renderLotItem)
            ) : (
              <EmptyState
                icon={showArchived ? "archive" : "warehouse"}
                title={t('common.noData')}
                description={!showArchived && userRole !== 'EMPLOYE' ? t('farms.newBatch') : undefined}
              />
            )}

            {userRole !== 'EMPLOYE' && (
              <TouchableOpacity
                style={styles.bigAddButton}
                onPress={() => navigation.navigate('CreateLot', { farmId, farmName })}
              >
                <MaterialIcons name="add" size={24} color={theme.colors.text} style={{ marginRight: 8 }} />
                <Text style={styles.bigAddButtonText}>{t('farms.newBatch')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaWrapper>
  );
};

const createStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  archiveBadge: {
    backgroundColor: theme.colors.textSecondary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  archiveBadgeText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: 'bold',
  },
  archiveAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    marginBottom: 15,
    borderRadius: 12,
  },
  archiveAlertText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 10,
  },
  reactivateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  reactivateBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statsOverview: {
    flexDirection: 'row',
    backgroundColor: isDarkMode ? 'rgba(249, 215, 96, 0.1)' : theme.colors.primary + '15',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 0.8,
    borderColor: isDarkMode ? 'rgba(249, 215, 96, 0.2)' : theme.colors.primary + '30',
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 5,
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 15,
    marginLeft: 5,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary + '15',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterButtonTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  content: {
    padding: theme.spacing.m,
  },
  lotCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  lotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  lotTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lotIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  lotName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  lotBreed: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  lotStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background + '40',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
  },
  lotStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '45%',
  },
  lotStatTexts: {
    marginLeft: 8,
  },
  lotStatLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  lotStatValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  lotFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.m,
  },
  lotAgeText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  bigAddButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    height: 50,
    borderRadius: theme.borderRadius.l,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: theme.spacing.m,
    ...theme.shadows.medium,
  },
  bigAddButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: 'bold',
  },
});