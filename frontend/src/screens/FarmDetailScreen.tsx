import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { Card } from '../components/Card';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { formatNumber } from '../utils/formatters';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

export const FarmDetailScreen = ({ route, navigation }: any) => {
  const { farmId, farmName } = route.params;
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalBirds: 0, totalProduction: 0 });
  const [productions, setProductions] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  const fetchLots = async () => {
    setLoading(true);
    try {
      const role = await AsyncStorage.getItem('user_role');
      setUserRole(role);
      const [lotsRes, prodRes, movementsRes] = await Promise.all([
        apiClient.get('/lots/'),
        apiClient.get('/productions/'),
        apiClient.get('/movements/').catch(() => ({ data: [] }))
      ]);

      const farmLots = lotsRes.data.filter((l: any) => l.farm === farmId);
      setLots(farmLots);
      setProductions(prodRes.data);
      setMovements(movementsRes.data);

      const totalBirds = farmLots.reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);

      const lotIds = farmLots.map((l: any) => l.id);
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
    const lotProds = productions.filter((p: any) => p.lot === lot.id);
    const recentProds = lotProds.filter((p: any) => {
      const pDate = new Date(p.date);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return pDate >= sevenDaysAgo;
    });

    const recentProductionEggs = recentProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
    const daysWithData = new Set(recentProds.map(p => p.date)).size || 1;

    const lotMovements = movements.filter((m: any) => m.lot === lot.id);
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
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'ACTIF' ? (theme.isDarkMode ? '#1B5E20' : '#E8F5E9') : (theme.isDarkMode ? '#B71C1C' : '#FFEBEE') }]}>
            <Text style={[styles.statusText, { color: item.status === 'ACTIF' ? (theme.isDarkMode ? '#A5D6A7' : '#2E7D32') : (theme.isDarkMode ? '#EF9A9A' : '#C62828') }]}>
              {item.status === 'ACTIF' ? t('lots.statusProduction') : t('lots.statusTerminated')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{farmName}</Text>
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
            <View style={styles.statsOverview}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>{t('farms.totalBirds')}</Text>
                <Text style={styles.overviewValue}>{formatNumber(stats.totalBirds)}</Text>
              </View>
              <View style={[styles.overviewItem, { borderLeftWidth: 1, borderLeftColor: theme.colors.border + '40' }]}>
                <Text style={styles.overviewLabel}>{t('farms.cumulativeProduction')}</Text>
                <Text style={styles.overviewValue}>{formatNumber(stats.totalProduction)} <Text style={{fontSize: 12}}>{t('lots.traysProduced')}</Text></Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t('farms.batchesInFarm')}</Text>

            {lots.map(renderLotItem)}

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
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
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
  statsOverview: {
    flexDirection: 'row',
    backgroundColor: theme.isDarkMode ? 'rgba(249, 215, 96, 0.1)' : theme.colors.primary + '15',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.isDarkMode ? 'rgba(249, 215, 96, 0.2)' : theme.colors.primary + '30',
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
  content: {
    padding: theme.spacing.m,
  },
  lotCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
