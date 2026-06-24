import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Dimensions, useWindowDimensions, Image } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { apiClient } from '../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { syncOfflineData, getOfflineData, saveOfflineData, STORAGE_KEYS } from '../utils/offlineStorage';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

export const DashboardScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { userName, userImage, userRole } = useAuth();
  const { t, language } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    farmsCount: 0,
    lotsCount: 0,
    totalChickens: 0,
    todayProduction: 0,
    revenues: 0,
    expenses: 0,
    alertsCount: 0,
    performance: 0,
  });
  const [inventory, setInventory] = useState({
    feed: [] as any[],
    health: [] as any[],
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [period, setPeriod] = useState('Semaine');
  const periods = ['Jour', 'Semaine', 'Mois', 'Trimestre', 'Année'];
  const [rawData, setRawData] = useState<any>({ productions: [] });

  const fetchDashboardData = async () => {
    try {
      await syncOfflineData(apiClient);

      const offlineFarms = await getOfflineData(STORAGE_KEYS.FARMS);
      const offlineLots = await getOfflineData(STORAGE_KEYS.LOTS);
      const offlineFeedInv = await getOfflineData(STORAGE_KEYS.FEED_INVENTORY);
      const offlineHealthInv = await getOfflineData(STORAGE_KEYS.HEALTH_INVENTORY);

      if (offlineFarms && offlineLots) {
        processDashboardData(offlineFarms, offlineLots, [], [], [], [], [], [], [], [], [], []);
        if (offlineFeedInv || offlineHealthInv) {
          setInventory({
            feed: offlineFeedInv || [],
            health: offlineHealthInv || [],
          });
        }
        setLoading(false);
      }

      const [farmsRes, lotsRes, prodRes, salesRes, expensesRes, healthRes, remindersRes, feedsRes, logsRes, movementsRes, feedPurchasesRes, healthPurchasesRes, feedInvRes, healthInvRes] = await Promise.all([
        apiClient.get('/farms/').catch(() => ({ data: offlineFarms || [] })),
        apiClient.get('/lots/').catch(() => ({ data: offlineLots || [] })),
        apiClient.get('/productions/').catch(() => ({ data: [] })),
        apiClient.get('/sales/').catch(() => ({ data: [] })),
        apiClient.get('/expenses/').catch(() => ({ data: [] })),
        apiClient.get('/health-records/').catch(() => ({ data: [] })),
        apiClient.get('/reminders/').catch(() => ({ data: [] })),
        apiClient.get('/feeds/').catch(() => ({ data: [] })),
        apiClient.get('/activity-logs/').catch(() => ({ data: [] })),
        apiClient.get('/movements/').catch(() => ({ data: [] })),
        apiClient.get('/feed-purchases/').catch(() => ({ data: [] })),
        apiClient.get('/health-purchases/').catch(() => ({ data: [] })),
        apiClient.get('/feed-inventory/').catch(() => ({ data: offlineFeedInv || [] })),
        apiClient.get('/health-inventory/').catch(() => ({ data: offlineHealthInv || [] })),
      ]);

      await saveOfflineData(STORAGE_KEYS.FARMS, farmsRes.data);
      await saveOfflineData(STORAGE_KEYS.LOTS, lotsRes.data);
      await saveOfflineData(STORAGE_KEYS.FEED_INVENTORY, feedInvRes.data);
      await saveOfflineData(STORAGE_KEYS.HEALTH_INVENTORY, healthInvRes.data);

      setRawData({ productions: prodRes.data });
      setRecentActions(logsRes.data.slice(0, 2));
      setInventory({
        feed: feedInvRes.data,
        health: healthInvRes.data,
      });

      processDashboardData(
        farmsRes.data,
        lotsRes.data,
        prodRes.data,
        salesRes.data,
        expensesRes.data,
        healthRes.data,
        remindersRes.data,
        feedsRes.data,
        logsRes.data,
        movementsRes.data,
        feedPurchasesRes.data,
        healthPurchasesRes.data
      );

    } catch (error) {
      console.log('Erreur de chargement du dashboard', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading || !rawData.productions) return;
    updateChart(period, rawData.productions);
  }, [period, rawData.productions]);

  const updateChart = (selectedPeriod: string, productions: any[]) => {
    let chartLabels: string[] = [];
    let chartValues: number[] = [];

    const getProdForRange = (start: Date, end: Date) => {
      return (productions || [])
        .filter((p: any) => {
          const d = new Date(p.date);
          return d >= start && d <= end;
        })
        .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
    };

    if (selectedPeriod === 'Jour') {
      chartLabels = ['Matin', 'Midi', 'Soir'];
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);
      chartValues = [getProdForRange(start, end), 0, 0];
    } else if (selectedPeriod === 'Semaine') {
      const days = language === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      chartLabels = last7Days.map(d => days[d.getDay()]);
      chartValues = last7Days.map(d => {
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        return getProdForRange(start, end);
      });
    } else if (selectedPeriod === 'Mois') {
      chartLabels = ['S1', 'S2', 'S3', 'S4'];
      chartValues = Array.from({ length: 4 }, (_, i) => {
        const start = new Date(); start.setDate(start.getDate() - (28 - i * 7));
        const end = new Date(start); end.setDate(end.getDate() + 7);
        return getProdForRange(start, end);
      });
    } else if (selectedPeriod === 'Trimestre') {
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      const last3Months = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() - (2 - i));
        return d;
      });
      chartLabels = last3Months.map(d => monthNames[d.getMonth()]);
      chartValues = last3Months.map(d => {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return getProdForRange(start, end);
      });
    } else {
      chartLabels = ['T1', 'T2', 'T3', 'T4'];
      const year = new Date().getFullYear();
      chartValues = [0, 1, 2, 3].map(q => {
        const start = new Date(year, q * 3, 1);
        const end = new Date(year, q * 3 + 3, 0, 23, 59, 59);
        return getProdForRange(start, end);
      });
    }

    const hasData = chartValues.some(v => v !== 0);
    setChartData({
      labels: chartLabels,
      datasets: [{ data: hasData ? chartValues : [0, 0, 0, 0, 0] }],
      isPlaceholder: !hasData
    });
  };

  const processDashboardData = (farms: any, lots: any, productions: any, sales: any, expenses: any, health: any, allReminders: any, feeds: any, logs: any, movements: any, feedPurchases: any, healthPurchases: any) => {
    const upcomingReminders = (allReminders || [])
      .filter((r: any) => r.status === 'PENDING')
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);

    setReminders(upcomingReminders);

    const totalChickens = (lots || [])
      .filter((lot: any) => lot.status === 'EN_PRODUCTION')
      .reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayProduction = (productions || [])
      .filter((p: any) => {
        const prodDate = new Date(p.date);
        prodDate.setHours(0, 0, 0, 0);
        return prodDate.getTime() === today.getTime();
      })
      .reduce((sum: number, p: any) => sum + (p.casiers_vendables || 0) + ((p.oeufs_casses || 0) / 30), 0);

    const revenues = (sales || []).reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);

    const expenseAmount = (expenses || []).reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0);
    const lotInvestment = (lots || []).reduce((sum: number, l: any) => sum + parseFloat(l.purchase_price || 0), 0);
    const feedPurchaseCost = (feedPurchases || []).reduce((sum: number, f: any) => sum + parseFloat(f.total_price || 0), 0);
    const healthPurchaseCost = (healthPurchases || []).reduce((sum: number, h: any) => sum + parseFloat(h.total_price || 0), 0);

    const totalExpenses = expenseAmount + lotInvestment + feedPurchaseCost + healthPurchaseCost;

    const healthAlerts = (health || []).filter((h: any) => {
        const recordDate = new Date(h.date);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return recordDate >= sevenDaysAgo;
    });

    const movementAlerts = (movements || []).filter((m: any) => {
        const mDate = new Date(m.date);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const type = m.type ? m.type.toUpperCase() : '';
        const isAlert =
            type === 'MORT' || type === 'MORTALITÉ' ||
            type === 'MALADE' ||
            m.type === 'Mortalité' || m.type === 'Malade' ||
            m.type === 'Perte' ||
            (m.reason && (m.reason.toLowerCase().includes('mort') || m.reason.toLowerCase().includes('malad')));
        return isAlert && mDate >= threeDaysAgo;
    });

    // Performance globale pour le dashboard
    const activeLots = (lots || []).filter((l: any) => l.status === 'EN_PRODUCTION');
    let avgPerf = 0;
    if (activeLots.length > 0) {
      let totalPerf = 0;
      activeLots.forEach((lot: any) => {
        const lotProds = (productions || []).filter((p: any) => p.lot === lot.id);
        const recentProds = lotProds.filter((p: any) => {
          const pDate = new Date(p.date);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return pDate >= sevenDaysAgo;
        });
        const recentEggs = recentProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
        const daysWithData = new Set(recentProds.map(p => p.date)).size || 1;

        const lotMovements = (movements || []).filter((m: any) => m.lot === lot.id);
        const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + m.quantity, 0);
        const recovered = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + m.quantity, 0);
        const currentSick = Math.max(0, totalSick - recovered);

        totalPerf += calculatePerformance(
          lot.initial_quantity,
          lot.current_quantity,
          currentSick,
          recentEggs,
          daysWithData
        );
      });
      avgPerf = Math.round(totalPerf / activeLots.length);
    }

    setStats({
      farmsCount: (farms || []).length,
      lotsCount: (lots || []).length,
      totalChickens,
      todayProduction,
      revenues,
      expenses: totalExpenses,
      alertsCount: healthAlerts.length + movementAlerts.length,
      performance: avgPerf,
    });

    updateChart(period, productions);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const styles = createStyles(theme, isTablet);

  if (loading) {
    const getLogIcon = (module: string) => {
    switch (module) {
      case 'Production': return 'egg';
      case 'Vente': return 'shopping-cart';
      case 'Alimentation': return 'restaurant';
      case 'Santé': return 'medication';
      case 'Mouvement': return 'sync-alt';
      case 'Rappel': return 'notifications';
      default: return 'history';
    }
  };

  const getLogColor = (module: string) => {
    switch (module) {
      case 'Production': return '#FBC02D';
      case 'Vente': return '#4CAF50';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      default: return theme.colors.primary;
    }
  };

  return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const getLogIcon = (module: string) => {
    switch (module) {
      case 'Production': return 'egg';
      case 'Vente': return 'shopping-cart';
      case 'Alimentation': return 'restaurant';
      case 'Santé': return 'medication';
      case 'Mouvement': return 'sync-alt';
      case 'Rappel': return 'notifications';
      default: return 'history';
    }
  };

  const getLogColor = (module: string) => {
    switch (module) {
      case 'Production': return '#FBC02D';
      case 'Vente': return '#4CAF50';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      default: return theme.colors.primary;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Bonjour, {userName}!</Text>
          <Text style={styles.subWelcomeText}>{t('dashboard.recentActivities')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.avatarContainer}>
           {userImage ? (
             <Image source={{ uri: userImage }} style={styles.avatarImage} />
           ) : (
             <MaterialIcons name="account-circle" size={32} color={theme.colors.primary} />
           )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {stats.alertsCount > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => navigation.navigate('GlobalHistory')}
          >
            <View style={styles.alertBannerLeft}>
              <MaterialIcons name="warning" size={24} color="#FFF" />
              <View style={styles.alertBannerTextContainer}>
                <Text style={styles.alertBannerTitle}>Alertes Santé ({stats.alertsCount})</Text>
                <Text style={styles.alertBannerSub}>Mortalité ou maladies détectées récemment</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Statistics')}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>Performance</Text>
               <MaterialIcons name="speed" size={20} color={getPerformanceLabel(stats.performance).color} />
            </View>
            <Text style={[styles.statValue, { color: getPerformanceLabel(stats.performance).color }]}>{stats.performance}%</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Fermes', { screen: 'FarmsList' })}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>{t('dashboard.totalBirds')}</Text>
               <MaterialIcons name="egg" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{stats.totalChickens}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Statistics')}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>{t('dashboard.dailyProduction')}</Text>
               <MaterialIcons name="egg" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{formatNumber(stats.todayProduction)} cas.</Text>
          </TouchableOpacity>

          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Finance')}
            >
              <View style={styles.statHeader}>
                 <Text style={styles.statLabel}>{t('dashboard.finance')}</Text>
                 <MaterialIcons name="account-balance-wallet" size={20} color={theme.colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: stats.revenues - stats.expenses >= 0 ? theme.colors.success : theme.colors.danger }]}>
                  {formatCurrency(stats.revenues - stats.expenses)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Statistics')}>
          <Card style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Production (casiers)</Text>
            <View style={styles.periodSelectorContainer}>
              <View style={styles.periodSelector}>
                {periods.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodItem, period === p && styles.periodActive]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={period === p ? styles.periodTextActive : styles.periodText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {chartData ? (
              <BarChart
                data={chartData}
                width={Dimensions.get('window').width - theme.spacing.m * 4}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: theme.colors.surface,
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(249, 215, 96, ${opacity})`,
                  labelColor: (opacity = 1) => theme.colors.text,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "6", strokeWidth: "2", stroke: theme.colors.primary }
                }}
                verticalLabelRotation={0}
                style={{ marginVertical: 8, borderRadius: 16 }}
                fromZero
                showValuesOnTopOfBars
              />
            ) : (
              <ActivityIndicator color={theme.colors.primary} />
            )}
          </Card>
        </TouchableOpacity>

        {recentActions.length > 0 && (
          <View style={styles.recentActionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Dernières activités</Text>
              <TouchableOpacity onPress={() => navigation.navigate('GlobalHistory')}>
                <Text style={styles.seeAllText}>Tout voir</Text>
              </TouchableOpacity>
            </View>
            {recentActions.map((log) => (
              <TouchableOpacity key={log.id} onPress={() => navigation.navigate('GlobalHistory')}>
                <Card style={styles.logCard}>
                  <View style={[styles.logIconBox, { backgroundColor: getLogColor(log.module) + '15' }]}>
                    <MaterialIcons name={getLogIcon(log.module) as any} size={20} color={getLogColor(log.module)} />
                  </View>
                  <View style={styles.logInfo}>
                    <Text style={styles.logAction}>{log.action}</Text>
                    <Text style={styles.logDesc} numberOfLines={1}>{log.description}</Text>
                    <View style={styles.logFooter}>
                       <Text style={styles.logUser}><MaterialIcons name="person" size={10} /> {log.user_name}</Text>
                       <Text style={styles.logDate}>{new Date(log.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {reminders.length > 0 && (
          <View style={styles.remindersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Rappels prioritaires</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Reminders')}>
                 <Text style={styles.seeAllText}>Mes rappels</Text>
              </TouchableOpacity>
            </View>
            {reminders.map((reminder) => (
              <TouchableOpacity key={reminder.id} onPress={() => navigation.navigate('Reminders')}>
                <Card style={styles.reminderItem}>
                  <View style={[styles.reminderIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="event-note" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderTitle}>{reminder.title}</Text>
                    <Text style={styles.reminderDate}>
                      {new Date(reminder.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, { borderColor: theme.colors.primary + '40' }]}>
                    <Text style={[styles.typeText, { color: theme.colors.primary }]}>{reminder.type}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}


        {userRole !== 'EMPLOYE' && (inventory.feed.length > 0 || inventory.health.length > 0) && (
          <View style={styles.inventorySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>État des Stocks</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Purchase', { type: 'feed' })}>
                <Text style={styles.seeAllText}>Approvisionner</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inventoryScroll}>
              {inventory.feed.map((item: any) => (
                <Card key={`feed-${item.id}`} style={styles.inventoryCard}>
                  <MaterialCommunityIcons name="food-apple" size={24} color={theme.colors.primary} />
                  <Text style={styles.inventoryName} numberOfLines={1}>{item.feed_type}</Text>
                  <Text style={[styles.inventoryValue, item.quantity_kg < 50 && { color: theme.colors.danger }]}>
                    {formatNumber(item.quantity_kg)} kg
                  </Text>
                  <Text style={styles.inventoryFarm}>{item.farm_name}</Text>
                </Card>
              ))}
              {inventory.health.map((item: any) => (
                <Card key={`health-${item.id}`} style={styles.inventoryCard}>
                  <MaterialIcons name="medical-services" size={24} color="#E91E63" />
                  <Text style={styles.inventoryName} numberOfLines={1}>{item.product_name}</Text>
                  <Text style={[styles.inventoryValue, item.quantity < 5 && { color: theme.colors.danger }]}>
                    {formatNumber(item.quantity)} u.
                  </Text>
                  <Text style={styles.inventoryFarm}>{item.farm_name}</Text>
                </Card>
              ))}
            </ScrollView>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.s,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  welcomeText: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  subWelcomeText: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 2 },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    ...theme.shadows.light,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#D32F2F',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.m,
    ...theme.shadows.medium,
  },
  alertBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertBannerTextContainer: {
    marginLeft: theme.spacing.m,
  },
  alertBannerTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  alertBannerSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  scroll: {
    padding: theme.spacing.m,
    paddingBottom: 40,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s,
  },
  statCard: {
    width: isTablet ? '23.5%' : '48%',
    padding: theme.spacing.m,
    height: 100,
    justifyContent: 'space-between',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
    marginBottom: theme.spacing.m
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  chartHeader: {
    marginBottom: 10,
  },
  periodSelectorContainer: {
    marginBottom: 15,
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#000000',
    width: '100%',
    justifyContent: 'space-between',
  },
  periodItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: '#000000',
  },
  periodText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  periodTextActive: {
    fontSize: 11,
    color: '#000000',
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s,
  },
  seeAllText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  chartCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.medium,
  },
  recentActionsSection: {
    marginTop: theme.spacing.l,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
    backgroundColor: theme.colors.surface,
  },
  logIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  logInfo: {
    flex: 1,
  },
  logAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  logDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginVertical: 2,
  },
  logFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  logDate: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  logUser: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  alertsSection: {
    marginTop: theme.spacing.l,
  },
  alertsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: theme.spacing.s,
  },
  alertBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
    ...theme.shadows.light,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#000000',
  },
  remindersSection: {
    marginTop: theme.spacing.l,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: '#000000',
  },
  reminderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
    borderWidth: 1,
    borderColor: '#000000',
  },
  reminderInfo: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  reminderDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
  },
  badgeDot: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  inventorySection: {
    marginTop: theme.spacing.l,
    marginBottom: theme.spacing.xl,
  },
  inventoryScroll: {
    flexDirection: 'row',
    marginTop: theme.spacing.s,
  },
  inventoryCard: {
    width: 140,
    marginRight: theme.spacing.m,
    padding: theme.spacing.m,
    alignItems: 'center',
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: theme.colors.surface,
  },
  inventoryName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  inventoryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.primary,
    marginVertical: 4,
  },
  inventoryFarm: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  }
});
