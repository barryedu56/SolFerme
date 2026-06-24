import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Dimensions, Alert, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { apiClient, fetchAll } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { generateConsolidatedFinancePDF } from '../utils/reportGenerator';
import { formatNumber, formatCurrency } from '../utils/formatters';

export const FinanceScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [financeData, setFinanceData] = useState({
    revenues: 0,
    expenses: 0,
    transactions: [],
  });
  const [trend, setTrend] = useState(0);
  const [period, setPeriod] = useState('Semaine');
  const [rawSales, setRawSales] = useState<any[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const periods = ['Jour', 'Semaine', 'Mois', 'Trimestre', 'Année'];

  const fetchData = async () => {
    try {
      const [sales, expenses, lots, feedPurchases, healthPurchases] = await Promise.all([
        fetchAll('/sales/').catch(() => []),
        fetchAll('/expenses/').catch(() => []),
        fetchAll('/lots/').catch(() => []),
        apiClient.get('/feed-purchases/').then(res => res.data).catch(() => []),
        apiClient.get('/health-purchases/').then(res => res.data).catch(() => []),
      ]);

      setRawSales(sales);
      // On combine les dépenses générales avec les achats
      const allExpenses = [
        ...expenses,
        ...feedPurchases.map((p: any) => ({ ...p, description: `Achat ${p.feed_type}`, amount: p.total_price })),
        ...healthPurchases.map((p: any) => ({ ...p, description: `Achat ${p.product_name}`, amount: p.total_price })),
      ];
      setRawExpenses(allExpenses);

      const totalRev = sales.reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);

      const totalExp = allExpenses.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0) +
                       lots.reduce((sum: number, l: any) => sum + parseFloat(l.purchase_price || 0), 0);

      // Calcul tendance
      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      const thisMonthSales = sales.filter((s: any) => new Date(s.date) >= thisMonthStart).reduce((sum, s) => sum + parseFloat(s.amount_paid || 0), 0);
      const lastMonthSales = sales.filter((s: any) => new Date(s.date) >= lastMonthStart && new Date(s.date) < thisMonthStart).reduce((sum, s) => sum + parseFloat(s.amount_paid || 0), 0);

      let calcTrend = 0;
      if (lastMonthSales > 0) calcTrend = ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100;
      else if (thisMonthSales > 0) calcTrend = 100;
      setTrend(Math.round(calcTrend));

      // Transactions récentes
      const combined = [
        ...sales.map(s => ({ id: `s-${s.id}`, title: s.customer_name || 'Vente', amount: parseFloat(s.amount_paid), date: s.date, type: 'income' })),
        ...allExpenses.map(e => ({ id: `e-${e.id}`, title: e.description, amount: -parseFloat(e.amount), date: e.date, type: 'expense' })),
        ...lots.map(l => ({ id: `l-${l.id}`, title: `Achat Lot: ${l.name}`, amount: -parseFloat(l.purchase_price), date: l.purchase_date, type: 'expense' })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

      setFinanceData({
        revenues: totalRev,
        expenses: totalExp,
        transactions: combined as any,
      });

    } catch (error) {
      console.error('Error fetching finance data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données financières');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (rawSales.length === 0 && rawExpenses.length === 0) {
      setChartData({ labels: ['Aucune donnée'], datasets: [{ data: [0] }], isPlaceholder: true });
      return;
    }

    let labels: string[] = [];
    let values: number[] = [];

    const getBalance = (start: Date, end: Date) => {
      const daySales = rawSales.filter((s: any) => {
        const d = new Date(s.date);
        return d >= start && d <= end;
      }).reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid), 0);

      const dayExpenses = rawExpenses.filter((e: any) => {
        const d = new Date(e.date);
        return d >= start && d <= end;
      }).reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);

      return daySales - dayExpenses;
    };

    if (period === 'Jour') {
      labels = ['Matin', 'Midi', 'Soir'];
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
      values = [getBalance(todayStart, todayEnd), 0, 0];
    } else if (period === 'Semaine') {
      const days = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      labels = last7Days.map(d => days[d.getDay()]);
      values = last7Days.map(d => {
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        return getBalance(start, end);
      });
    } else if (period === 'Mois') {
      labels = ['S1', 'S2', 'S3', 'S4'];
      values = Array.from({ length: 4 }, (_, i) => {
        const start = new Date(); start.setDate(start.getDate() - (28 - i * 7));
        const end = new Date(start); end.setDate(end.getDate() + 7);
        return getBalance(start, end);
      });
    } else if (period === 'Trimestre') {
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      const last3Months = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() - (2 - i));
        return d;
      });
      labels = last3Months.map(d => monthNames[d.getMonth()]);
      values = last3Months.map(d => {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return getBalance(start, end);
      });
    } else if (period === 'Année') {
      labels = ['T1', 'T2', 'T3', 'T4'];
      const year = new Date().getFullYear();
      values = [0, 1, 2, 3].map(q => {
        const start = new Date(year, q * 3, 1);
        const end = new Date(year, q * 3 + 3, 0, 23, 59, 59);
        return getBalance(start, end);
      });
    }

    const hasData = values.some(v => v !== 0);
    setChartData({ labels, datasets: [{ data: hasData ? values : [0, 0, 0, 0, 0] }], isPlaceholder: !hasData });
  }, [period, rawSales, rawExpenses]);

  const handleExportPDF = async () => {
    try {
      setLoading(true);
      await generateConsolidatedFinancePDF({
        revenues: financeData.revenues,
        expenses: financeData.expenses,
        sales: rawSales,
        expenses_list: rawExpenses,
        period: period
      });
    } catch (error) {
      Alert.alert(t('common.error'), "Erreur lors de la génération du PDF");
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme, isTablet);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const benefice = financeData.revenues - financeData.expenses;

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
          <TouchableOpacity style={[styles.addTransactionBtn, { backgroundColor: theme.colors.surface }]} onPress={handleExportPDF}>
             <MaterialIcons name="picture-as-pdf" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
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
              <MaterialIcons name="arrow-downward" size={16} color="#2E7D32" />
              <Text style={styles.miniCardLabel}>{t('finance.income')}</Text>
            </View>
            <Text style={[styles.miniCardValue, { color: '#2E7D32' }]}>{formatNumber(financeData.revenues)}</Text>
          </Card>

          <Card style={styles.miniCard}>
            <View style={styles.miniCardHeader}>
              <MaterialIcons name="arrow-upward" size={16} color={theme.colors.danger} />
              <Text style={styles.miniCardLabel}>{t('finance.expenses')}</Text>
            </View>
            <Text style={[styles.miniCardValue, { color: theme.colors.danger }]}>{formatNumber(financeData.expenses)}</Text>
          </Card>
        </View>

        <Card style={styles.chartCard}>
           <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>{t('finance.cashFlow')}</Text>
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

           {chartData && chartData.datasets[0].data.length > 0 ? (
             <LineChart
                data={chartData}
                width={Dimensions.get('window').width - theme.spacing.m * 4}
                height={180}
                chartConfig={{
                  backgroundColor: theme.colors.surface,
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(249, 215, 96, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
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

        <View style={styles.transactionsList}>
           {financeData.transactions.map((t: any, index: number) => (
              <Card key={t.id} style={styles.transactionCard}>
                 <View style={styles.transactionIconCircle}>
                    <MaterialIcons
                      name={t.type === 'income' ? 'add-shopping-cart' : 'payments'}
                      size={20}
                      color={t.type === 'income' ? '#2E7D32' : theme.colors.danger}
                    />
                 </View>
                 <View style={styles.transactionInfo}>
                    <Text style={styles.transactionTitle}>{t.title}</Text>
                    <Text style={styles.transactionDate}>{new Date(t.date).toLocaleDateString('fr-FR')}</Text>
                 </View>
                 <Text style={[styles.transactionAmount, { color: t.type === 'income' ? '#2E7D32' : theme.colors.danger }]}>
                    {t.amount > 0 ? '+' : ''}{formatNumber(t.amount)}
                 </Text>
              </Card>
           ))}
        </View>
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
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    marginBottom: theme.spacing.s,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: theme.colors.text },
  headerSubtitle: { fontSize: 13, color: theme.colors.textSecondary },
  addTransactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  scroll: {
    padding: theme.spacing.m,
    paddingBottom: 40,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: isTablet ? 'center' : 'auto',
    width: '100%'
  },
  balanceCard: {
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    marginBottom: theme.spacing.m,
  },
  balanceLabel: { fontSize: 13, color: theme.colors.text, opacity: 0.7, fontWeight: '600' },
  balanceValue: { fontSize: 28, fontWeight: 'bold', marginVertical: 8 },
  balanceTrend: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 12, color: '#2E7D32', fontWeight: 'bold', marginLeft: 4 },
  topCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.m,
  },
  miniCard: {
    width: isTablet ? '48.5%' : '48%',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
  },
  miniCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniCardLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginLeft: 4,
  },
  miniCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  chartCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  periodActive: {
    backgroundColor: theme.colors.primary,
    borderColor: '#000000',
    ...theme.shadows.light,
  },
  periodText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  periodTextActive: {
    fontSize: 10,
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  seeAll: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  transactionsList: {
    gap: theme.spacing.s,
    flexDirection: isTablet ? 'row' : 'column',
    flexWrap: isTablet ? 'wrap' : 'nowrap',
    justifyContent: isTablet ? 'space-between' : 'flex-start'
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    width: isTablet ? '49%' : '100%'
  },
  transactionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
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
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  transactionDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  }
});
