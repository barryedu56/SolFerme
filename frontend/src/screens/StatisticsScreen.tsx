import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { getPerformanceLabel } from '../utils/performance';
import { generateConsolidatedReport } from '../utils/reportGenerator';
import { Button } from '../components/Button';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Screen, ScreenHeader, Card, SectionHeader, StatTile, Chip, space, radius } from '../components/ui';
import { ChartCard, LineChart, BarChart, GroupedBarChart } from '../components/charts';
import { useChartTheme, fmtCompact } from '../components/charts/useChartTheme';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export const StatisticsScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth() as any;
  const { isDesktopOrTablet } = useBreakpoint();
  const chartC = useChartTheme();

  const PERIODS = [
    { label: t('common.today'), value: 'day' },
    { label: t('common.week'), value: 'week' },
    { label: t('common.month'), value: 'month' },
    { label: t('common.year'), value: 'year' },
  ];

  const [period, setPeriod] = useState('week');
  const [selectedFarm, setSelectedFarm] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [farms, setFarms] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);

  const fetchData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      let url = `/farms/statistics/?period=${period}`;
      if (selectedLot) url += `&lot=${selectedLot}`;
      else if (selectedFarm) url += `&farm=${selectedFarm}`;

      const [statsRes, farmsRes, lotsRes] = await Promise.all([
        repositoryProvider.api.get(url).catch(() => ({ data: { summary: {}, charts: {} } })),
        repositoryProvider.api.get('/farms/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
      ]);

      const statsData = statsRes.data;
      if (userRole === 'EMPLOYE' && statsData.summary) {
        statsData.summary.revenues = 0;
        statsData.summary.expenses = 0;
        statsData.summary.feeding_cost = 0;
        statsData.summary.health_cost = 0;
        if (statsData.charts) statsData.charts.finance = [];
      }
      setStats(statsData);
      setFarms(Array.isArray(farmsRes.data) ? farmsRes.data : farmsRes.data?.results || []);
      setLots(Array.isArray(lotsRes.data) ? lotsRes.data : lotsRes.data?.results || []);
    } catch (e) {
      console.error('Stats error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [period, selectedFarm, selectedLot]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchData());
    return unsub;
  }, [navigation, period, selectedFarm, selectedLot]);

  const onRefresh = () => { setRefreshing(true); fetchData(true); };

  const summary = stats?.summary;
  const charts = stats?.charts;

  const toSeries = (data: any[], key = 'value') => {
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => {
      let label = d.label;
      if (!label && d.day) {
        const date = new Date(d.day);
        if (period === 'year') label = MONTHS[date.getMonth()];
        else if (period === 'month') label = String(date.getDate());
        else label = date.toLocaleDateString('fr-FR', { weekday: 'short' });
      }
      return { label: label || '—', value: parseFloat(d[key] ?? d.value ?? d.total ?? 0) || 0 };
    });
  };

  const filteredLots = useMemo(
    () => lots.filter((l: any) => !selectedFarm || Number(l.farm) === selectedFarm),
    [lots, selectedFarm],
  );

  // Le backend renvoie `charts.sales` et `charts.expenses` séparément
  // (pas de clé `finance`). On les fusionne ici pour le graphique groupé.
  const financeGroups = useMemo(() => {
    const salesSeries = toSeries(charts?.sales);
    const expenseSeries = toSeries(charts?.expenses);
    if (!salesSeries.length && !expenseSeries.length) return [];
    const labels: string[] = [];
    [...salesSeries, ...expenseSeries].forEach((d) => { if (!labels.includes(d.label)) labels.push(d.label); });
    const sMap = Object.fromEntries(salesSeries.map((d) => [d.label, d.value]));
    const eMap = Object.fromEntries(expenseSeries.map((d) => [d.label, d.value]));
    return labels.map((l) => ({ label: l, values: [sMap[l] || 0, eMap[l] || 0] as [number, number] }));
  }, [charts, period]);
  const hasFinanceData = financeGroups.some((g) => g.values[0] || g.values[1]);

  const S = useMemo(() => createStyles(theme), [theme]);
  const perf = summary ? (summary.performance ?? 0) : 0;
  const perfInfo = getPerformanceLabel(perf, (k: string) => k);

  const Row = ({ label, value, color }: any) => (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={[S.rowValue, color && { color }]}>{value}</Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <Screen header={<ScreenHeader title={t('statistics.title')} onBack={() => navigation.goBack()} />}>
        <View style={S.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={S.muted}>{t('statistics.loading')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <ScreenHeader
          title={t('statistics.title')}
          onBack={() => navigation.goBack()}
          actions={[{ icon: 'refresh', onPress: onRefresh, tint: theme.colors.primary }]}
        />
      }
    >
      {/* ── Filtres ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        <Chip label="Toutes les fermes" icon="home-group" active={!selectedFarm} onPress={() => { setSelectedFarm(null); setSelectedLot(null); }} />
        {farms.map((f: any) => (
          <Chip key={f.id} label={f.name} active={selectedFarm === f.id} onPress={() => { setSelectedFarm(f.id); setSelectedLot(null); }} />
        ))}
      </ScrollView>
      {filteredLots.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={[S.chipRow, { paddingTop: 0 }]}>
          <Chip label="Tous les lots" active={!selectedLot} onPress={() => setSelectedLot(null)} />
          {filteredLots.map((l: any) => (
            <Chip key={l.id} label={l.name} active={selectedLot === l.id} onPress={() => setSelectedLot(l.id)} />
          ))}
        </ScrollView>
      )}
      <View style={S.periodRow}>
        {PERIODS.map((p) => (
          <View key={p.value} style={{ flex: 1 }}>
            <Chip label={p.label} active={period === p.value} onPress={() => setPeriod(p.value)} />
          </View>
        ))}
      </View>

      {!summary ? (
        <View style={S.center}>
          <MaterialIcons name="insert-chart-outlined" size={56} color={theme.colors.border} />
          <Text style={S.muted}>{t('statistics.noDataPeriod')}</Text>
        </View>
      ) : (
        <>
          {/* ── Vue d'ensemble ── */}
          <SectionHeader title={t('statistics.overview')} icon="view-dashboard-outline" />
          <View style={S.grid}>
            <StatTile label={t('statistics.farms')} value={summary.farms_count} icon="home-group" />
            <StatTile label={t('statistics.activeLots')} value={summary.lots_count} icon="layers-triple" accent="#1E88E5" />
            <StatTile label={t('statistics.liveBirds')} value={formatNumber(summary.current_birds)} icon="bird" accent="#43A047" />
            <StatTile label={t('statistics.performance')} value={`${perf}%`} icon="speedometer" accent={perfInfo.color}
              hint={typeof perfInfo.label === 'string' ? perfInfo.label : ''} />
          </View>

          {(summary.sick_birds > 0 || summary.dead_birds > 0) && (
            <View style={S.alert}>
              <MaterialIcons name="warning-amber" size={18} color="#E65100" />
              <Text style={S.alertText}>
                {summary.sick_birds > 0 ? `${summary.sick_birds} sujet(s) malade(s)` : ''}
                {summary.sick_birds > 0 && summary.dead_birds > 0 ? '   ·   ' : ''}
                {summary.dead_birds > 0 ? `${summary.dead_birds} perte(s)` : ''}
              </Text>
            </View>
          )}

          {/* ── Production ── */}
          <SectionHeader title={t('statistics.production')} icon="egg-outline" />
          <Card>
            <View style={S.rows}>
              <Row label={t('statistics.traysProduced')} value={formatNumber(summary.production_total)} />
              <Row label={t('statistics.available')} value={formatNumber(Math.max(0, summary.production_salable - summary.production_sold))} color="#2E7D32" />
              <Row label={t('statistics.sold')} value={formatNumber(summary.production_sold)} color={theme.colors.primary} />
              {summary.production_broken > 0 && (
                <Row label={t('statistics.brokenTrays')} value={formatNumber(summary.production_broken / 30)} color="#F57C00" />
              )}
            </View>
          </Card>
          <ChartCard
            title={t('statistics.eggsAndTrays')}
            subtitle="Casiers vendables par période"
            height={210}
            empty={!(charts?.production?.length > 1)}
          >
            {(w) => <LineChart width={w} height={210} data={toSeries(charts.production)} formatValue={fmtCompact} />}
          </ChartCard>

          {/* ── Alimentation ── */}
          <SectionHeader title={t('statistics.feeding')} icon="corn" />
          <Card>
            <View style={S.stockRow}>
              <View style={S.stockCol}>
                <Text style={S.stockTitle}>{t('statistics.rawMaterials')}</Text>
                <Text style={[S.stockValue, { color: '#F57C00' }]}>{formatNumber(summary.raw_material_stock)} kg</Text>
                {(summary.raw_materials_detail || []).map((m: any, i: number) => (
                  <Text key={i} style={S.stockSub}>• {m.feed_type} : {formatNumber(m.total)} kg</Text>
                ))}
              </View>
              <View style={S.vsep} />
              <View style={S.stockCol}>
                <Text style={S.stockTitle}>{t('statistics.preparedFeed')}</Text>
                <Text style={[S.stockValue, { color: '#2E7D32' }]}>{formatNumber(summary.feed_stock)} kg</Text>
                {(summary.prepared_feeds_detail || []).map((m: any, i: number) => (
                  <Text key={i} style={S.stockSub}>• {m.feed_name} : {formatNumber(m.total)} kg</Text>
                ))}
              </View>
            </View>
            <View style={[S.rows, { marginTop: space.sm }]}>
              <Row label={t('statistics.consumedPeriod')} value={`${formatNumber(summary.feeding_consumed)} kg`} />
              <Row label={t('statistics.lastDistribution')} value={summary.last_distribution_date ? new Date(summary.last_distribution_date).toLocaleDateString(t('common.dateLocale')) : '—'} />
            </View>
          </Card>
          <ChartCard title={t('statistics.feedAndStock')} subtitle="Distributions (kg)" height={200} empty={!(charts?.feeding?.length)}>
            {(w) => <BarChart width={w} height={200} data={toSeries(charts.feeding)} color="#1E88E5" formatValue={(n) => `${fmtCompact(n)}`} />}
          </ChartCard>

          {/* ── Santé ── */}
          <SectionHeader title={t('statistics.health')} icon="medical-bag" />
          <Card>
            <View style={S.rows}>
              <Row label={t('statistics.sickBirds')} value={summary.sick_birds} color={summary.sick_birds > 0 ? '#F57C00' : theme.colors.text} />
              <Row label={t('statistics.mortality')} value={summary.dead_birds} color={summary.dead_birds > 0 ? theme.colors.danger : theme.colors.text} />
              <Row label={t('statistics.recoveries')} value={summary.recovered_birds} color="#2E7D32" />
              <Row label={t('statistics.productsAndTreatments')} value={`${summary.health_treatments} ${t('statistics.treatmentPlural')}`} />
            </View>
            {(summary.health_inventory || []).length > 0 && (
              <View style={S.inv}>
                <Text style={S.invTitle}>{t('statistics.medicineStock')}</Text>
                {(summary.health_inventory || []).map((item: any, i: number) => (
                  <View key={i} style={S.invRow}>
                    <View style={[S.invDot, { backgroundColor: '#8E24AA' }]} />
                    <Text style={S.invName}>{item.product_name}</Text>
                    <Text style={[S.invQty, { color: '#8E24AA' }]}>{formatNumber(item.quantity)} {item.unit}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* ── Finance ── */}
          {userRole !== 'EMPLOYE' && (
            <>
              <SectionHeader title={t('statistics.finance')} icon="finance" />
              <Card>
                <View style={[S.profit, { backgroundColor: (summary.revenues - summary.expenses) >= 0 ? '#00897B15' : theme.colors.danger + '15' }]}>
                  <Text style={S.profitLabel}>{t('statistics.netProfit')}</Text>
                  <Text style={[S.profitValue, { color: (summary.revenues - summary.expenses) >= 0 ? '#00897B' : theme.colors.danger }]}>
                    {formatCurrency(summary.revenues - summary.expenses)}
                  </Text>
                </View>
                <View style={S.rows}>
                  <Row label={t('statistics.revenues')} value={formatCurrency(summary.revenues)} color="#00897B" />
                  <Row label={t('statistics.expenses')} value={formatCurrency(summary.expenses)} color="#D84315" />
                  <Row label={t('statistics.feedingCost')} value={formatCurrency(summary.feeding_cost || 0)} />
                  <Row label={t('statistics.healthCost')} value={formatCurrency(summary.health_cost || 0)} />
                </View>
              </Card>
              <ChartCard
                title={t('statistics.revenueAndExpenses')}
                legend={[{ label: t('statistics.revenues'), color: chartC.income }, { label: t('statistics.expenses'), color: chartC.expense }]}
                height={210}
                empty={!hasFinanceData}
              >
                {(w) => (
                  <GroupedBarChart
                    width={w}
                    height={210}
                    groups={financeGroups}
                    colors={[chartC.income, chartC.expense]}
                    formatValue={fmtCompact}
                  />
                )}
              </ChartCard>

              <View style={{ alignItems: 'center', marginTop: space.sm }}>
                <Button
                  title={t('statistics.exportGlobalReport')}
                  onPress={async () => {
                    try {
                      if (!stats || !stats.summary) {
                        Alert.alert(t('common.error'), t('common.noData') || "Aucune donnée disponible pour l'export");
                        return;
                      }
                      setExporting(true);
                      const exportStats = {
                        global: { farms: stats.summary.farms_count || 0, lots: stats.summary.lots_count || 0, alive: stats.summary.current_birds || 0, performance: stats.summary.performance || 0 },
                        production: { totalTrays: stats.summary.production_total || 0, salable: stats.summary.production_salable || 0, sold: stats.summary.production_sold || 0 },
                        feeding: { consumed: stats.summary.feeding_consumed || 0, stock: stats.summary.feed_stock || 0 },
                        health: { dead: stats.summary.dead_birds || 0, sick: stats.summary.sick_birds || 0, treatments: stats.summary.health_treatments || 0 },
                        finance: { income: stats.summary.revenues || 0, expenses: stats.summary.expenses || 0, profit: (stats.summary.revenues || 0) - (stats.summary.expenses || 0) },
                      };
                      await generateConsolidatedReport(exportStats, period, t, userRole);
                    } catch (error) {
                      Alert.alert(t('common.error'), t('lots.exportError'));
                    } finally {
                      setExporting(false);
                    }
                  }}
                  loading={exporting}
                  variant="primary"
                  style={{ width: '100%', height: 50 }}
                  leftIcon={<MaterialIcons name="picture-as-pdf" size={20} color={isDarkMode ? '#FFF' : '#000'} />}
                />
                <Text style={S.exportHint}>Les rapports utilisent les données filtrées à l'écran.</Text>
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 12 },
  muted: { fontSize: 13.5, color: theme.colors.textSecondary, fontWeight: '500' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: space.sm, alignItems: 'center' },
  periodRow: { flexDirection: 'row', gap: 6, marginTop: space.xs, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3E0', borderRadius: radius.md, padding: 12, marginTop: space.md },
  alertText: { fontSize: 13, color: '#E65100', fontWeight: '700' },
  rows: { gap: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '500', flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  stockRow: { flexDirection: 'row', gap: 12 },
  stockCol: { flex: 1 },
  stockTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  stockValue: { fontSize: 19, fontWeight: '800', marginBottom: 6 },
  stockSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  vsep: { width: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  inv: { marginTop: space.sm, padding: 12, backgroundColor: theme.colors.background, borderRadius: radius.md },
  invTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  invRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  invDot: { width: 7, height: 7, borderRadius: 4, marginRight: 10 },
  invName: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: '500' },
  invQty: { fontSize: 13, fontWeight: '800' },
  profit: { borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  profitLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  profitValue: { fontSize: 21, fontWeight: '800' },
  exportHint: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 10, textAlign: 'center' },
});
