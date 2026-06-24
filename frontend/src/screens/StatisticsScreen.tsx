import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Dimensions, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { apiClient, fetchAll } from '../api/client';
import { exportProductionData, generateConsolidatedFinancePDF } from '../utils/reportGenerator';
import { LineChart } from 'react-native-chart-kit';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

const screenWidth = Dimensions.get('window').width;

export const StatisticsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const [period, setPeriod] = useState('Semaine');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [rawProds, setRawProds] = useState<any[]>([]);
  const [rawSales, setRawSales] = useState<any[]>([]);
  const [trend, setTrend] = useState(0);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalEggs: 0,
    globalPerformance: 0,
    eggCategories: { normal: 0, broken: 0, deformed: 0 },
    chartData: { labels: [] as string[], datasets: [{ data: [] as number[] }] }
  });

  const periods = ['Jour', 'Semaine', 'Mois', 'Trimestre', 'Année'];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [salesData, prodData, lotsData, movementsData] = await Promise.all([
        fetchAll('/sales/').catch(() => []),
        fetchAll('/productions/').catch(() => []),
        fetchAll('/lots/').catch(() => []),
        fetchAll('/movements/').catch(() => []),
      ]);

      const totalAllSales = salesData.reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || s.total_amount || 0), 0);
      const totalCasiers = prodData.reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      const totalOeufsCasses = prodData.reduce((sum: number, p: any) => sum + (p.oeufs_casses || 0), 0);
      const totalCasiersVendables = prodData.reduce((sum: number, p: any) => sum + (p.casiers_vendables || 0), 0);
      const totalCasiersAnomalies = prodData.reduce((sum: number, p: any) => sum + ((p.casiers_produits || 0) - (p.casiers_vendables || 0)), 0);

      const totalAll = totalCasiersVendables + (totalOeufsCasses / 30);

      // Calcul Performance Globale
      const activeLots = lotsData.filter((l: any) => l.status === 'EN_PRODUCTION');
      let totalPerf = 0;
      if (activeLots.length > 0) {
        activeLots.forEach((lot: any) => {
          const lotProds = prodData.filter((p: any) => p.lot === lot.id);
          const recentProds = lotProds.filter((p: any) => {
            const pDate = new Date(p.date);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return pDate >= sevenDaysAgo;
          });
          const recentEggs = recentProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
          const daysWithData = new Set(recentProds.map(p => p.date)).size || 1;

          const lotMovements = movementsData.filter((m: any) => m.lot === lot.id);
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
        totalPerf = Math.round(totalPerf / activeLots.length);
      } else {
        totalPerf = 0;
      }

      // Calcul des tendances
      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      
      const thisMonthRevenues = salesData.filter((s:any) => new Date(s.date) >= thisMonthStart).reduce((sum:number, s:any) => sum + parseFloat(s.amount_paid||0), 0);
      const lastMonthRevenues = salesData.filter((s:any) => new Date(s.date) >= lastMonthStart && new Date(s.date) < thisMonthStart).reduce((sum:number, s:any) => sum + parseFloat(s.amount_paid||0), 0);

      let calcTrend = 0;
      if (lastMonthRevenues > 0) calcTrend = ((thisMonthRevenues - lastMonthRevenues) / lastMonthRevenues) * 100;
      else if (thisMonthRevenues > 0) calcTrend = 100;
      setTrend(Math.round(calcTrend));

      setRawProds(prodData);
      setRawSales(salesData);

      setStats(prev => ({
        ...prev,
        totalSales: totalAllSales,
        totalEggs: totalAll,
        globalPerformance: totalPerf,
        eggCategories: {
          normal: totalAll ? Math.round((totalCasiersVendables / totalAll) * 100) : 0,
          broken: totalAll ? Math.round(((totalOeufsCasses / 30) / totalAll) * 100) : 0,
          deformed: totalAll ? Math.round(((totalCasiersAnomalies - (totalOeufsCasses / 30)) / totalAll) * 100) : 0,
        }
      }));

    } catch (error) {
      console.log('Erreur Statistics fetchData:', error);
      Alert.alert('Erreur', 'Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!rawProds || rawProds.length === 0) return;

    let labels: string[] = [];
    let values: number[] = [];

    if (period === 'Jour') {
      labels = ['Matin', 'Midi', 'Soir'];
      const today = new Date().toISOString().split('T')[0];
      const todayProds = rawProds.filter((p: any) => p.date === today);
      // On simule une répartition ou on affiche le total sur un point si pas d'heure
      values = [
        todayProds.reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0),
        0, 0 // Placeholder pour une future gestion par heure
      ];
    } else if (period === 'Semaine') {
      const days = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      labels = last7Days.map(d => days[d.getDay()]);
      values = last7Days.map(d => {
        const dateStr = d.toISOString().split('T')[0];
        return rawProds.filter((p: any) => p.date === dateStr).reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      });
    } else if (period === 'Mois') {
      const last4Weeks = Array.from({ length: 4 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (21 - i * 7));
        return d;
      });
      labels = ['S1', 'S2', 'S3', 'S4'];
      values = last4Weeks.map(d => {
        const weekStart = new Date(d);
        const weekEnd = new Date(d);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return rawProds.filter((p: any) => new Date(p.date) >= weekStart && new Date(p.date) < weekEnd).reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      });
    } else if (period === 'Trimestre') {
      const last3Months = Array.from({ length: 3 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (2 - i));
        return d;
      });
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      labels = last3Months.map(d => monthNames[d.getMonth()]);
      values = last3Months.map(d => {
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return rawProds.filter((p: any) => new Date(p.date) >= monthStart && new Date(p.date) <= monthEnd).reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      });
    } else {
      labels = ['Q1', 'Q2', 'Q3', 'Q4'];
      const currentYear = new Date().getFullYear();
      values = [0, 1, 2, 3].map(qIndex => {
        const qStart = new Date(currentYear, qIndex * 3, 1);
        const qEnd = new Date(currentYear, qIndex * 3 + 3, 0);
        return rawProds.filter((p: any) => new Date(p.date) >= qStart && new Date(p.date) <= qEnd).reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      });
    }

    setStats(prev => ({
      ...prev,
      chartData: { labels, datasets: [{ data: values }] }
    }));
  }, [period, rawProds]);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const prodData = await fetchAll('/productions/');

      if (prodData.length === 0) {
        Alert.alert('Info', 'Aucune donnée de production à exporter.');
        return;
      }
      await exportProductionData(prodData, "Global_SolFerme");
    } catch (error) {
      Alert.alert('Erreur', "Échec de l'exportation des données.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportFinance = async () => {
     setExporting(true);
     try {
       const [salesData, expData] = await Promise.all([
         fetchAll('/sales/'),
         fetchAll('/expenses/'),
       ]);

       const totalRev = salesData.reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);
       const totalExp = expData.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0);

       await generateConsolidatedFinancePDF({
         revenues: totalRev,
         expenses: totalExp,
         sales: salesData,
         expenses_list: expData,
         period: period === 'Tous' ? 'Global' : period
       });
     } catch (error) {
       Alert.alert('Erreur', "Échec de la génération du rapport financier.");
     } finally {
       setExporting(false);
     }
  };

  const styles = createStyles(theme, isTablet, width);

  if (loading) {
     return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rapports & Statistiques</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
           <MaterialIcons name="refresh" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.periodTabs}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, period === p && styles.activeTab]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.tabText, period === p && styles.activeTabText]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryGrid}>
           <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Performance Globale</Text>
              <Text style={[styles.statValue, { color: getPerformanceLabel(stats.globalPerformance).color }]}>
                {stats.globalPerformance}%
              </Text>
              <View style={styles.trendRow}>
                 <Text style={[styles.trendText, { color: getPerformanceLabel(stats.globalPerformance).color, marginLeft: 0 }]}>
                   {getPerformanceLabel(stats.globalPerformance).label}
                 </Text>
              </View>
           </Card>
           <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Ventes Totales</Text>
              <Text style={styles.statValue}>{formatCurrency(stats.totalSales)}</Text>
              <View style={styles.trendRow}>
                 <MaterialIcons name={trend >= 0 ? "trending-up" : "trending-down"} size={14} color={trend >= 0 ? theme.colors.success : theme.colors.danger} />
              </View>
           </Card>
           <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Casiers Produits (Vendables + Cassés)</Text>
              <Text style={styles.statValue}>{formatNumber(stats.totalEggs)} cas.</Text>
              <View style={styles.trendRow}>
                 <MaterialIcons name="egg" size={14} color={theme.colors.primary} />
                 <Text style={[styles.trendText, { color: theme.colors.primary }]}>Total réel en casiers</Text>
              </View>
           </Card>
        </View>

        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
             <Text style={styles.cardTitle}>Production Journalière (Normaux)</Text>
          </View>

          {stats.chartData.datasets[0].data.length > 0 ? (
            <LineChart
              data={stats.chartData}
              width={isTablet ? 940 : screenWidth - 60}
              height={200}
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
            <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.textSecondary }}>Aucune donnée de production disponible</Text>
            </View>
          )}
        </Card>

        <Text style={styles.sectionTitle}>Analyse par Catégorie</Text>
        <Card style={styles.listCard}>
           {[
             { label: 'Œufs Normaux', val: `${formatNumber(stats.eggCategories.normal)}%`, color: theme.colors.success },
             { label: 'Œufs Cassés', val: `${formatNumber(stats.eggCategories.broken)}%`, color: theme.colors.warning },
             { label: 'Œufs Déformés', val: `${formatNumber(stats.eggCategories.deformed)}%`, color: theme.colors.danger },
           ].map((item, idx) => (
             <View key={idx} style={[styles.listItem, idx > 0 && styles.borderTop]}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={styles.listLabel}>{item.label}</Text>
                <Text style={styles.listValue}>{item.val}</Text>
             </View>
           ))}
        </Card>

        <View style={styles.exportSection}>
           <Button
             title="Exporter Rapport Production (Excel)"
             onPress={handleExportAll}
             loading={exporting}
             variant="primary"
             style={styles.exportBtn}
           />
           <Text style={styles.exportInfo}>Données extraites en temps réel.</Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isTablet: boolean, screenWidth: number) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: 'center',
    width: '100%'
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  refreshBtn: { padding: 8 },
  periodTabs: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.m,
    marginTop: theme.spacing.s,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: 'center',
    width: '100%'
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#000000',
  },
  activeTab: {
    backgroundColor: theme.colors.primary,
    borderColor: '#000000',
  },
  tabText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  activeTabText: { color: theme.colors.text, fontWeight: 'bold' },
  scroll: {
    padding: theme.spacing.m,
    maxWidth: isTablet ? 1000 : '100%',
    alignSelf: 'center',
    width: '100%'
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.l,
    flexWrap: isTablet ? 'nowrap' : 'wrap'
  },
  statCard: {
    width: isTablet ? '23.5%' : '48%',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: isTablet ? 0 : theme.spacing.m,
    borderWidth: 1,
    borderColor: '#000000',
  },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  currency: { fontSize: 10 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  trendText: { fontSize: 10, color: theme.colors.success, fontWeight: 'bold', marginLeft: 4 },
  chartCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l, borderRadius: theme.borderRadius.xl },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  lineChartContainer: { flexDirection: 'row', height: 160 },
  yAxis: { justifyContent: 'space-between', paddingRight: 10, paddingBottom: 10 },
  axisText: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '500' },
  chartArea: { flex: 1, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border + '40', position: 'relative' },
  gridLines: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  gridLine: { height: 1, backgroundColor: theme.colors.border + '20' },
  svgPlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary, position: 'absolute', borderWidth: 2, borderColor: 'white' },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 30, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m },
  listCard: { padding: 0, overflow: 'hidden', borderRadius: theme.borderRadius.xl },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m },
  borderTop: { borderTopWidth: 1, borderTopColor: '#000000' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12, borderWidth: 1, borderColor: '#000000' },
  listLabel: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  listValue: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  exportSection: { marginTop: theme.spacing.l, alignItems: 'center' },
  exportBtn: { width: '100%', borderRadius: theme.borderRadius.xl, height: 56, borderWidth: 1, borderColor: '#000000' },
  exportInfo: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 8 }
});
