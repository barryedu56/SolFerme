import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Dimensions, useWindowDimensions, Image, Platform } from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { syncManager } from '../utils/syncManager';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

import { useBreakpoint } from '../hooks/useBreakpoint';

export const DashboardScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { userName, userImage, userRole } = useAuth();
  const { t, language } = useTranslation();
  const { isDesktop, isTablet } = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    farmsCount: 0,
    lotsCount: 0,
    totalChickens: 0,
    todayProduction: 0,
    revenues: 0,
    encaissements: 0,
    creances: 0,
    expenses: 0,
    alertsCount: 0,
    performance: 0,
    totalBonuses: 0,
    employeesWithBonuses: 0,
    pendingRequests: 0,
  });
  const [inventory, setInventory] = useState({
    raw: [] as any[],
    prepared: [] as any[],
    health: [] as any[],
  });
  const [selectedFarm, setSelectedFarm] = useState<number | 'ALL'>('ALL');
  const [selectedLot, setSelectedLot] = useState<number | 'ALL'>('ALL');
  const { userFarms } = useAuth() as any;
  const [period, setPeriod] = useState('week');
  const [chartData, setChartData] = useState<any>(null);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [healthAlerts, setHealthAlerts] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [activeLotId, setActiveLotId] = useState<number | null>(null);

  const periods = useMemo(() => [
    { key: 'day', label: t('common.day') },
    { key: 'week', label: t('common.week') },
    { key: 'month', label: t('common.month') },
    { key: 'year', label: t('common.year') },
  ], [t]);

  const updateChart = (selectedPeriod: string, productionData: any[]) => {
    processChartData({ production: productionData }, selectedPeriod);
  };

  const currentFarmLots = useMemo(() => {
    if (selectedFarm === 'ALL') return [];
    return userFarms?.find((f: any) => f.id === selectedFarm)?.lots || [];
  }, [selectedFarm, userFarms]);

  const fetchDashboardData = async () => {
    try {
      // syncAll() est appelé séparément par le focus listener — pas ici
      // pour éviter de doubler chaque appel API.

      const params: any = {
        period: period
      };
      if (selectedFarm !== 'ALL') params.farm = selectedFarm;
      if (selectedLot !== 'ALL') params.lot = selectedLot;

      const emptyFarmStats = {
        summary: {
          farms_count: 0, lots_count: 0, total_chickens: 0,
          today_production: 0, revenues: 0, expenses: 0,
          alerts_count: 0, performance: 0,
          total_bonuses: 0, employees_with_bonuses: 0,
        },
      };
      const statsRes = await repositoryProvider.api.get('/farms/statistics/', { params }).catch(() => ({ data: emptyFarmStats }));
      const backendSummary = statsRes.data.summary;

      const invParams: any = selectedFarm !== 'ALL' ? { farm: selectedFarm } : {};
      if (selectedLot !== 'ALL') invParams.lot = selectedLot;
      const alertParams: any = selectedFarm !== 'ALL' ? { farm: selectedFarm } : {};
      if (selectedLot !== 'ALL') alertParams.lot = selectedLot;

      const [remindersRes, logsRes, rawInvRes, prepInvRes, healthInvRes, alertsRes, requestsRes] = await Promise.all([
        repositoryProvider.api.get('/reminders/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/activity-logs/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/feed-inventory/', { params: invParams }).catch(() => ({ data: [] })),
        repositoryProvider.api.get('/prepared-feed-inventory/', { params: invParams }).catch(() => ({ data: [] })),
        repositoryProvider.api.get('/health-inventory/', { params: invParams }).catch(() => ({ data: [] })),
        repositoryProvider.api.get('/health-alerts/', { params: alertParams }).catch(() => ({ data: [] })),
        repositoryProvider.api.get('/employee-requests/').catch(() => ({ data: [] })),
      ]);

      const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];
      const pendingRequestsCount = requests.filter((r: any) => r.status === 'PENDING').length;

      const isEmployee = userRole === 'EMPLOYE';

      setStats({
        farmsCount: backendSummary.farms_count,
        lotsCount: backendSummary.lots_count,
        totalChickens: backendSummary.total_chickens,
        todayProduction: backendSummary.today_production,
        revenues: isEmployee ? 0 : backendSummary.revenues,
        encaissements: isEmployee ? 0 : (backendSummary.encaissements || 0),
        creances: isEmployee ? 0 : (backendSummary.creances || 0),
        expenses: isEmployee ? 0 : backendSummary.expenses,
        alertsCount: backendSummary.alerts_count,
        performance: backendSummary.performance,
        totalBonuses: isEmployee ? 0 : (backendSummary.total_bonuses || 0),
        employeesWithBonuses: isEmployee ? 0 : (backendSummary.employees_with_bonuses || 0),
        pendingRequests: pendingRequestsCount,
      });

      const logs = Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data?.results || []);

      // Sanitisation des logs pour les employés : masquer les montants financiers dans les descriptions
      const sanitizedLogs = logs.map((log: any) => {
        if (isEmployee && (log.module === 'Vente' || log.module === 'Finance' || log.action.includes('Achat'))) {
          return {
            ...log,
            description: log.description ? String(log.description).replace(/(\d[\d\s]*\s*GNF|\d[\d\s]*\s*FG)/gi, '*** GNF') : log.description
          };
        }
        return log;
      });

      setRecentActions(sanitizedLogs.slice(0, 2));

      // Filter for PENDING requests on dashboard
      const dashboardRequests = requests.filter((r: any) => r.status === 'PENDING').slice(0, 2);
      // If we want to show some requests even if none are pending (less likely based on instructions)
      // we'd stick to slice(0,2), but "filtrage intelligent... pour ne garder que celles nécessitant une action"
      // suggests PENDING only.

      let alertsData = Array.isArray(alertsRes.data) ? alertsRes.data : (alertsRes.data?.results || []);
      setHealthAlerts(alertsData.filter((a: any) => !a.is_viewed));

      setInventory({
        raw: rawInvRes.data,
        prepared: prepInvRes.data,
        health: healthInvRes.data,
      });

      const upcomingReminders = (remindersRes.data || [])
        .filter((r: any) => r.status === 'PENDING')
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);
      setReminders(upcomingReminders);

      const backendCharts = statsRes.data.charts;
      processChartData(backendCharts, period);

    } catch (error) {
      console.log('Erreur de chargement du dashboard', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processChartData = (charts: any, selectedPeriod: string) => {
    if (!charts || !charts.production) return;

    let chartLabels: string[] = [];
    let chartValues: number[] = [];

    const data = charts.production;

    if (selectedPeriod === 'day') {
        chartLabels = [t('dashboard.chartLabels.morning'), t('dashboard.chartLabels.midday'), t('dashboard.chartLabels.evening')];
        const matin = data.find((d: any) => d.label === 'Matin')?.value || 0;
        const midi = data.find((d: any) => d.label === 'Midi')?.value || 0;
        const soir = data.find((d: any) => d.label === 'Soir')?.value || 0;
        chartValues = [matin, midi, soir];
    } else {
        chartLabels = data.map((d: any) => {
            const date = new Date(d.day);
            if (selectedPeriod === 'week') {
                const days = [t('days.sun'), t('days.mon'), t('days.tue'), t('days.wed'), t('days.thu'), t('days.fri'), t('days.sat')];
                return days[date.getDay()];
            } else if (selectedPeriod === 'month') {
                return date.getDate().toString();
            } else if (selectedPeriod === 'year') {
                const months = [t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'), t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'), t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec')];
                return months[date.getMonth()];
            }
            return d.day;
        });
        chartValues = data.map((d: any) => d.value);
    }

    const hasData = chartValues.some(v => v !== 0);
    setChartData({
      labels: chartLabels.length > 0 ? chartLabels : [''],
      datasets: [{ data: hasData ? chartValues : [0] }],
      isPlaceholder: !hasData
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, [period, selectedFarm, selectedLot]);

  // 🔄 Au focus (sauf montage initial) : sync puis recharge les données
  // Le focus initial est déjà couvert par l'effet [period, farm, lot]
  const firstFocusRef = useRef(true);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return; // Ignorer le focus initial (montage) — le 2e useEffect gère le chargement
      }
      syncManager.syncAll().catch(() => {}).finally(() => fetchDashboardData());
    });
    return unsubscribe;
  }, [navigation, period, selectedFarm, selectedLot]);


  const processDashboardData = (farms: any, lots: any, productions: any, sales: any, expenses: any, health: any, allReminders: any, feeds: any, logs: any, movements: any, feedPurchases: any, healthPurchases: any, allAlerts: any) => {
    const upcomingReminders = (allReminders || [])
      .filter((r: any) => r.status === 'PENDING')
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);

    setReminders(upcomingReminders);

    const activeProductions = (productions || []).filter((p: any) => p.status === 'ACTIF');
    const activeSales = (sales || []).filter((s: any) => s.status === 'ACTIF');
    const activeMovements = (movements || []).filter((m: any) => m.status === 'ACTIF');
    const activeExpenses = (expenses || []).filter((e: any) => e.status === 'ACTIF');
    const activeFeedPurchases = (feedPurchases || []).filter((fp: any) => fp.status === 'ACTIF');
    const activeHealthPurchases = (healthPurchases || []).filter((hp: any) => hp.status === 'ACTIF');

    const totalChickens = (lots || [])
      .filter((lot: any) => lot.status === 'EN_PRODUCTION')
      .reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayProduction = activeProductions
      .filter((p: any) => p.date === todayStr)
      .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);

    const revenues = activeSales
      .reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);

    const expenseAmount = activeExpenses
      .reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0);

    const lotInvestment = (lots || [])
      .filter((l: any) => l.status !== 'ANNULEE')
      .reduce((sum: number, l: any) => sum + parseFloat(l.purchase_price || 0), 0);

    const feedPurchaseCost = activeFeedPurchases
      .reduce((sum: number, f: any) => sum + parseFloat(f.total_price || 0), 0);

    const healthPurchaseCost = activeHealthPurchases
      .reduce((sum: number, h: any) => sum + parseFloat(h.total_price || 0), 0);

    const totalExpenses = expenseAmount + lotInvestment + feedPurchaseCost + healthPurchaseCost;

    const activeAlertsCount = (allAlerts || []).filter((a: any) => !a.is_viewed).length;

    const activeLots = (lots || []).filter((l: any) => l.status === 'EN_PRODUCTION');
    if (activeLots.length > 0) {
      setActiveLotId(activeLots[0].id);
    }

    let avgPerf = 0;
    if (activeLots.length > 0) {
      let totalPerf = 0;
      let lotsWithData = 0;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setHours(0, 0, 0, 0);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      activeLots.forEach((lot: any) => {
        const lotProds = activeProductions.filter((p: any) => p.lot === lot.id);
        const recentProds = lotProds.filter((p: any) => {
          const pDate = new Date(p.date);
          return pDate >= sevenDaysAgo;
        });
        const recentEggs = recentProds.reduce((sum: number, p: any) => sum + ((p.casiers_produits || 0) * 30), 0);
        const daysWithData = new Set(recentProds.map((p: any) => p.date)).size || 1;

        const lotMovements = activeMovements.filter((m: any) => m.lot === lot.id);
        const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
        const recovered = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
        const currentSick = Math.max(0, totalSick - recovered);

        const perf = calculatePerformance(
          lot.initial_quantity || 0,
          lot.current_quantity || 0,
          currentSick,
          recentEggs,
          daysWithData
        );

        if (perf > 0 || recentProds.length > 0) {
          totalPerf += perf;
          lotsWithData++;
        }
      });
      avgPerf = lotsWithData > 0 ? Math.round(totalPerf / lotsWithData) : 0;
    }

    setStats({
      farmsCount: (farms || []).length,
      lotsCount: (lots || []).length,
      totalChickens,
      todayProduction,
      revenues,
      encaissements: 0,
      creances: 0,
      expenses: totalExpenses,
      alertsCount: activeAlertsCount,
      performance: avgPerf,
      totalBonuses: 0,
      employeesWithBonuses: 0,
      pendingRequests: 0, // Will be updated by fetchDashboardData
    });

    updateChart(period, productions);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboardData();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const styles = useMemo(() => createStyles(theme, isTablet, isDesktop, isDarkMode), [theme, isTablet, isDesktop, isDarkMode]);

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
      case 'Vente': return theme.colors.success;
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      default: return theme.colors.primary;
    }
  };

  const getLocalizedAction = (action: string) => {
    if (action.includes('Annulation') || action.includes('annulé') || action.includes('Annulée')) {
      return `${t('common.cancelled')} • ${action}`;
    }
    if (action.includes('Production')) return t('actions.production');
    if (action.includes('Vente')) return t('actions.sale');
    if (action.includes('Aliment')) return t('actions.feed');
    if (action.includes('Santé')) return t('actions.health');
    if (action.includes('Mouvement')) return t('actions.movement');
    if (action.includes('Rappel')) return t('actions.reminder');
    return action;
  };

  const getLocalizedReminderType = (type: string) => {
    switch (type) {
      case 'Vaccination': return t('health.interventionType').split(',')[0];
      case 'Traitement': return t('health.details');
      case 'Nettoyage': return t('dbMgt.cacheClean');
      case 'Approvisionnement': return t('dashboard.restock');
      default: return type;
    }
  };

  const { width: windowWidth } = useWindowDimensions();
  const getChartWidth = () => {
    if (Platform.OS !== 'web') return windowWidth - theme.spacing.m * 4;
    
    const hasSidebar = isDesktop || isTablet;
    const availableWidth = hasSidebar ? windowWidth - 280 : windowWidth;
    const containerWidth = Math.min(availableWidth, isDesktop ? 1400 : (isTablet ? 1000 : 9999));
    const padding = theme.spacing.m * 2;
    const innerWidth = containerWidth - padding;

    if (isDesktop) {
      // flex 2 vs flex 1 => 2/3 of innerWidth
      return (innerWidth * 0.66) - theme.spacing.m;
    }
    return innerWidth - theme.spacing.m * 2;
  };
  const chartWidth = getChartWidth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaWrapper style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.welcomeText}>{t('profile.greeting')} {userName}!</Text>
          <Text style={styles.subWelcomeText}>{t('dashboard.recentActivities')}</Text>
        </View>

        {!isDesktop && (
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.avatarContainer}>
            {userImage ? (
              <Image source={{ uri: userImage }} style={styles.avatarImage} />
            ) : (
              <MaterialIcons name="account-circle" size={32} color={theme.colors.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <View style={[styles.filterSection, isDesktop && styles.filterSectionDesktop]}>
          <ScrollView
            horizontal={!isDesktop}
            showsHorizontalScrollIndicator={false}
            style={[styles.filterScroll, isDesktop && styles.filterScrollDesktop]}
            contentContainerStyle={isDesktop ? styles.filterScrollContentDesktop : null}
          >
            <TouchableOpacity
              style={[styles.filterChip, selectedFarm === 'ALL' && styles.filterChipActive]}
              onPress={() => { setSelectedFarm('ALL'); setSelectedLot('ALL'); }}
            >
              <Text style={[styles.filterText, selectedFarm === 'ALL' && styles.filterTextActive]}>
                {t('common.allFarms')}
              </Text>
            </TouchableOpacity>
            {userFarms?.map((farm: any) => (
              <TouchableOpacity
                key={farm.id}
                style={[styles.filterChip, selectedFarm === farm.id && styles.filterChipActive]}
                onPress={() => { setSelectedFarm(farm.id); setSelectedLot('ALL'); }}
              >
                <Text style={[styles.filterText, selectedFarm === farm.id && styles.filterTextActive]}>
                  {farm.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedFarm !== 'ALL' && currentFarmLots.length > 0 && (
            <ScrollView
              horizontal={!isDesktop}
              showsHorizontalScrollIndicator={false}
              style={[styles.filterScroll, { marginTop: 8 }, isDesktop && styles.filterScrollDesktop]}
              contentContainerStyle={isDesktop ? styles.filterScrollContentDesktop : null}
            >
              <TouchableOpacity
                style={[styles.filterChip, selectedLot === 'ALL' && styles.filterChipActive]}
                onPress={() => setSelectedLot('ALL')}
              >
                <Text style={[styles.filterText, selectedLot === 'ALL' && styles.filterTextActive]}>
                  {t('common.allLots')}
                </Text>
              </TouchableOpacity>
              {currentFarmLots.map((lot: any) => (
                <TouchableOpacity
                  key={lot.id}
                  style={[styles.filterChip, selectedLot === lot.id && styles.filterChipActive]}
                  onPress={() => setSelectedLot(lot.id)}
                >
                  <Text style={[styles.filterText, selectedLot === lot.id && styles.filterTextActive]}>
                    {lot.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {stats.alertsCount > 0 && healthAlerts.length > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => {
              navigation.navigate('HealthAlertDetail', { alert: healthAlerts[0] });
            }}
          >
            <View style={styles.alertBannerLeft}>
              <MaterialIcons name="notification-important" size={24} color="#FFF" />
              <View style={styles.alertBannerTextContainer}>
                <Text style={styles.alertBannerTitle}>{t('dashboard.healthAlerts')} ({healthAlerts.length})</Text>
                <Text style={styles.alertBannerSub}>
                  {`${healthAlerts[0].type || 'Alerte'}: ${healthAlerts[0].quantity || 0} ${t('common.subjects')} (${healthAlerts[0].lot_name || 'Lot'})`}
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Farms')}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>{t('profile.myLots')}</Text>
               <MaterialIcons name="business" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{stats.farmsCount} / {stats.lotsCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Farms')}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>{t('dashboard.totalBirds')}</Text>
               <MaterialIcons name="egg" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{formatNumber(stats.totalChickens)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => {
              if (activeLotId) {
                navigation.navigate('Farms', {
                  screen: 'LotDetail',
                  params: { lotId: activeLotId }
                });
              } else {
                navigation.navigate('Farms');
              }
            }}
          >
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>{t('dashboard.dailyProduction')}</Text>
               <MaterialIcons name="egg" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{formatNumber(stats.todayProduction)} {t('dashboard.units.trays')}</Text>
          </TouchableOpacity>

          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Finance')}
            >
              <View style={styles.statHeader}>
                 <Text style={styles.statLabel}>Chiffre d'Affaires</Text>
                 <MaterialIcons name="point-of-sale" size={20} color={theme.colors.success} />
              </View>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                  {formatCurrency(stats.revenues)}
              </Text>
            </TouchableOpacity>
          )}

          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Finance')}
            >
              <View style={styles.statHeader}>
                 <Text style={styles.statLabel}>Encaissements</Text>
                 <MaterialIcons name="account-balance-wallet" size={20} color={theme.colors.success} />
              </View>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                  {formatCurrency(stats.encaissements)}
              </Text>
            </TouchableOpacity>
          )}

          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Finance')}
            >
              <View style={styles.statHeader}>
                 <Text style={styles.statLabel}>Créances</Text>
                 <MaterialIcons name="hourglass-empty" size={20} color={theme.colors.warning || '#f57c00'} />
              </View>
              <Text style={[styles.statValue, { color: theme.colors.warning || '#f57c00' }]}>
                  {formatCurrency(stats.creances)}
              </Text>
            </TouchableOpacity>
          )}

          {userRole !== 'EMPLOYE' && stats.pendingRequests > 0 && (
            <TouchableOpacity
              style={[styles.statCard, { borderColor: theme.colors.warning, borderWidth: 2 }]}
              onPress={() => navigation.navigate('EmployeeRequests')}
            >
              <View style={styles.statHeader}>
                 <Text style={styles.statLabel}>{t('requests.shortTitle')}</Text>
                 <View style={styles.badgeContainer}>
                    <MaterialIcons
                      name="people"
                      size={20}
                      color={theme.colors.warning}
                    />
                    <View style={styles.notificationDot} />
                 </View>
              </View>
              <Text style={[styles.statValue, { color: theme.colors.warning }]}>
                {stats.pendingRequests}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={isDesktop ? styles.mainContentRow : null}>
          <TouchableOpacity
            style={isDesktop ? styles.chartColumn : null}
            onPress={() => navigation.getParent()?.navigate('Statistics')}
          >
            <Card style={styles.chartCard}>
              <Text style={styles.sectionTitle}>{t('dashboard.productionChart')}</Text>
              <View style={styles.periodSelectorContainer}>
                <View style={styles.periodSelector}>
                  {periods.map(p => (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.periodItem, period === p.key && styles.periodActive]}
                      onPress={() => setPeriod(p.key)}
                    >
                      <Text style={period === p.key ? styles.periodTextActive : styles.periodText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {chartData ? (
                <BarChart
                  data={chartData}
                  width={chartWidth}
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
                    propsForDots: { r: "6", strokeWidth: "2", stroke: theme.colors.primary },
                    barPercentage: 0.7,
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

          {reminders.length > 0 && (
            <View style={[styles.remindersSection, isDesktop && styles.remindersColumn]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.priorityReminders')}</Text>
                <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Reminders')}>
                  <Text style={styles.seeAllText}>{t('dashboard.myReminders')}</Text>
                </TouchableOpacity>
              </View>
              {reminders.map((reminder) => (
                <TouchableOpacity key={reminder.id} onPress={() => navigation.getParent()?.navigate('Reminders')}>
                  <Card style={styles.reminderItem}>
                    <View style={[styles.reminderIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                      <MaterialIcons name="event-note" size={20} color={theme.colors.primary} />
                    </View>
                    <View style={styles.reminderInfo}>
                      <Text style={styles.reminderTitle}>{reminder.title}</Text>
                      <Text style={styles.reminderDate}>
                        {new Date(reminder.date).toLocaleDateString(t('common.dateLocale'), { day: 'numeric', month: 'long' })}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { borderColor: theme.colors.primary + '40' }]}>
                      <Text style={[styles.typeText, { color: theme.colors.primary }]}>{getLocalizedReminderType(reminder.type)}</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={isDesktop ? styles.bottomContentRow : null}>
          {recentActions.length > 0 && (
            <View style={[styles.recentActionsSection, isDesktop && styles.recentActionsColumn]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.recentActivitiesSection')}</Text>
                <TouchableOpacity onPress={() => navigation.getParent()?.navigate('GlobalHistory')}>
                  <Text style={styles.seeAllText}>{t('profile.seeAll')}</Text>
                </TouchableOpacity>
              </View>
              {recentActions.map((log) => (
                <TouchableOpacity key={log.id} onPress={() => navigation.getParent()?.navigate('GlobalHistory')} style={isDesktop ? styles.logCardWrapperDesktop : null}>
                  <Card style={styles.logCard}>
                    <View style={[styles.logIconBox, { backgroundColor: getLogColor(log.module) + '15' }]}>
                      <MaterialIcons name={getLogIcon(log.module) as any} size={20} color={getLogColor(log.module)} />
                    </View>
                    <View style={styles.logInfo}>
                      <Text style={styles.logAction}>{getLocalizedAction(log.action)}</Text>
                      <Text style={styles.logDesc} numberOfLines={1}>{log.description}</Text>
                      <View style={styles.logFooter}>
                         <Text style={styles.logUser}><MaterialIcons name="person" size={10} /> {log.user_name}</Text>
                         <Text style={styles.logDate}>{new Date(log.date).toLocaleDateString(t('common.dateLocale'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {userRole !== 'EMPLOYE' && (inventory.raw.length > 0 || inventory.prepared.length > 0 || inventory.health.length > 0) && (
            <View style={[styles.inventorySection, isDesktop && styles.inventoryColumn]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.stockStatus')}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Inventory')}>
                  <Text style={styles.seeAllText}>{t('profile.seeAll')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal={!isDesktop}
                showsHorizontalScrollIndicator={false}
                style={[styles.inventoryScroll, isDesktop && styles.inventoryScrollDesktop]}
                contentContainerStyle={isDesktop ? styles.inventoryScrollContentDesktop : null}
              >
                {[
                  ...inventory.raw.map((item: any) => ({ ...item, type: 'raw' })),
                  ...inventory.prepared.map((item: any) => ({ ...item, type: 'prepared' })),
                  ...inventory.health.map((item: any) => ({ ...item, type: 'health' }))
                ].slice(0, isDesktop ? 4 : 2).map((item: any) => (
                  <Card key={`${item.type}-${item.id}`} style={[styles.inventoryCard, isDesktop && styles.inventoryCardDesktop]}>
                    <View style={styles.inventoryHeader}>
                      {item.type === 'raw' && <MaterialCommunityIcons name="seed" size={18} color={theme.colors.primary} />}
                      {item.type === 'prepared' && <MaterialCommunityIcons name="food-apple" size={18} color="#03A9F4" />}
                      {item.type === 'health' && <MaterialIcons name="medical-services" size={18} color="#E91E63" />}
                      <Text style={styles.inventoryFarm} numberOfLines={1}>{item.farm_name}</Text>
                    </View>
                    <Text style={styles.inventoryName} numberOfLines={1}>
                      {item.type === 'raw' ? item.feed_type : item.type === 'prepared' ? item.feed_name : item.product_name}
                    </Text>
                    <Text style={[styles.inventoryValue, (item.type === 'health' ? item.quantity < 5 : item.quantity_kg < 50) && { color: theme.colors.danger }]}>
                      {formatNumber(item.type === 'health' ? item.quantity : item.quantity_kg)}
                      <Text style={styles.unitText}> {item.type === 'health' ? (item.unit || t('common.unit')) : t('common.kg')}</Text>
                    </Text>
                  </Card>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaWrapper>
  );
};

const createStyles = (theme: any, isTablet: boolean, isDesktop: boolean, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.s,
    maxWidth: isDesktop ? 1000 : (isTablet ? 1000 : '100%'),
    alignSelf: (isTablet || isDesktop) ? 'center' : 'auto',
    width: '100%'
  },
  headerTitleContainer: {
    flex: 1,
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
    borderWidth: isDarkMode ? 0 : 1,
    borderColor: '#000000',
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
    borderWidth: 1,
    borderColor: '#000000',
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
    maxWidth: isDesktop ? 1000 : (isTablet ? 1000 : '100%'),
    alignSelf: (isTablet || isDesktop) ? 'center' : 'auto',
    width: '100%'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s,
  },
  statCard: {
    width: isDesktop ? '15.5%' : (isTablet ? '48%' : '48%'),
    padding: theme.spacing.m,
    height: 100,
    justifyContent: 'space-between',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.border : '#000000',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
    marginBottom: theme.spacing.m,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  badgeContainer: {
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
    borderWidth: 1,
    borderColor: theme.colors.surface,
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
    borderColor: isDarkMode ? theme.colors.border : '#000000',
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
    width: '100%',
  },
  filterSection: {
    marginBottom: theme.spacing.m,
  },
  filterSectionDesktop: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  filterScroll: {
    paddingBottom: 4,
  },
  filterScrollDesktop: {
    width: '100%',
  },
  filterScrollContentDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    marginBottom: isDesktop ? 8 : 0,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.border : '#000000',
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#000000',
    fontWeight: 'bold',
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
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.border : '#000000',
    ...theme.shadows.medium,
  },
  mainContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  chartColumn: {
    flex: 2,
    marginRight: theme.spacing.m,
  },
  remindersColumn: {
    flex: 1,
    marginTop: 0,
  },
  bottomContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: theme.spacing.l,
  },
  recentActionsColumn: {
    flex: 1,
    marginTop: 0,
    marginRight: theme.spacing.m,
  },
  inventoryColumn: {
    flex: 1,
    marginTop: 0,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.border : '#000000',
    backgroundColor: theme.colors.surface,
    width: '100%',
  },
  logCardWrapperDesktop: {
    width: '100%',
  },
  recentActionsSection: {
    marginTop: theme.spacing.l,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.s,
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
    borderColor: isDarkMode ? theme.colors.border : '#000000',
    backgroundColor: theme.colors.surface,
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
    borderColor: isDarkMode ? theme.colors.border : '#000000',
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
    borderColor: isDarkMode ? theme.colors.border : '#000000',
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
    borderWidth: 1,
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
  inventoryScrollDesktop: {
    width: '100%',
  },
  inventoryScrollContentDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  inventoryCard: {
    width: 130,
    marginRight: theme.spacing.m,
    padding: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.border : '#000000',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
  },
  inventoryCardDesktop: {
    width: '45%',
    marginBottom: 8,
  },
  inventoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inventoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  inventoryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  unitText: {
    fontSize: 10,
    fontWeight: 'normal',
    color: theme.colors.textSecondary,
  },
  inventoryFarm: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    flex: 1,
    marginLeft: 4,
    textAlign: 'right',
  },
  viewMoreInventory: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  viewMoreText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginTop: 4,
  }
});