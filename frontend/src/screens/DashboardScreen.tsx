import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Image, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { syncManager } from '../utils/syncManager';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Screen, Card, StatTile, SectionHeader, Chip, space, radius, shadow, GUTTER, GUTTER_WIDE } from '../components/ui';
import { ChartCard, BarChart, fmtCompact } from '../components/charts';

export const DashboardScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userName, userImage, userRole } = useAuth();
  const { t } = useTranslation();
  const { isDesktop, isDesktopOrTablet } = useBreakpoint();
  const isEmployee = userRole === 'EMPLOYE';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    farmsCount: 0, lotsCount: 0, totalChickens: 0, todayProduction: 0,
    revenues: 0, encaissements: 0, creances: 0, expenses: 0, alertsCount: 0,
    performance: 0, totalBonuses: 0, employeesWithBonuses: 0, pendingRequests: 0,
  });
  const [inventory, setInventory] = useState({ raw: [] as any[], prepared: [] as any[], health: [] as any[] });
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
      const params: any = { period };
      if (selectedFarm !== 'ALL') params.farm = selectedFarm;
      if (selectedLot !== 'ALL') params.lot = selectedLot;

      const emptyFarmStats = {
        summary: {
          farms_count: 0, lots_count: 0, total_chickens: 0, today_production: 0,
          revenues: 0, expenses: 0, alerts_count: 0, performance: 0,
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
      const sanitizedLogs = logs.map((log: any) => {
        if (isEmployee && (log.module === 'Vente' || log.module === 'Finance' || log.action.includes('Achat'))) {
          return {
            ...log,
            description: log.description ? String(log.description).replace(/(\d[\d\s]*\s*GNF|\d[\d\s]*\s*FG)/gi, '*** GNF') : log.description,
          };
        }
        return log;
      });
      setRecentActions(sanitizedLogs.slice(0, 3));

      const alertsData = Array.isArray(alertsRes.data) ? alertsRes.data : (alertsRes.data?.results || []);
      setHealthAlerts(alertsData.filter((a: any) => !a.is_viewed));

      setInventory({ raw: rawInvRes.data, prepared: prepInvRes.data, health: healthInvRes.data });

      const upcomingReminders = (remindersRes.data || [])
        .filter((r: any) => r.status === 'PENDING')
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);
      setReminders(upcomingReminders);

      processChartData(statsRes.data.charts, period);
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

    const hasData = chartValues.some((v) => v !== 0);
    setChartData({
      labels: chartLabels.length > 0 ? chartLabels : [''],
      datasets: [{ data: hasData ? chartValues : [0] }],
      isPlaceholder: !hasData,
    });
  };

  useEffect(() => { fetchDashboardData(); }, [period, selectedFarm, selectedLot]);

  const firstFocusRef = useRef(true);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (firstFocusRef.current) { firstFocusRef.current = false; return; }
      syncManager.syncAll().catch(() => {}).finally(() => fetchDashboardData());
    });
    return unsubscribe;
  }, [navigation, period, selectedFarm, selectedLot]);

  // (helper conservé — utilisé par processDashboardData en fallback)
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
    const totalChickens = (lots || []).filter((lot: any) => lot.status === 'EN_PRODUCTION').reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayProduction = activeProductions.filter((p: any) => p.date === todayStr).reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
    const revenues = activeSales.reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);
    const expenseAmount = activeExpenses.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0);
    const lotInvestment = (lots || []).filter((l: any) => l.status !== 'ANNULEE').reduce((sum: number, l: any) => sum + parseFloat(l.purchase_price || 0), 0);
    const feedPurchaseCost = activeFeedPurchases.reduce((sum: number, f: any) => sum + parseFloat(f.total_price || 0), 0);
    const healthPurchaseCost = activeHealthPurchases.reduce((sum: number, h: any) => sum + parseFloat(h.total_price || 0), 0);
    const totalExpenses = expenseAmount + lotInvestment + feedPurchaseCost + healthPurchaseCost;
    const activeAlertsCount = (allAlerts || []).filter((a: any) => !a.is_viewed).length;
    const activeLots = (lots || []).filter((l: any) => l.status === 'EN_PRODUCTION');
    if (activeLots.length > 0) setActiveLotId(activeLots[0].id);
    let avgPerf = 0;
    if (activeLots.length > 0) {
      let totalPerf = 0; let lotsWithData = 0;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setHours(0, 0, 0, 0);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      activeLots.forEach((lot: any) => {
        const lotProds = activeProductions.filter((p: any) => p.lot === lot.id);
        const recentProds = lotProds.filter((p: any) => new Date(p.date) >= sevenDaysAgo);
        const recentEggs = recentProds.reduce((sum: number, p: any) => sum + ((p.casiers_produits || 0) * 30), 0);
        const daysWithData = new Set(recentProds.map((p: any) => p.date)).size || 1;
        const lotMovements = activeMovements.filter((m: any) => m.lot === lot.id);
        const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
        const recovered = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + (m.quantity || 0), 0);
        const currentSick = Math.max(0, totalSick - recovered);
        const perf = calculatePerformance(lot.initial_quantity || 0, lot.current_quantity || 0, currentSick, recentEggs, daysWithData);
        if (perf > 0 || recentProds.length > 0) { totalPerf += perf; lotsWithData++; }
      });
      avgPerf = lotsWithData > 0 ? Math.round(totalPerf / lotsWithData) : 0;
    }
    setStats({
      farmsCount: (farms || []).length, lotsCount: (lots || []).length, totalChickens, todayProduction,
      revenues, encaissements: 0, creances: 0, expenses: totalExpenses, alertsCount: activeAlertsCount,
      performance: avgPerf, totalBonuses: 0, employeesWithBonuses: 0, pendingRequests: 0,
    });
    updateChart(period, productions);
  };
  void processDashboardData;

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchDashboardData(); });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchDashboardData(); };
  const S = useMemo(() => createStyles(theme), [theme]);

  const LOG_META: Record<string, { icon: any; color: string }> = {
    Production: { icon: 'egg', color: '#F57C00' },
    Vente: { icon: 'cart', color: '#00897B' },
    Alimentation: { icon: 'silo', color: '#1E88E5' },
    'Santé': { icon: 'medical-bag', color: '#8E24AA' },
    Mouvement: { icon: 'swap-horizontal', color: '#5E35B1' },
    Finance: { icon: 'cash', color: '#00897B' },
  };
  const logMeta = (m: string) => LOG_META[m] || { icon: 'history', color: theme.colors.primary };

  const getLocalizedAction = (action: string) => {
    if (action.includes('Annulation') || action.includes('annulé') || action.includes('Annulée')) return `${t('common.cancelled')} • ${action}`;
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

  const perfInfo = getPerformanceLabel(stats.performance || 0, (k: string) => k);

  const chartSeries = useMemo(() => {
    if (!chartData || chartData.isPlaceholder) return [];
    return (chartData.labels as string[]).map((label, i) => ({ label: label || '—', value: chartData.datasets?.[0]?.data?.[i] || 0 }));
  }, [chartData]);

  const goLot = () => {
    if (activeLotId) navigation.navigate('Farms', { screen: 'LotDetail', params: { lotId: activeLotId } });
    else navigation.navigate('Farms');
  };

  // Sur mobile (Android ET iOS — mêmes tailles d'écran), `flex: 1` dans un
  // conteneur `flexWrap` réduit les cartes à une largeur nulle (quirk Yoga) :
  // on impose une base 2 colonnes. Web : comportement inchangé (StatTile gère
  // sa propre largeur flex).
  const Tile = (props: any) =>
    Platform.OS !== 'web'
      ? <View style={S.androidTile}><StatTile {...props} /></View>
      : <StatTile {...props} />;

  if (loading) {
    return (
      <Screen>
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </Screen>
    );
  }

  const invItems = [
    ...inventory.raw.map((i: any) => ({ ...i, kind: 'raw' })),
    ...inventory.prepared.map((i: any) => ({ ...i, kind: 'prepared' })),
    ...inventory.health.map((i: any) => ({ ...i, kind: 'health' })),
  ];

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <View style={[S.head, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border, paddingHorizontal: isDesktopOrTablet ? GUTTER_WIDE : GUTTER }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.hello, { color: theme.colors.textSecondary }]}>{t('profile.greeting')}</Text>
            <Text style={[S.name, { color: theme.colors.text }]} numberOfLines={1}>{userName}</Text>
          </View>
          {!(isDesktopOrTablet && Platform.OS === 'web') && (
            <Pressable onPress={() => navigation.openDrawer()} style={S.avatar}>
              {userImage ? <Image source={{ uri: userImage }} style={S.avatarImg} /> : <MaterialIcons name="account-circle" size={34} color={theme.colors.primary} />}
            </Pressable>
          )}
        </View>
      }
    >
      {/* Filtres */}
      <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        <Chip label={t('common.allFarms')} icon="home-group" active={selectedFarm === 'ALL'} onPress={() => { setSelectedFarm('ALL'); setSelectedLot('ALL'); }} />
        {userFarms?.map((f: any) => (
          <Chip key={f.id} label={f.name} active={selectedFarm === f.id} onPress={() => { setSelectedFarm(f.id); setSelectedLot('ALL'); }} />
        ))}
      </ScrollView>
      {selectedFarm !== 'ALL' && currentFarmLots.length > 0 && (
        <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={[S.chipRow, { paddingTop: 0 }]}>
          <Chip label={t('common.allLots')} active={selectedLot === 'ALL'} onPress={() => setSelectedLot('ALL')} />
          {currentFarmLots.map((l: any) => (
            <Chip key={l.id} label={l.name} active={selectedLot === l.id} onPress={() => setSelectedLot(l.id)} />
          ))}
        </ScrollView>
      )}

      {/* Alerte santé */}
      {stats.alertsCount > 0 && healthAlerts.length > 0 && (
        <Pressable onPress={() => navigation.navigate('HealthAlerts')} style={S.alert}>
          <MaterialIcons name="notification-important" size={22} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={S.alertTitle}>{t('dashboard.healthAlerts')} ({healthAlerts.length})</Text>
            <Text style={S.alertSub} numberOfLines={1}>
              {`${healthAlerts[0].type || 'Alerte'} · ${healthAlerts[0].quantity || 0} ${t('common.subjects')} · ${healthAlerts[0].lot_name || 'Lot'}`}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#FFF" />
        </Pressable>
      )}

      {/* Stat tiles */}
      <View style={S.grid}>
        <Tile label={t('profile.myLots')} value={`${stats.farmsCount} / ${stats.lotsCount}`} icon="home-group" onPress={() => navigation.navigate('Farms')} />
        <Tile label={t('dashboard.totalBirds')} value={formatNumber(stats.totalChickens)} icon="bird" accent="#43A047" onPress={() => navigation.navigate('Farms')} />
        <Tile label={t('dashboard.dailyProduction')} value={`${formatNumber(stats.todayProduction)}`} hint={t('dashboard.units.trays')} icon="egg" onPress={goLot} />
        <Tile label={t('statistics.performance')} value={`${stats.performance || 0}%`} icon="speedometer" accent={perfInfo.color}
          hint={typeof perfInfo.label === 'string' ? perfInfo.label : ''} onPress={() => navigation.getParent()?.navigate('Statistics')} />
        {!isEmployee && (
          <Tile label="Chiffre d'affaires" value={formatCurrency(stats.revenues)} icon="cash-multiple" accent="#00897B" onPress={() => navigation.navigate('Finance')} />
        )}
        {!isEmployee && (
          <Tile label="Encaissements" value={formatCurrency(stats.encaissements)} icon="wallet" accent="#1E88E5" onPress={() => navigation.navigate('Finance')} />
        )}
        {!isEmployee && (
          <Tile label="Créances" value={formatCurrency(stats.creances)} icon="timer-sand" accent="#F57C00" onPress={() => navigation.navigate('Finance')} />
        )}
        {!isEmployee && stats.pendingRequests > 0 && (
          <Tile label={t('requests.shortTitle')} value={stats.pendingRequests} icon="account-clock" accent="#F57C00" onPress={() => navigation.navigate('EmployeeRequests')} />
        )}
      </View>

      {/* Graphique production */}
      <ChartCard
        title={t('dashboard.productionChart')}
        subtitle={t('dashboard.units.trays')}
        height={210}
        empty={chartSeries.length === 0}
        footer={
          <View style={S.periodRow}>
            {periods.map((p) => (
              <View key={p.key} style={{ flex: 1 }}>
                <Chip label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
              </View>
            ))}
          </View>
        }
      >
        {(w) => <BarChart width={w} height={210} data={chartSeries} formatValue={fmtCompact} />}
      </ChartCard>

      {/* Rappels prioritaires */}
      {reminders.length > 0 && (
        <>
          <SectionHeader title={t('dashboard.priorityReminders')} icon="bell-ring-outline"
            action={{ label: t('dashboard.myReminders'), onPress: () => navigation.getParent()?.navigate('Reminders') }} />
          {reminders.map((r) => (
            <Pressable key={r.id} onPress={() => navigation.getParent()?.navigate('Reminders')}>
              <Card style={S.row} padding={space.sm}>
                <View style={[S.rowIcon, { backgroundColor: theme.colors.primary + '1F' }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[S.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>{r.title}</Text>
                  <Text style={[S.rowSub, { color: theme.colors.textSecondary }]}>
                    {new Date(r.date).toLocaleDateString(t('common.dateLocale'), { day: 'numeric', month: 'long' })}
                  </Text>
                </View>
                <View style={[S.tag, { borderColor: theme.colors.primary + '55' }]}>
                  <Text style={[S.tagText, { color: theme.colors.primary }]}>{getLocalizedReminderType(r.type)}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {/* Activités récentes */}
      {recentActions.length > 0 && (
        <>
          <SectionHeader title={t('dashboard.recentActivitiesSection')} icon="history"
            action={{ label: t('profile.seeAll'), onPress: () => navigation.getParent()?.navigate('GlobalHistory') }} />
          {recentActions.map((log) => {
            const m = logMeta(log.module);
            return (
              <Pressable key={log.id} onPress={() => navigation.getParent()?.navigate('GlobalHistory')}>
                <Card style={S.row} padding={space.sm}>
                  <View style={[S.rowIcon, { backgroundColor: m.color + '1F' }]}>
                    <MaterialCommunityIcons name={m.icon} size={18} color={m.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[S.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>{getLocalizedAction(log.action)}</Text>
                    <Text style={[S.rowSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>{log.description}</Text>
                    <Text style={[S.rowMeta, { color: theme.colors.textSecondary }]}>
                      {log.user_name} · {new Date(log.date).toLocaleDateString(t('common.dateLocale'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Stocks */}
      {!isEmployee && invItems.length > 0 && (
        <>
          <SectionHeader title={t('dashboard.stockStatus')} icon="package-variant"
            action={{ label: t('profile.seeAll'), onPress: () => navigation.navigate('Inventory') }} />
          <View style={S.grid}>
            {invItems.slice(0, isDesktopOrTablet ? 4 : 2).map((item: any) => {
              const isHealth = item.kind === 'health';
              const qty = isHealth ? item.quantity : item.quantity_kg;
              const low = isHealth ? item.quantity < 5 : item.quantity_kg < 50;
              const meta = item.kind === 'raw'
                ? { icon: 'seed-outline' as const, color: '#F57C00' }
                : item.kind === 'prepared'
                  ? { icon: 'silo' as const, color: '#1E88E5' }
                  : { icon: 'medical-bag' as const, color: '#8E24AA' };
              return (
                <StatTile
                  key={`${item.kind}-${item.id}`}
                  label={item.kind === 'raw' ? item.feed_type : item.kind === 'prepared' ? item.feed_name : item.product_name}
                  value={`${formatNumber(qty)} ${isHealth ? (item.unit || t('common.unit')) : t('common.kg')}`}
                  icon={meta.icon}
                  accent={low ? theme.colors.danger : meta.color}
                  hint={item.farm_name}
                />
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  hello: { fontSize: 12.5, fontWeight: '600' },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  avatarImg: { width: '100%', height: '100%' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: space.sm },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#D32F2F', borderRadius: radius.lg, padding: 14, marginBottom: space.md, ...(shadow.sm as any) },
  alertTitle: { color: '#FFF', fontSize: 14.5, fontWeight: '800' },
  alertSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xs },
  androidTile: { flexBasis: '47%', flexGrow: 1, minWidth: 0 }, // 2 colonnes sur mobile (Android + iOS)
  periodRow: { flexDirection: 'row', gap: 6, marginTop: space.sm },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12.5, marginTop: 1 },
  rowMeta: { fontSize: 11, marginTop: 2 },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '800' },
});
