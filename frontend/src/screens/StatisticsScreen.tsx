import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, RefreshControl
} from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';
import { generateConsolidatedFinancePDF, generateConsolidatedReport } from '../utils/reportGenerator';
import { Button } from '../components/Button';

export const StatisticsScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;
  const { width } = useWindowDimensions();

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

      let statsData = statsRes.data;
      if (userRole === 'EMPLOYE' && statsData.summary) {
        statsData.summary.revenues = 0;
        statsData.summary.expenses = 0;
        statsData.summary.feeding_cost = 0;
        statsData.summary.health_cost = 0;
        if (statsData.charts) {
          statsData.charts.finance = [];
        }
      }

      setStats(statsData);
      setFarms(farmsRes.data);
      setLots(lotsRes.data);
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

  const chartCfg = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => theme.colors.primary,
    labelColor: (opacity = 1) => theme.colors.textSecondary,
    style: { borderRadius: 12 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: theme.colors.primary },
    fillShadowGradientFrom: theme.colors.primary,
    fillShadowGradientTo: theme.colors.surface,
  };

  const formatChartData = (data: any[], key = 'value') => {
    if (!data || data.length === 0) return { labels: ['—'], datasets: [{ data: [0] }] };
    const labels = data.map((d: any) => {
      if (d.label) return d.label;
      const date = new Date(d.day);
      if (period === 'year') return ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'][date.getMonth()];
      if (period === 'month') return date.getDate().toString();
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    });
    return { labels, datasets: [{ data: data.map((d: any) => parseFloat(d[key] ?? d.value ?? d.total ?? 0)) }] };
  };

  const filteredLots = useMemo(() =>
    lots.filter((l: any) => !selectedFarm || Number(l.farm) === selectedFarm),
    [lots, selectedFarm]
  );

  const S = createStyles(theme, isDarkMode, width);

  const perf = summary ? (summary.performance ?? 0) : 0;
  const perfInfo = getPerformanceLabel(perf, (k: string) => k);

  const StatBox = ({ label, value, color, icon, sub }: any) => (
    <View style={S.statBox}>
      <View style={[S.statBoxIcon, { backgroundColor: (color || theme.colors.primary) + '18' }]}>
        <MaterialIcons name={icon} size={20} color={color || theme.colors.primary} />
      </View>
      <Text style={[S.statBoxValue, color && { color }]}>{value}</Text>
      <Text style={S.statBoxLabel}>{label}</Text>
      {sub && <Text style={S.statBoxSub}>{sub}</Text>}
    </View>
  );

  const SectionHeader = ({ icon, iconLib = 'material', title, color, badge }: any) => (
    <View style={S.sectionHeader}>
      <View style={S.sectionHeaderLeft}>
        <View style={[S.sectionIconWrap, { backgroundColor: (color || theme.colors.primary) + '18' }]}>
          {iconLib === 'community'
            ? <MaterialCommunityIcons name={icon} size={20} color={color || theme.colors.primary} />
            : <MaterialIcons name={icon} size={20} color={color || theme.colors.primary} />}
        </View>
        <Text style={[S.sectionTitle, { color: color || theme.colors.text }]}>{title}</Text>
      </View>
      {badge !== undefined && (
        <View style={[S.badge, { backgroundColor: (color || theme.colors.primary) + '18' }]}>
          <Text style={[S.badgeText, { color: color || theme.colors.primary }]}>{badge}</Text>
        </View>
      )}
    </View>
  );

  const RowStat = ({ label, value, color }: any) => (
    <View style={S.rowStat}>
      <Text style={S.rowStatLabel}>{label}</Text>
      <Text style={[S.rowStatValue, color && { color }]}>{value}</Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[S.rowStatLabel, { marginTop: 12 }]}>{t('statistics.loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.container}>
      {/* ── HEADER ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('statistics.title')}</Text>
        <TouchableOpacity onPress={onRefresh} style={S.backBtn}>
          <MaterialIcons name="refresh" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ── FILTRES FERME ── */}
      <View style={S.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[S.chip, !selectedFarm && S.chipActive]}
            onPress={() => { setSelectedFarm(null); setSelectedLot(null); }}
          >
            <MaterialIcons name="domain" size={13} color={!selectedFarm ? '#fff' : theme.colors.textSecondary} />
            <Text style={[S.chipText, !selectedFarm && S.chipTextActive]}>  Toutes</Text>
          </TouchableOpacity>
          {farms.map((f: any) => (
            <TouchableOpacity
              key={f.id}
              style={[S.chip, selectedFarm === f.id && S.chipActive]}
              onPress={() => { setSelectedFarm(f.id); setSelectedLot(null); }}
            >
              <Text style={[S.chipText, selectedFarm === f.id && S.chipTextActive]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredLots.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <TouchableOpacity
              style={[S.chip, S.chipSm, !selectedLot && S.chipSmActive]}
              onPress={() => setSelectedLot(null)}
            >
              <Text style={[S.chipTextSm, !selectedLot && S.chipTextSmActive]}>Tous les lots</Text>
            </TouchableOpacity>
            {filteredLots.map((l: any) => (
              <TouchableOpacity
                key={l.id}
                style={[S.chip, S.chipSm, selectedLot === l.id && S.chipSmActive]}
                onPress={() => setSelectedLot(l.id)}
              >
                <Text style={[S.chipTextSm, selectedLot === l.id && S.chipTextSmActive]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── PÉRIODE ── */}
        <View style={S.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[S.periodTab, period === p.value && S.periodTabActive]}
              onPress={() => setPeriod(p.value)}
            >
              <Text style={[S.periodTabText, period === p.value && S.periodTabTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={S.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {!summary ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <MaterialCommunityIcons name="chart-box-outline" size={56} color={theme.colors.border} />
            <Text style={[S.rowStatLabel, { marginTop: 12 }]}>{t('statistics.noDataPeriod')}</Text>
          </View>
        ) : (
          <>
            {/* ── RÉSUMÉ GLOBAL ── */}
            <Text style={S.groupLabel}>{t('statistics.overview')}</Text>
            <View style={S.statsGrid}>
              <StatBox label={t('statistics.farms')} value={summary.farms_count} icon="domain" />
              <StatBox label={t('statistics.activeLots')} value={summary.lots_count} icon="layers" color={theme.colors.info || '#2196F3'} />
              <StatBox label={t('statistics.liveBirds')} value={formatNumber(summary.current_birds)} icon="pets" color={theme.colors.success} />
              <StatBox
                label={t('statistics.performance')}
                value={`${perf}%`}
                icon="trending-up"
                color={perfInfo.color}
                sub={typeof perfInfo.label === 'string' ? perfInfo.label : ''}
              />
            </View>

            {(summary.sick_birds > 0 || summary.dead_birds > 0) && (
              <View style={S.alertBanner}>
                <MaterialIcons name="warning-amber" size={18} color="#E65100" />
                <Text style={S.alertText}>
                  {summary.sick_birds > 0 ? `${summary.sick_birds} malades` : ''}
                  {summary.sick_birds > 0 && summary.dead_birds > 0 ? '  ·  ' : ''}
                  {summary.dead_birds > 0 ? `${summary.dead_birds} pertes` : ''}
                </Text>
              </View>
            )}

            {/* ── PRODUCTION ── */}
            <Text style={S.groupLabel}>{t('statistics.production')}</Text>
            <Card style={S.card}>
              <SectionHeader icon="egg-outline" iconLib="community" title={t('statistics.eggsAndTrays')} color={theme.colors.primary} badge={`${formatNumber(summary.production_total)} ${t('dashboard.units.trays')}`} />
              <View style={S.rowStats}>
                <RowStat label={t('statistics.traysProduced')} value={formatNumber(summary.production_total)} />
                <RowStat label={t('statistics.available')} value={formatNumber(Math.max(0, summary.production_salable - summary.production_sold))} color={theme.colors.success} />
                <RowStat label={t('statistics.sold')} value={formatNumber(summary.production_sold)} color={theme.colors.primary} />
                {summary.production_broken > 0 && (
                  <RowStat label={t('statistics.brokenTrays')} value={formatNumber(summary.production_broken / 30)} color={theme.colors.warning} />
                )}
              </View>
              {charts?.production?.length > 0 && (
                <LineChart
                  data={formatChartData(charts.production)}
                  width={width - 72}
                  height={220}
                  chartConfig={chartCfg}
                  bezier
                  style={S.chart}
                  withInnerLines={false}
                  xLabelsOffset={-10}
                />
              )}
            </Card>

            {/* ── ALIMENTATION ── */}
            <Text style={S.groupLabel}>{t('statistics.feeding')}</Text>
            <Card style={S.card}>
              <SectionHeader icon="food-apple-outline" iconLib="community" title={t('statistics.feedAndStock')} color="#FF9800" />

              <View style={S.stockRow}>
                <View style={S.stockItem}>
                  <Text style={S.stockItemTitle}>{t('statistics.rawMaterials')}</Text>
                  <Text style={[S.stockItemValue, { color: '#FF9800' }]}>{formatNumber(summary.raw_material_stock)} kg</Text>
                  {(summary.raw_materials_detail || []).map((m: any, i: number) => (
                    <Text key={i} style={S.stockItemSub}>• {m.feed_type} : {formatNumber(m.total)} kg</Text>
                  ))}
                </View>
                <View style={[S.stockDivider]} />
                <View style={S.stockItem}>
                  <Text style={S.stockItemTitle}>{t('statistics.preparedFeed')}</Text>
                  <Text style={[S.stockItemValue, { color: theme.colors.success }]}>{formatNumber(summary.feed_stock)} kg</Text>
                  {(summary.prepared_feeds_detail || []).map((m: any, i: number) => (
                    <Text key={i} style={S.stockItemSub}>• {m.feed_name} : {formatNumber(m.total)} kg</Text>
                  ))}
                </View>
              </View>

              <View style={[S.rowStats, { marginTop: 12 }]}>
                <RowStat label={t('statistics.consumedPeriod')} value={`${formatNumber(summary.feeding_consumed)} kg`} />
                <RowStat label={t('statistics.lastDistribution')} value={summary.last_distribution_date ? new Date(summary.last_distribution_date).toLocaleDateString(t('common.dateLocale')) : '—'} />
              </View>
              {charts?.feeding?.length > 0 && (
                <BarChart
                  data={formatChartData(charts.feeding)}
                  width={width - 72}
                  height={220}
                  chartConfig={chartCfg}
                  style={S.chart}
                  yAxisLabel=""
                  yAxisSuffix=" kg"
                  xLabelsOffset={-10}
                />
              )}
            </Card>

            {/* ── SANTÉ ── */}
            <Text style={S.groupLabel}>{t('statistics.health')}</Text>
            <Card style={S.card}>
              <SectionHeader icon="medical-services" title={t('statistics.productsAndTreatments')} color="#E91E63" badge={`${summary.health_treatments} ${t('statistics.treatmentPlural')}`} />
              <View style={S.rowStats}>
                <RowStat label={t('statistics.sickBirds')} value={summary.sick_birds} color={summary.sick_birds > 0 ? theme.colors.warning : theme.colors.text} />
                <RowStat label={t('statistics.mortality')} value={summary.dead_birds} color={summary.dead_birds > 0 ? theme.colors.danger : theme.colors.text} />
                <RowStat label={t('statistics.recoveries')} value={summary.recovered_birds} color={theme.colors.success} />
              </View>
              {(summary.health_inventory || []).length > 0 && (
                <View style={S.inventoryList}>
                  <Text style={S.inventoryTitle}>{t('statistics.medicineStock')}</Text>
                  {(summary.health_inventory || []).map((item: any, i: number) => (
                    <View key={i} style={S.inventoryRow}>
                      <View style={S.inventoryDot} />
                      <Text style={S.inventoryName}>{item.product_name}</Text>
                      <Text style={S.inventoryQty}>{formatNumber(item.quantity)} {item.unit}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* ── FINANCE ── */}
            {userRole !== 'EMPLOYE' && (
              <>
                <Text style={S.groupLabel}>{t('statistics.finance')}</Text>
                <Card style={S.card}>
                  <SectionHeader icon="account-balance" title={t('statistics.revenueAndExpenses')} color={theme.colors.success} />
                  <View style={[S.profitBanner, { backgroundColor: (summary.revenues - summary.expenses) >= 0 ? theme.colors.success + '15' : theme.colors.danger + '15' }]}>
                    <Text style={S.profitLabel}>{t('statistics.netProfit')}</Text>
                    <Text style={[S.profitValue, { color: (summary.revenues - summary.expenses) >= 0 ? theme.colors.success : theme.colors.danger }]}>
                      {formatCurrency(summary.revenues - summary.expenses)}
                    </Text>
                  </View>
                  <View style={S.rowStats}>
                    <RowStat label={t('statistics.revenues')} value={formatCurrency(summary.revenues)} color={theme.colors.success} />
                    <RowStat label={t('statistics.expenses')} value={formatCurrency(summary.expenses)} color={theme.colors.danger} />
                    <RowStat label={t('statistics.feedingCost')} value={formatCurrency(summary.feeding_cost || 0)} />
                    <RowStat label={t('statistics.healthCost')} value={formatCurrency(summary.health_cost || 0)} />
                  </View>
                  {charts?.finance?.length > 0 && (
                    <BarChart
                      data={formatChartData(charts.finance)}
                      width={width - 72}
                      height={220}
                      chartConfig={{ ...chartCfg, color: (o = 1) => theme.colors.success }}
                      style={S.chart}
                      yAxisLabel=""
                      yAxisSuffix=""
                      fromZero
                      xLabelsOffset={-5}
                    />
                  )}
                </Card>
              </>
            )}

            {userRole === 'PROPRIETAIRE' && (
              <View style={{ marginTop: 20, alignItems: 'center' }}>
                <Button
                  title={t('statistics.exportGlobalReport')}
                  onPress={() => generateConsolidatedReport(stats, period, t, userRole)}
                  loading={exporting}
                  variant="primary"
                  style={{ width: '100%', height: 50 }}
                  leftIcon={<MaterialIcons name="picture-as-pdf" size={20} color={isDarkMode ? "#FFF" : "#000"} />}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12 }}>
                  <Button
                    title={t('statistics.excelProd')}
                    onPress={() => {}}
                    variant="outline"
                    style={{ width: '48%' }}
                    leftIcon={<MaterialCommunityIcons name="file-excel" size={20} color={theme.colors.text} />}
                  />
                  <Button
                    title={t('statistics.financePdf')}
                    onPress={() => generateConsolidatedFinancePDF({
                      revenues: summary.revenues,
                      expenses: summary.expenses,
                      sales: [],
                      expenses_list: [],
                      period: period
                    }, t)}
                    variant="outline"
                    style={{ width: '48%' }}
                    leftIcon={<MaterialIcons name="account-balance" size={20} color={theme.colors.text} />}
                  />
                </View>

                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 12 }}>
                  Les rapports utilisent les données filtrées à l'écran.
                </Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDarkMode: boolean, w: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center', ...theme.shadows.light },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  filterBar: { backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  chipSm: { paddingHorizontal: 10, paddingVertical: 5 },
  chipSmActive: { backgroundColor: theme.colors.primary + '30', borderColor: theme.colors.primary },
  chipTextSm: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '500' },
  chipTextSmActive: { color: theme.colors.primary, fontWeight: '700' },
  periodRow: { flexDirection: 'row', marginTop: 12, backgroundColor: theme.colors.background, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: theme.colors.border },
  periodTab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 10 },
  periodTabActive: { backgroundColor: theme.colors.surface, ...theme.shadows.light },
  periodTabText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  periodTabTextActive: { color: theme.colors.primary, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 60 },
  groupLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 1.2, marginBottom: 10, marginTop: 8, textTransform: 'uppercase' },
  card: { padding: 16, marginBottom: 16, borderRadius: 18, borderWidth: 0.5, borderColor: theme.colors.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { width: '48%', backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 12, borderWidth: 0.5, borderColor: theme.colors.border },
  statBoxIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statBoxValue: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  statBoxLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, textAlign: 'center', fontWeight: '600' },
  statBoxSub: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 2 },
  alertBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', borderRadius: 12, padding: 12, marginBottom: 14, gap: 8 },
  alertText: { fontSize: 13, color: '#E65100', fontWeight: '700' },
  rowStats: { gap: 4 },
  rowStat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border + '30' },
  rowStatLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '500', flex: 1 },
  rowStatValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  stockRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  stockItem: { flex: 1 },
  stockItemTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  stockItemValue: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  stockItemSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  stockDivider: { width: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
  inventoryList: { marginTop: 12, padding: 12, backgroundColor: theme.colors.background, borderRadius: 12 },
  inventoryTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 },
  inventoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  inventoryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E91E63', marginRight: 10 },
  inventoryName: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: '500' },
  inventoryQty: { fontSize: 13, color: '#E91E63', fontWeight: '700' },
  profitBanner: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  profitLabel: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  profitValue: { fontSize: 22, fontWeight: '800' },
  chart: { marginTop: 14, borderRadius: 12, marginLeft: -8, marginBottom: 8 },
});