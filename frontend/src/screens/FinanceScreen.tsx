import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Dimensions, Alert, useWindowDimensions, Platform } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { generateConsolidatedFinancePDF } from '../utils/reportGenerator';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { SalePaymentsModal } from '../components/SalePaymentsModal';

import { useBreakpoint } from '../hooks/useBreakpoint';

export const FinanceScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isTablet, isDesktop), [theme, isTablet, isDesktop]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [financeData, setFinanceData] = useState({
    revenues: 0,
    encaissements: 0,
    creances: 0,
    expenses: 0,
    transactions: [],
  });
  const [trend, setTrend] = useState(0);
  const [period, setPeriod] = useState('week');
  const [chartData, setChartData] = useState<any>(null);
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
    { key: 'year', label: t('common.year') }
  ], [t]);

  const fetchData = async () => {
    try {
      setLoadingFilters(true);
      const backendPeriod = period;

      // Charger fermes et lots pour le filtre
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

      const params: any = { period: backendPeriod };
      if (selectedFarm) params.farm = selectedFarm;
      if (selectedLot) params.lot = selectedLot;

      const res = await repositoryProvider.api.get('/farms/statistics/', { params }).catch(() => ({
        data: {
          summary: { revenues: 0, expenses: 0, revenue_trend: 0, farms_count: 0, lots_count: 0, total_chickens: 0, today_production: 0, alerts_count: 0, performance: 0, total_bonuses: 0, employees_with_bonuses: 0 },
          charts: { sales: [], expenses: [] },
          recent_transactions: []
        }
      }));
      const { summary, charts, recent_transactions } = res.data;

      setTrend(summary.revenue_trend || 0);

      // Map backend transactions to frontend format
      const combined = (recent_transactions || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        amount: t.amount,
        date: t.date,
        type: t.type,
        status: t.status
      }));

      setFinanceData({
        revenues: summary.revenues,
        encaissements: summary.encaissements || 0,
        creances: summary.creances || 0,
        expenses: summary.expenses,
        transactions: combined,
      });

      // Handle chart data
      processChartData(charts, period);

      // Liste des créances client (ventes non soldées) pour l'encaissement direct
      try {
        const salesRes = await repositoryProvider.api.get('/sales/');
        let rawSales: any = salesRes.data;
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openPayments = (sale: any) => {
    setPaymentTarget(sale);
    setPaymentsModalVisible(true);
  };

  const processChartData = (charts: any, selectedPeriod: string) => {
    if (!charts || !charts.sales || !charts.expenses) return;

    let labels: string[] = [];
    let values: number[] = [];

    if (selectedPeriod === 'day') {
      // Map backend 'Matin', 'Midi', 'Soir' to translations
      labels = (charts.sales || []).map((s: any) => {
        if (s.label === 'Matin') return t('common.morning');
        if (s.label === 'Midi') return t('common.noon');
        if (s.label === 'Soir') return t('common.evening');
        return s.label;
      });

      values = (charts.sales || []).map((s: any, idx: number) => {
        const expVal = (charts.expenses && charts.expenses[idx]) ? charts.expenses[idx].value : 0;
        return (s.value || 0) - expVal;
      });
    } else {
      // Use balance (revenues - expenses) from backend series
      const salesMap = new Map<string, number>(charts.sales.map((s: any) => [s.day, s.value] as [string, number]));
      const expMap = new Map<string, number>(charts.expenses.map((e: any) => [e.day, e.value] as [string, number]));

      // Combine all unique days
      const allDays = Array.from(new Set<string>([...salesMap.keys(), ...expMap.keys()])).sort();

      if (allDays.length === 0) {
        setChartData({ labels: [t('common.noData')], datasets: [{ data: [0] }], isPlaceholder: true });
        return;
      }

      labels = allDays.map(day => {
          const date = new Date(day);
          if (selectedPeriod === 'week') {
              const days = [t('days.sun'), t('days.mon'), t('days.tue'), t('days.wed'), t('days.thu'), t('days.fri'), t('days.sat')];
              return days[date.getDay()];
          } else if (selectedPeriod === 'month' || selectedPeriod === 'quarter') {
              return date.getDate().toString();
          } else if (selectedPeriod === 'year') {
              const months = [t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'), t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'), t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec')];
              return months[date.getMonth()];
          }
          return day;
      });

      values = allDays.map(day => (salesMap.get(day) || 0) - (expMap.get(day) || 0));
    }

    const hasData = values.some(v => v !== 0);
    setChartData({ labels, datasets: [{ data: hasData ? values : [0] }], isPlaceholder: !hasData });
  };

  useEffect(() => {
    fetchData();
  }, [period, selectedFarm, selectedLot]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const handleExportPDF = async () => {
    console.log('[TEST SOLFERME] EXPORT FINANCE CLICK');
    try {
      setLoading(true);
      // We might need full list for PDF, let's fetch it if necessary or use statistics summary
      const salesRes = await repositoryProvider.api.get('/sales/');
      const expensesRes = await repositoryProvider.api.get('/expenses/');

      await generateConsolidatedFinancePDF({
        revenues: financeData.revenues,
        expenses: financeData.expenses,
        sales: salesRes.data.filter((s: any) => s.status !== 'ANNULEE'),
        expenses_list: expensesRes.data.filter((e: any) => e.status !== 'ANNULEE'),
        period: period
      }, t);
    } catch (error) {
      console.error('[TEST SOLFERME] EXPORT FINANCE ERROR:', error);
      Alert.alert(t('common.error'), t('sales.pdfError'));
    } finally {
      setLoading(false);
    }
  };

  const benefice = financeData.revenues - financeData.expenses;

  const { width: windowWidth } = useWindowDimensions();
  const getChartWidth = () => {
    if (Platform.OS !== 'web') return windowWidth - theme.spacing.m * 4;
    
    const hasSidebar = isDesktop || isTablet;
    const availableWidth = hasSidebar ? windowWidth - 280 : windowWidth;
    const containerWidth = Math.min(availableWidth, isDesktop || isTablet ? 1200 : 9999);
    const padding = theme.spacing.m * 2;
    return containerWidth - padding;
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('finance.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('finance.tracking')}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={[styles.addTransactionBtn, { backgroundColor: theme.colors.surface, marginRight: 8 }]} onPress={() => navigation.navigate('AddExpense')}>
             <MaterialIcons name="add" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          {userRole === 'PROPRIETAIRE' && (
            <TouchableOpacity style={[styles.addTransactionBtn, { backgroundColor: theme.colors.surface }]} onPress={handleExportPDF}>
               <MaterialIcons name="picture-as-pdf" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {/* Filtre par ferme / lot — même logique que le Dashboard (Ferme -> Lot) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, selectedFarm === null && styles.activeChip]}
            onPress={() => { setSelectedFarm(null); setSelectedLot(null); }}
          >
            <Text style={[styles.filterChipText, selectedFarm === null && styles.activeChipText]}>{t('common.allFarms')}</Text>
          </TouchableOpacity>
          {farms.map((f: any) => (
            <TouchableOpacity
              key={`farm-${f.id}`}
              style={[styles.filterChip, selectedFarm === f.id && styles.activeChip]}
              onPress={() => { setSelectedFarm(selectedFarm === f.id ? null : f.id); setSelectedLot(null); }}
            >
              <Text style={[styles.filterChipText, selectedFarm === f.id && styles.activeChipText]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* La ligne des lots n'apparaît QUE lorsqu'une ferme précise est
            sélectionnée (comme le Dashboard) — sinon on n'affiche que les fermes. */}
        {selectedFarm !== null && lots.filter((l: any) => Number(l.farm) === selectedFarm).length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.filterChip, selectedLot === null && styles.activeChip]}
              onPress={() => setSelectedLot(null)}
            >
              <Text style={[styles.filterChipText, selectedLot === null && styles.activeChipText]}>{t('common.allLots')}</Text>
            </TouchableOpacity>
            {lots.filter((l: any) => Number(l.farm) === selectedFarm).map((l: any) => (
              <TouchableOpacity
                key={`lot-${l.id}`}
                style={[styles.filterChip, selectedLot === l.id && styles.activeChip]}
                onPress={() => setSelectedLot(selectedLot === l.id ? null : l.id)}
              >
                <Text style={[styles.filterChipText, selectedLot === l.id && styles.activeChipText]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {loadingFilters && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginBottom: 8 }} />
        )}

        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('finance.netProfit')}</Text>
          <Text style={[styles.balanceValue, { color: benefice >= 0 ? theme.colors.text : theme.colors.danger }]}>
            {formatCurrency(benefice)}
          </Text>
          <View style={styles.balanceTrend}>
             <MaterialIcons name={trend >= 0 ? "arrow-upward" : "arrow-downward"} size={16} color={trend >= 0 ? theme.colors.success : theme.colors.danger} />
             <Text style={[styles.trendText, {color: trend >= 0 ? theme.colors.success : theme.colors.danger}]}>
                {t('finance.trendMonth', { count: trend })}
             </Text>
          </View>
        </Card>

        <View style={styles.topCards}>
          <Card style={styles.miniCard}>
            <View style={styles.miniCardHeader}>
              <MaterialIcons name="point-of-sale" size={16} color={theme.colors.success} />
              <Text style={styles.miniCardLabel}>Chiffre d'Affaires</Text>
            </View>
            <Text style={[styles.miniCardValue, { color: theme.colors.success }]}>{formatNumber(financeData.revenues)}</Text>
          </Card>

          <Card style={styles.miniCard}>
            <View style={styles.miniCardHeader}>
              <MaterialIcons name="account-balance-wallet" size={16} color={theme.colors.success} />
              <Text style={styles.miniCardLabel}>Encaissements</Text>
            </View>
            <Text style={[styles.miniCardValue, { color: theme.colors.success }]}>{formatNumber(financeData.encaissements)}</Text>
          </Card>

          {isDesktop && (
            <>
              <Card style={styles.miniCard}>
                <View style={styles.miniCardHeader}>
                  <MaterialIcons name="hourglass-empty" size={16} color={theme.colors.warning || '#f57c00'} />
                  <Text style={styles.miniCardLabel}>Créances</Text>
                </View>
                <Text style={[styles.miniCardValue, { color: theme.colors.warning || '#f57c00' }]}>{formatNumber(financeData.creances)}</Text>
              </Card>

              <Card style={styles.miniCard}>
                <View style={styles.miniCardHeader}>
                  <MaterialIcons name="arrow-upward" size={16} color={theme.colors.danger} />
                  <Text style={styles.miniCardLabel}>{t('finance.expenses')}</Text>
                </View>
                <Text style={[styles.miniCardValue, { color: theme.colors.danger }]}>{formatNumber(financeData.expenses)}</Text>
              </Card>
            </>
          )}
        </View>

        {!isDesktop && (
          <View style={styles.topCards}>
            <Card style={styles.miniCard}>
              <View style={styles.miniCardHeader}>
                <MaterialIcons name="hourglass-empty" size={16} color={theme.colors.warning || '#f57c00'} />
                <Text style={styles.miniCardLabel}>Créances</Text>
              </View>
              <Text style={[styles.miniCardValue, { color: theme.colors.warning || '#f57c00' }]}>{formatNumber(financeData.creances)}</Text>
            </Card>

            <Card style={styles.miniCard}>
              <View style={styles.miniCardHeader}>
                <MaterialIcons name="arrow-upward" size={16} color={theme.colors.danger} />
                <Text style={styles.miniCardLabel}>{t('finance.expenses')}</Text>
              </View>
              <Text style={[styles.miniCardValue, { color: theme.colors.danger }]}>{formatNumber(financeData.expenses)}</Text>
            </Card>
          </View>
        )}

        {receivables.length > 0 && (
          <View style={styles.transactionsHeader}>
            <Text style={styles.sectionTitle}>Créances Client (Crédit)</Text>
          </View>
        )}
        {isDesktop && receivables.length > 0 ? (
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Client</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Versé / Total</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Reste</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Action</Text>
            </View>
            {receivables.slice(0, 8).map((r: any) => (
              <View key={`rec-${r.id}`} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '700' }]}>{r.customer_name || t('common.anonymous')}</Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>
                  {`${formatCurrency(r.amount_paid)} / ${formatCurrency(r.total_amount)}`}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, color: theme.colors.warning || '#f57c00', fontWeight: '800' }]}>
                  {formatCurrency(r.reste)}
                </Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={[styles.encaisseBtn, { backgroundColor: theme.colors.success, paddingVertical: 4 }]}
                    onPress={() => openPayments(r)}
                  >
                    <MaterialIcons name="point-of-sale" size={14} color="#fff" />
                    <Text style={[styles.encaisseBtnText, { fontSize: 11 }]}>Encaisser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          receivables.slice(0, 5).map((r: any) => (
            <Card key={`rec-${r.id}`} style={[styles.transactionCard, { marginBottom: 8 }]}>
              <View style={[styles.transactionIconCircle, { backgroundColor: theme.colors.warning || '#f57c00' }]}>
                <MaterialIcons name="account-balance-wallet" size={20} color="#000" />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionTitle}>{r.customer_name || t('common.anonymous')}</Text>
                <Text style={styles.transactionDate}>
                  {`${t('finance.amountVersed')} : ${formatCurrency(r.amount_paid)} / ${formatCurrency(r.total_amount)}`}
                </Text>
                <Text style={[styles.transactionDate, { color: theme.colors.warning || '#f57c00', fontWeight: '700' }]}>
                  {`Reste : ${formatCurrency(r.reste)}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.encaisseBtn, { backgroundColor: theme.colors.success }]}
                onPress={() => openPayments(r)}
              >
                <MaterialIcons name="point-of-sale" size={16} color="#fff" />
                <Text style={styles.encaisseBtnText}>Encaisser</Text>
              </TouchableOpacity>
            </Card>
          ))
        )}

        <Card style={styles.chartCard}>
           <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>{t('finance.cashFlow')}</Text>
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

           {chartData && chartData.datasets[0].data.length > 0 ? (
               <LineChart
                data={chartData}
                width={chartWidth}
                height={180}
                yAxisLabel=""
                yAxisSuffix=""
                formatYLabel={(yValue) => {
                  const val = parseFloat(yValue);
                  if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                  if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
                  return val.toString();
                }}
                chartConfig={{
                  backgroundColor: theme.colors.surface,
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => isDarkMode ? `rgba(249, 215, 96, ${opacity})` : `rgba(249, 215, 96, ${opacity})`,
                  labelColor: (opacity = 1) => theme.colors.text,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "4", strokeWidth: "2", stroke: theme.colors.primary }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
           ) : (
             <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                {loading ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={{ color: theme.colors.textSecondary }}>{t('common.noData')}</Text>}
             </View>
           )}
        </Card>

        <View style={styles.transactionsHeader}>
           <Text style={styles.sectionTitle}>{t('finance.recentTransactions')}</Text>
           <TouchableOpacity onPress={() => navigation.navigate('TransactionsHistory')}><Text style={styles.seeAll}>{t('finance.seeAll')}</Text></TouchableOpacity>
        </View>

        {isDesktop ? (
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: 40 }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>{t('common.title')}</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>{t('common.date')}</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>{t('common.amount')}</Text>
            </View>
            {financeData.transactions.slice(0, 10).map((transaction: any) => {
               const isCancelled = transaction.status === 'ANNULEE';
               return (
                <View key={transaction.id} style={[styles.tableRow, isCancelled && { opacity: 0.6, backgroundColor: theme.colors.background }]}>
                  <View style={{ width: 40 }}>
                    <MaterialIcons
                      name={transaction.type === 'income' ? 'add-shopping-cart' : 'payments'}
                      size={18}
                      color={isCancelled ? theme.colors.textSecondary : (transaction.type === 'income' ? theme.colors.success : theme.colors.danger)}
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.tableCellText, { fontWeight: '700' }, isCancelled && { textDecorationLine: 'line-through', color: theme.colors.textSecondary }]}>
                        {transaction.title}
                      </Text>
                      {isCancelled && (
                        <View style={styles.cancelledBadge}>
                           <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {new Date(transaction.date).toLocaleDateString(t('common.dateLocale'))}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: '800', color: isCancelled ? theme.colors.textSecondary : (transaction.type === 'income' ? theme.colors.success : theme.colors.danger) }]}>
                    {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount)}
                  </Text>
                </View>
               );
            })}
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {financeData.transactions.slice(0, 3).map((transaction: any) => (
                <Card key={transaction.id} style={[styles.transactionCard, transaction.status === 'ANNULEE' && { opacity: 0.6, backgroundColor: theme.colors.background }]}>
                  <View style={[styles.transactionIconCircle, transaction.status === 'ANNULEE' && { borderColor: theme.colors.textSecondary, backgroundColor: 'transparent' }]}>
                      <MaterialIcons
                        name={transaction.type === 'income' ? 'add-shopping-cart' : 'payments'}
                        size={20}
                        color={transaction.status === 'ANNULEE' ? theme.colors.textSecondary : (transaction.type === 'income' ? theme.colors.success : theme.colors.danger)}
                      />
                  </View>
                  <View style={styles.transactionInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.transactionTitle, transaction.status === 'ANNULEE' && { textDecorationLine: 'line-through', color: theme.colors.textSecondary }]}>{transaction.title}</Text>
                        {transaction.status === 'ANNULEE' && (
                          <View style={styles.cancelledBadge}>
                            <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.transactionDate}>{new Date(transaction.date).toLocaleDateString(t('common.dateLocale'))}</Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: transaction.status === 'ANNULEE' ? theme.colors.textSecondary : (transaction.type === 'income' ? theme.colors.success : theme.colors.danger) }]}>
                      {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount)}
                  </Text>
                </Card>
            ))}
          </View>
        )}
      </ScrollView>

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
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isTablet: boolean, isDesktop: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    marginBottom: theme.spacing.s,
    maxWidth: (isDesktop || isTablet) ? 1000 : '100%',
    alignSelf: (isDesktop || isTablet) ? 'center' : 'auto',
    width: '100%'
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  addTransactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000000',
    ...theme.shadows.light,
  },
  scroll: {
    padding: theme.spacing.m,
    paddingBottom: 40,
    maxWidth: (isDesktop || isTablet) ? 1000 : '100%',
    alignSelf: (isDesktop || isTablet) ? 'center' : 'auto',
    width: '100%'
  },
  balanceCard: {
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: '#000000',
    marginBottom: theme.spacing.m,
    width: isDesktop ? '100%' : '100%',
  },
  balanceLabel: { fontSize: 13, color: '#000000', opacity: 0.8, fontWeight: '900', textTransform: 'uppercase' },
  balanceValue: { fontSize: 28, fontWeight: '900', marginVertical: 8, color: '#000000' },
  balanceTrend: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 12, fontWeight: '900', marginLeft: 4 },
  topCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.m,
  },
  miniCard: {
    width: isDesktop ? '24%' : (isTablet ? '48.5%' : '48%'),
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: theme.colors.surface
  },
  miniCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniCardLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '900',
    marginLeft: 4,
    textTransform: 'uppercase'
  },
  miniCardValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  chartCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: theme.colors.surface
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'uppercase',
    flexShrink: 1,
    marginRight: 8,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#000000',
  },
  periodItem: {
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: 'transparent',
  },
  periodActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  periodText: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700'
  },
  periodTextActive: {
    fontSize: 9,
    color: theme.colors.text,
    fontWeight: '900',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'uppercase'
  },
  seeAll: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  transactionsList: {
    gap: theme.spacing.s,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    width: isDesktop ? '32.5%' : (isTablet ? '49%' : '100%'),
    backgroundColor: theme.colors.surface
  },
  transactionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
    borderWidth: 1,
    borderColor: '#000000',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },
  transactionDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    fontWeight: '600'
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  tableContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    overflow: 'hidden',
    marginBottom: theme.spacing.m,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary + '15',
    padding: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: theme.spacing.m,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 14,
    color: theme.colors.text,
  },
  tableCellText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  cancelledBadge: {
    backgroundColor: '#ffcdd2',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6
  },
  cancelledText: {
    color: '#c62828',
    fontSize: 8,
    fontWeight: 'bold'
  },
  encaisseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8,
  },
  encaisseBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 4,
  },
  filterScroll: {
    paddingBottom: 8,
    paddingRight: 8,
    ...(isDesktop ? { flexDirection: 'row', flexWrap: 'wrap' } : {})
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  activeChipText: {
    color: '#fff',
    fontWeight: 'bold',
  }
});