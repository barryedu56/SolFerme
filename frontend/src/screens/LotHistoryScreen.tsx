import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../components/Card';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { formatNumber } from '../utils/formatters';

export const LotHistoryScreen = ({ route, navigation }: any) => {
  const { lotId, lotName } = route.params;
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [lotPurchaseDate, setLotPurchaseDate] = useState<string | null>(null);

  const fetchHistory = async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    try {
      const [prodRes, salesRes, feedsRes, healthRes, movementsRes, lotRes] = await Promise.all([
        apiClient.get('/productions/'),
        apiClient.get('/sales/'),
        apiClient.get('/feeds/'),
        apiClient.get('/health-records/'),
        apiClient.get('/movements/'),
        apiClient.get(`/lots/${lotId}/`),
      ]);

      setLotPurchaseDate(lotRes.data.purchase_date);

      const lotProds = prodRes.data.filter((p: any) => p.lot === lotId);
      const lotSales = salesRes.data.filter((s: any) => s.lot === lotId);
      const lotFeeds = feedsRes.data.filter((f: any) => f.lot === lotId);
      const lotHealth = healthRes.data.filter((h: any) => h.lot === lotId);
      const lotMovements = movementsRes.data.filter((m: any) => m.lot === lotId);

      const actions = [
        ...lotProds.map((p: any) => ({
          type: 'Production',
          screen: 'ActionProduction',
          date: p.date,
          desc: `${formatNumber(p.casiers_produits || 0)} casiers`,
          color: theme.colors.primary,
          user: p.created_by_name || 'Inconnu',
          details: `Vendables: ${formatNumber(p.casiers_vendables)} / Produits: ${formatNumber(p.casiers_produits)}`,
          params: { lotId, lotName, item: p, lotPurchaseDate: lotRes.data.purchase_date },
          canConvert: (p.casiers_produits - p.casiers_vendables) > 0,
          originalData: p
        })),
        ...lotSales.map((s: any) => ({
          type: 'Vente',
          screen: 'ActionVente',
          date: s.date,
          desc: `+${formatNumber(s.amount_paid)} GNF`,
          color: theme.colors.success,
          user: s.created_by_name || 'Inconnu',
          details: `${formatNumber(s.quantity)} casiers (${s.product_type}) à ${formatNumber(s.unit_price)} GNF/casier`,
          params: { lotId, lotName, item: s, lotPurchaseDate: lotRes.data.purchase_date }
        })),
        ...lotFeeds.map((f: any) => ({
          type: 'Alimentation',
          screen: 'ActionAlimentation',
          date: f.date,
          desc: `${formatNumber(f.quantity_kg || f.quantity)} kg`,
          color: theme.colors.warning,
          user: f.created_by_name || 'Inconnu',
          details: `${f.feed_type} - Coût: ${formatNumber(f.cost)} GNF`,
          params: { lotId, lotName, item: f, lotPurchaseDate: lotRes.data.purchase_date }
        })),
        ...lotHealth.map((h: any) => ({
          type: 'Santé',
          screen: 'ActionSante',
          date: h.date,
          desc: `${h.product_name} (${h.treatment_type})`,
          color: theme.colors.danger,
          user: h.created_by_name || 'Inconnu',
          details: `Dose: ${h.dose} - Coût: ${formatNumber(h.cost)} GNF`,
          params: { lotId, lotName, item: h, lotPurchaseDate: lotRes.data.purchase_date }
        })),
        ...lotMovements.map((m: any) => ({
          type: 'Mouvement',
          screen: 'ActionMouvement',
          date: m.date,
          desc: `${formatNumber(m.quantity)} poules (${m.type})`,
          color: theme.colors.info,
          user: m.created_by_name || 'Inconnu',
          details: `Raison: ${m.reason}`,
          params: { lotId, lotName, item: m, lotPurchaseDate: lotRes.data.purchase_date }
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(actions);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory(true);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchHistory();
    });
    return unsubscribe;
  }, [navigation, lotId]);

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique - {lotName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
          }
          renderItem={({ item }) => (
            <View>
              <TouchableOpacity onPress={() => navigation.navigate(item.screen, item.params)}>
                <Card style={styles.historyCard}>
                  <View style={styles.historyLeft}>
                    <View style={styles.row}>
                      <Text style={styles.historyType}>{item.type}</Text>
                      <Text style={styles.historyDate}>{new Date(item.date).toLocaleDateString('fr-FR')}</Text>
                    </View>
                    <Text style={styles.historyDetails}>{item.details}</Text>
                    <Text style={styles.historyUser}>Par : {item.user}</Text>
                  </View>
                  <Text style={[styles.historyDesc, { color: item.color }]}>{item.desc}</Text>
                </Card>
              </TouchableOpacity>

              {item.type === 'Production' && item.canConvert && (
                <TouchableOpacity
                  style={styles.convertButton}
                  onPress={() => navigation.navigate('ProductionConvert', { production: item.originalData })}
                >
                  <MaterialIcons name="autorenew" size={16} color={theme.colors.primary} />
                  <Text style={styles.convertButtonText}>Rendre vendable ({item.originalData.casiers_produits - item.originalData.casiers_vendables} restants)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  historyCard: {
    padding: theme.spacing.m, marginBottom: theme.spacing.s, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: theme.colors.border + '40',
  },
  historyLeft: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyType: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  historyDate: { fontSize: 12, color: theme.colors.textSecondary },
  historyDetails: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 },
  historyUser: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  historyDesc: { fontSize: 16, fontWeight: 'bold', alignSelf: 'flex-end', marginTop: 4 },
  convertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: -8,
    marginBottom: 12,
    marginHorizontal: 4,
    alignSelf: 'flex-start',
  },
  convertButtonText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});
