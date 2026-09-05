import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { generateConsolidatedFinancePDF } from '../utils/reportGenerator';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { SalePaymentsModal } from '../components/SalePaymentsModal';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Screen, ScreenHeader, Card, SectionHeader, StatTile, Chip, Badge, space, radius, shadow } from '../components/ui';
import { ChartCard, GroupedBarChart, BarChart, fmtCompact } from '../components/charts';
import { useChartTheme } from '../components/charts/useChartTheme';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const FinanceScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isDesktopOrTablet } = useBreakpoint();
  const chartC = useChartTheme();
  const S = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [financeData, setFinanceData] = useState({ revenues: 0, encaissements: 0, creances: 0, expenses: 0, transactions: [] as any[] });
  const [trend, setTrend] = useState(0);
  const [period, setPeriod] = useState('week');
  const [rawCharts, setRawCharts] = useState<any>(null);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [paymentsModalVisible, setPaymentsModalVisible] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const periods = useMemo(() => [
    { key: 'day', label: t('common.day') },
    { key: 'week', label: t('common.week') },
    { key: 'month', label: t('common.month') },
    { key: 'quarter', label: t('common.quarter') },
    { key: 'year', label: t('common.year') },
  ], [t]);

  const fetchData = async () => {
    try {
      setLoadingFilters(true);
      try {
        const [farmsRes, lotsRes] = await Promise.all([
          repositoryProvider.api.get('/farms/').catch(() => ({ data: [] })),
          repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
        ]);
        const fList: any = farmsRes.data;
        setFarms(Array.isArray(fList) ? fList : (fList?.results || []));
        const lList: any = lotsRes.data;
        setLots(Array.isArray(lList) ? lList : (lList?.results || []));
      } catch (fe: any) {
        console.warn('Impossible de charger les filtres ferme/lot:', fe?.message);
      }

      const params: any = { period };
      // Ne filtrer que par des id SERVEUR (positifs). Une ferme/un lot créé
      // hors-ligne (id négatif) ferait échouer /farms/statistics/.
      if (selectedFarm && selectedFarm > 0) params.farm = selectedFarm;
      if (selectedLot && selectedLot > 0) params.lot = selectedLot;

      const res = await repositoryProvider.api.get('/farms/statistics/', { params }).catch(() => ({
        data: {
          summary: { revenues: 0, expenses: 0, revenue_trend: 0 },
          charts: { sales: [], expenses: [] },
          recent_transactions: [],
        },
      }));
      // 🔧 Défensif : selon la source (serveur / calcul local / repli), la forme
      // peut varier. On ne laisse jamais un `summary` manquant casser l'écran.
      const data = (res && res.data) || {};
      const summary = data.summary || {};
      const charts = data.charts || null;
      const recent_transactions = data.recent_transactions || [];

      setTrend(summary.revenue_trend || 0);
      setRawCharts(charts);

      const combined = (recent_transactions || []).map((tr: any) => ({
        id: tr.id, title: tr.title, amount: tr.amount, date: tr.date, type: tr.type, status: tr.status,
      }));
      setFinanceData({
        revenues: summary.revenues || 0,
        encaissements: summary.encaissements || 0,
        creances: summary.creances || 0,
        expenses: summary.expenses || 0,
        transactions: combined,
      });

      try {
        const salesRes = await repositoryProvider.api.get('/sales/');
        const rawSales: any = salesRes.data;
        let salesList = Array.isArray(rawSales) ? rawSales : (rawSales?.results || []);
        if (selectedFarm) salesList = salesList.filter((s: any) => Number(s.farm) === selectedFarm);
        if (selectedLot) salesList = salesList.filter((s: any) => Number(s.lot) === selectedLot);
        const rec = salesList
          .filter((s: any) => s.status !== 'ANNULEE' && (parseFloat(s.total_amount) - parseFloat(s.amount_paid)) > 0)
          .map((s: any) => ({ ...s, reste: parseFloat(s.total_amount) - parseFloat(s.amount_paid) }));
        setReceivables(rec);
      } catch (e: any) {
        console.warn('Impossible de récupérer les créances:', e?.message);
      }
    } catch (error) {
      console.error('Error fetching finance data:', error);
      Alert.alert(t('common.error'), t('finance.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingFilters(false);
    }
  };

  useEffect(() => { fetchData(); }, [period, selectedFarm, selectedLot]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchData());
    return unsub;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };
  const openPayments = (sale: any) => { setPaymentTarget(sale); setPaymentsModalVisible(true); };

  const handleExportPDF = async () => {
    try {
      setLoading(true);
      const salesRes = await repositoryProvider.api.get('/sales/');
      const expensesRes = await repositoryProvider.api.get('/expenses/');
      await generateConsolidatedFinancePDF({
        revenues: financeData.revenues,
        expenses: financeData.expenses,
        sales: salesRes.data.filter((s: any) => s.status !== 'ANNULEE'),
        expenses_list: expensesRes.data.filter((e: any) => e.status !== 'ANNULEE'),
        period,
      }, t);
    } catch (error) {
      Alert.alert(t('common.error'), t('sales.pdfError'));
    } finally {
      setLoading(false);
    }
  };

  const benefice = financeData.revenues - financeData.expenses;

  /** Aligne charts.sales / charts.expenses sur des labels lisibles. */
  const financeSeries = useMemo(() => {
    const c = rawCharts;
    if (!c || !c.sales) return null;
    const labelFor = (item: any): string => {
      if (item.label) {
        if (item.label === 'Matin') return t('common.morning');
        if (item.label === 'Midi') return t('common.noon');
        if (item.label === 'Soir') return t('common.evening');
        return item.label;
      }
      const d = new Date(item.day);
      if (period === 'week') return t(`days.${DAYS[d.getDay()]}`);
      if (period === 'year') return t(`months.${MONTHS[d.getMonth()]}`);
      return String(d.getDate());
    };
    const salesMap = new Map<string, number>();
    const expMap = new Map<string, number>();
    (c.sales || []).forEach((s: any) => salesMap.set(labelFor(s), (salesMap.get(labelFor(s)) || 0) + (s.value || 0)));
    (c.expenses || []).forEach((e: any) => expMap.set(labelFor(e), (expMap.get(labelFor(e)) || 0) + (e.value || 0)));
    const labels = Array.from(new Set([...(c.sales || []).map(labelFor), ...(c.expenses || []).map(labelFor)]));
    const groups = labels.map((l) => ({ label: l, values: [salesMap.get(l) || 0, expMap.get(l) || 0] as [number, number] }));
    const hasData = groups.some((g) => g.values[0] || g.values[1]);
    return hasData ? groups : null;
  }, [rawCharts, period, t]);

  if (loading) {
    return (
      <Screen><View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View></Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <ScreenHeader
          title={t('finance.title')}
          subtitle={t('finance.tracking')}
          large
          actions={[
            { icon: 'add', onPress: () => navigation.navigate('AddExpense'), tint: theme.colors.text },
            ...(userRole === 'PROPRIETAIRE' ? [{ icon: 'picture-as-pdf' as const, onPress: handleExportPDF, tint: theme.colors.primary }] : []),
          ]}
        />
      }
    >
      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        <Chip label={t('common.allFarms')} icon="home-group" active={selectedFarm === null} onPress={() => { setSelectedFarm(null); setSelectedLot(null); }} />
        {farms.map((f: any) => (
          <Chip key={f.id} label={f.name} active={selectedFarm === f.id} onPress={() => { setSelectedFarm(selectedFarm === f.id ? null : f.id); setSelectedLot(null); }} />
        ))}
      </ScrollView>
      {selectedFarm !== null && lots.filter((l: any) => Number(l.farm) === selectedFarm).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={[S.chipRow, { paddingTop: 0 }]}>
          <Chip label={t('common.allLots')} active={selectedLot === null} onPress={() => setSelectedLot(null)} />
          {lots.filter((l: any) => Number(l.farm) === selectedFarm).map((l: any) => (
            <Chip key={l.id} label={l.name} active={selectedLot === l.id} onPress={() => setSelectedLot(selectedLot === l.id ? null : l.id)} />
          ))}
        </ScrollView>
      )}
      {loadingFilters && <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginBottom: 8 }} />}

      {/* Bénéfice net */}
      <View style={[S.balance, { backgroundColor: theme.colors.primary }]}>
        <Text style={S.balanceLabel}>{t('finance.netProfit')}</Text>
        <Text style={[S.balanceValue, { color: benefice >= 0 ? '#1A1A1A' : '#7f1d1d' }]}>{formatCurrency(benefice)}</Text>
        <View style={S.balanceTrend}>
          <MaterialIcons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={15} color="#1A1A1A" />
          <Text style={S.trendText}>{t('finance.trendMonth', { count: trend })}</Text>
        </View>
      </View>

      {/* Cartes */}
      <View style={S.grid}>
        <StatTile label="Chiffre d'affaires" value={formatCurrency(financeData.revenues)} icon="cash-multiple" accent="#00897B" />
        <StatTile label="Encaissements" value={formatCurrency(financeData.encaissements)} icon="wallet" accent="#1E88E5" />
        <StatTile label="Créances" value={formatCurrency(financeData.creances)} icon="timer-sand" accent="#F57C00" />
        <StatTile label={t('finance.expenses')} value={formatCurrency(financeData.expenses)} icon="arrow-up-bold" accent="#D84315" />
      </View>

      {/* Graphique flux de trésorerie */}
      <ChartCard
        title={t('finance.cashFlow')}
        legend={[{ label: t('statistics.revenues'), color: chartC.income }, { label: t('finance.expenses'), color: chartC.expense }]}
        height={210}
        empty={!financeSeries}
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
        {(w) => financeSeries
          ? <GroupedBarChart width={w} height={210} groups={financeSeries} colors={[chartC.income, chartC.expense]} formatValue={fmtCompact} />
          : <BarChart width={w} height={210} data={[]} />}
      </ChartCard>

      {/* Créances client */}
      {receivables.length > 0 && (
        <>
          <SectionHeader title="Créances client" icon="account-cash-outline" />
          {isDesktop ? (
            <Card padding={0}>
              <View style={[S.thead, { borderBottomColor: theme.colors.border }]}>
                <Text style={[S.th, { flex: 2 }]}>Client</Text>
                <Text style={[S.th, { flex: 2 }]}>Versé / Total</Text>
                <Text style={[S.th, { flex: 1 }]}>Reste</Text>
                <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>Action</Text>
              </View>
              {receivables.slice(0, 8).map((r: any) => (
                <View key={`rec-${r.id}`} style={[S.tr, { borderBottomColor: theme.colors.border }]}>
                  <Text style={[S.td, { flex: 2, fontWeight: '700', color: theme.colors.text }]}>{r.customer_name || t('common.anonymous')}</Text>
                  <Text style={[S.td, { flex: 2 }]}>{`${formatCurrency(r.amount_paid)} / ${formatCurrency(r.total_amount)}`}</Text>
                  <Text style={[S.td, { flex: 1, color: '#F57C00', fontWeight: '800' }]}>{formatCurrency(r.reste)}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Pressable style={S.encaisse} onPress={() => openPayments(r)}>
                      <MaterialIcons name="add-card" size={14} color="#fff" />
                      <Text style={S.encaisseText}>Encaisser</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            receivables.slice(0, 5).map((r: any) => (
              <Card key={`rec-${r.id}`} style={S.row} padding={space.sm}>
                <View style={[S.rowIcon, { backgroundColor: '#F57C001F' }]}>
                  <MaterialIcons name="account-balance-wallet" size={18} color="#F57C00" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[S.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>{r.customer_name || t('common.anonymous')}</Text>
                  <Text style={[S.rowSub, { color: theme.colors.textSecondary }]}>
                    {`${formatCurrency(r.amount_paid)} / ${formatCurrency(r.total_amount)}`}
                  </Text>
                  <Text style={[S.rowSub, { color: '#F57C00', fontWeight: '800' }]}>Reste : {formatCurrency(r.reste)}</Text>
                </View>
                <Pressable style={S.encaisse} onPress={() => openPayments(r)}>
                  <MaterialIcons name="add-card" size={15} color="#fff" />
                  <Text style={S.encaisseText}>Encaisser</Text>
                </Pressable>
              </Card>
            ))
          )}
        </>
      )}

      {/* Transactions récentes */}
      <SectionHeader title={t('finance.recentTransactions')} icon="swap-vertical"
        action={{ label: t('finance.seeAll'), onPress: () => navigation.navigate('TransactionsHistory') }} />
      {financeData.transactions.slice(0, isDesktopOrTablet ? 10 : 4).map((tr: any) => {
        const cancelled = tr.status === 'ANNULEE';
        const income = tr.type === 'income';
        const col = cancelled ? theme.colors.textSecondary : income ? '#00897B' : '#D84315';
        return (
          <Card key={tr.id} style={[S.row, cancelled && { opacity: 0.6 }]} padding={space.sm}>
            <View style={[S.rowIcon, { backgroundColor: col + '1F' }]}>
              <MaterialIcons name={income ? 'south-west' : 'north-east'} size={18} color={col} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[S.rowTitle, { color: theme.colors.text }, cancelled && { textDecorationLine: 'line-through', color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {tr.title}
                </Text>
                {cancelled && <Badge label={t('common.cancelled')} color={theme.colors.textSecondary} />}
              </View>
              <Text style={[S.rowSub, { color: theme.colors.textSecondary }]}>
                {new Date(tr.date).toLocaleDateString(t('common.dateLocale'))}
              </Text>
            </View>
            <Text style={[S.amount, { color: col }]}>
              {tr.amount > 0 ? '+' : ''}{formatNumber(tr.amount)}
            </Text>
          </Card>
        );
      })}

      {paymentTarget && (
        <SalePaymentsModal
          visible={paymentsModalVisible}
          onClose={() => setPaymentsModalVisible(false)}
          saleId={paymentTarget.id}
          lotId={paymentTarget.lot}
          farmId={paymentTarget.farm}
          totalAmount={parseFloat(paymentTarget.total_amount)}
          onPaymentAdded={() => fetchData()}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: space.sm, alignItems: 'center' },
  periodRow: { flexDirection: 'row', gap: 6, marginTop: space.sm },

  balance: { borderRadius: radius.xl, padding: space.lg, marginBottom: space.md, ...(shadow.sm as any) },
  balanceLabel: { fontSize: 12, fontWeight: '900', color: '#1A1A1A', opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 28, fontWeight: '900', marginVertical: 8 },
  balanceTrend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 12, fontWeight: '800', color: '#1A1A1A' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xs },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12.5, marginTop: 1 },
  amount: { fontSize: 14.5, fontWeight: '800' },

  encaisse: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2E7D32', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  encaisseText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  thead: { flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  td: { fontSize: 13, color: theme.colors.textSecondary },
});
