import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { apiClient } from '../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { exportProductionData } from '../utils/reportGenerator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatNumber, formatCurrency } from '../utils/formatters';

import { calculatePerformance, getPerformanceLabel } from '../utils/performance';

export const LotDetailScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { lotName, lotId, farmId, farmName } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lotData, setLotData] = useState<any>(null);
  const [allProductions, setAllProductions] = useState<any[]>([]);
  const [performance, setPerformance] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchLotData = async () => {
    try {
      const role = await AsyncStorage.getItem('user_role');
      setUserRole(role);
      const [lotRes, prodRes, salesRes, feedsRes, healthRes, movementsRes, feedPurchasesRes, healthPurchasesRes] = await Promise.all([
        apiClient.get(`/lots/${lotId}/`),
        apiClient.get('/productions/'),
        apiClient.get('/sales/'),
        apiClient.get('/feeds/'),
        apiClient.get('/health-records/'),
        apiClient.get('/movements/'),
        apiClient.get('/feed-purchases/'),
        apiClient.get('/health-purchases/'),
      ]);

      const lotInfo = lotRes.data;

      const lotProds = prodRes.data.filter((p: any) => p.lot === lotId);
      setAllProductions(lotProds);
      const lotSales = salesRes.data.filter((s: any) => s.lot === lotId);
      const lotFeeds = feedsRes.data.filter((f: any) => f.lot === lotId);
      const lotHealth = healthRes.data.filter((h: any) => h.lot === lotId);
      const lotMovements = movementsRes.data.filter((m: any) => m.lot === lotId);

      // Filterm purchases by lot if they are linked
      const lotFeedPurchases = feedPurchasesRes.data.filter((fp: any) => fp.lot === lotId);
      const lotHealthPurchases = healthPurchasesRes.data.filter((hp: any) => hp.lot === lotId);

      const totalCasiers = lotProds.reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);
      const totalOeufsCassesProduced = lotProds.reduce((sum: number, p: any) => sum + (p.oeufs_casses || 0), 0);
      const totalCasiersVendables = lotProds.reduce((sum: number, p: any) => sum + (p.casiers_vendables || 0), 0);

      const totalSoldNormaux = lotSales
        .filter((s: any) => s.product_type === 'Œufs Normaux' || s.product_type === 'Oeufs')
        .reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);

      const totalSoldCasses = lotSales
        .filter((s: any) => s.product_type === 'Œufs Cassés')
        .reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);

      const availableStock = totalCasiersVendables - totalSoldNormaux;
      const availableCasses = (totalOeufsCassesProduced / 30) - totalSoldCasses;

      const totalRevenues = lotSales.reduce((sum: number, s: any) => sum + parseFloat(s.amount_paid || 0), 0);

      // Somme des achats réels (nouvelle logique) + anciens enregistrements qui auraient un coût
      const feedCosts = lotFeedPurchases.reduce((sum: number, fp: any) => sum + parseFloat(fp.total_price || 0), 0) +
                        lotFeeds.reduce((sum: number, f: any) => sum + parseFloat(f.cost || 0), 0);

      const healthCosts = lotHealthPurchases.reduce((sum: number, hp: any) => sum + parseFloat(hp.total_price || 0), 0) +
                          lotHealth.reduce((sum: number, h: any) => sum + parseFloat(h.cost || 0), 0);

      const deadCount = lotMovements.filter((m: any) => m.type === 'MORT').reduce((sum: number, m: any) => sum + m.quantity, 0);
      const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + m.quantity, 0);
      const recoveredCount = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + m.quantity, 0);
      const currentSick = Math.max(0, totalSick - recoveredCount);

      // Calculate Performance
      const recentProds = lotProds
        .filter((p: any) => {
          const pDate = new Date(p.date);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return pDate >= sevenDaysAgo;
        });

      const recentProductionEggs = recentProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
      const daysWithData = new Set(recentProds.map(p => p.date)).size || 1;

      const perf = calculatePerformance(
        lotInfo.initial_quantity,
        lotInfo.current_quantity,
        currentSick,
        recentProductionEggs,
        daysWithData
      );
      setPerformance(perf);

      const lotPurchasePrice = parseFloat(lotInfo.purchase_price || 0);
      const totalLotExpenses = feedCosts + healthCosts + lotPurchasePrice;

      setLotData({
        info: lotInfo,
        totalCasiers,
        totalOeufsCasses: totalOeufsCassesProduced,
        totalCasiersVendables,
        revenues: totalRevenues,
        expenses: totalLotExpenses,
        profit: totalRevenues - totalLotExpenses,
        deadCount,
        currentSick,
        recoveredCount,
        availableStock,
        availableCasses,
        recentActions: [
          ...lotProds.map((p: any) => ({
            id: p.id,
            type: t('actions.production'),
            screen: 'ActionProduction',
            date: p.date,
            desc: `${p.casiers_vendables}/${p.casiers_produits} ${t('production.trays')}`,
            color: theme.colors.primary,
            params: { lotId, lotName, item: p }
          })),
          ...lotSales.map((s: any) => ({
            id: s.id,
            type: t('actions.sale'),
            screen: 'ActionVente',
            date: s.date,
            desc: `+${formatCurrency(s.amount_paid)}`,
            color: theme.colors.success,
            params: { lotId, lotName, item: s }
          })),
          ...lotFeeds.map((f: any) => ({
            id: f.id,
            type: t('actions.feed'),
            screen: 'ActionAlimentation',
            date: f.date,
            desc: `${formatNumber(f.quantity_kg)} kg`,
            color: theme.colors.warning,
            params: { lotId, lotName, farmId, item: f, activeTab: 'distribution' }
          })),
          ...lotFeedPurchases.map((fp: any) => ({
            id: fp.id,
            type: "Achat Aliment",
            screen: 'ActionAlimentation',
            date: fp.date,
            desc: `+${formatNumber(fp.quantity_kg)} kg`,
            color: theme.colors.success,
            params: { lotId, lotName, farmId, item: fp, activeTab: 'purchase' }
          })),
          ...lotHealth.map((h: any) => ({
            id: h.id,
            type: t('actions.health'),
            screen: 'ActionSante',
            date: h.date,
            desc: h.product_name,
            color: theme.colors.info || '#2196F3',
            params: { lotId, lotName, farmId, item: h, activeTab: 'treatment' }
          })),
          ...lotHealthPurchases.map((hp: any) => ({
            id: hp.id,
            type: "Achat Santé",
            screen: 'ActionSante',
            date: hp.date,
            desc: `+${formatNumber(hp.quantity)}`,
            color: theme.colors.success,
            params: { lotId, lotName, farmId, item: hp, activeTab: 'purchase' }
          })),
          ...(userRole !== 'EMPLOYE' ? lotMovements.map((m: any) => ({
            id: m.id,
            type: t('actions.movement'),
            screen: 'ActionMouvement',
            date: m.date,
            desc: `${m.quantity} ${m.type}`,
            color: theme.colors.danger,
            params: { lotId, lotName, farmId, item: m }
          })) : [])
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3)
      });

    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchLotData();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLotData();
  };

  const handleExportProduction = async () => {
    if (allProductions.length === 0) {
      Alert.alert(t('common.info') || 'Info', t('lots.exportNoData'));
      return;
    }
    try {
      await exportProductionData(allProductions, lotName);
    } catch (error) {
      Alert.alert(t('common.error'), t('lots.exportError'));
    }
  };

  const allActions = [
    { title: t('actions.sale'), screen: 'ActionVente', icon: 'add-shopping-cart', iconType: 'MaterialIcons', ownerOnly: true },
    { title: t('actions.production'), screen: 'ActionProduction', icon: 'egg', iconType: 'MaterialCommunityIcons', ownerOnly: false },
    { title: t('actions.feed'), screen: 'ActionAlimentation', icon: 'restaurant', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.health'), screen: 'ActionSante', icon: 'medication', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.movement'), screen: 'ActionMouvement', icon: 'outbound', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.reminder'), screen: 'ActionReminder', icon: 'notifications-active', iconType: 'MaterialIcons', ownerOnly: true },
  ];

  const actions = allActions.filter(a => !a.ownerOnly || userRole !== 'EMPLOYE');

  const styles = createStyles(theme);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const calculateAge = (purchaseDate: string) => {
    const diffTime = Math.abs(new Date().getTime() - new Date(purchaseDate).getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return { value: diffDays, unit: 'days' };
    } else {
      const diffWeeks = Math.floor(diffDays / 7);
      return { value: diffWeeks, unit: 'weeks' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'EN_PREPARATION': return 'En préparation';
      case 'EN_PRODUCTION': return 'En production';
      case 'TERMINE': return 'Terminé';
      case 'VENDU': return 'Vendu';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EN_PREPARATION': return theme.colors.warning;
      case 'EN_PRODUCTION': return theme.colors.success;
      case 'TERMINE': return theme.colors.danger;
      case 'VENDU': return theme.colors.info || '#2196F3';
      default: return theme.colors.primary;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>{lotName}</Text>
          <View style={styles.badgeContainer}>
             <View style={[styles.statusDot, { backgroundColor: lotData ? getStatusColor(lotData.info.status) : theme.colors.border }]} />
             <Text style={styles.subtitle}>
               {lotData ? getStatusLabel(lotData.info.status) : '...'}
               {lotData && ` • ${t(calculateAge(lotData.info.purchase_date).unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: calculateAge(lotData.info.purchase_date).value })}`}
             </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {userRole !== 'EMPLOYE' && lotData && (
            <TouchableOpacity
              style={[styles.headerActionBtn, { marginRight: 10 }]}
              onPress={() => navigation.navigate('CreateLot', { farmId, farmName, lot: lotData.info })}
            >
              <MaterialIcons name="edit" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerActionBtn} onPress={handleExportProduction}>
             <MaterialIcons name="file-download" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {lotData && (
          <>
          <Card style={styles.infoDetailsCard}>
            <View style={styles.infoRow}>
               <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Souche</Text>
                  <Text style={styles.infoValue}>{lotData.info.breed}</Text>
               </View>
               <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Fournisseur</Text>
                  <Text style={styles.infoValue}>{lotData.info.supplier || '-'}</Text>
               </View>
            </View>
            <View style={styles.infoRow}>
               <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Date création</Text>
                  <Text style={styles.infoValue}>{new Date(lotData.info.purchase_date).toLocaleDateString('fr-FR')}</Text>
               </View>
               {userRole !== 'EMPLOYE' && (
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>Investissement</Text>
                    <Text style={styles.infoValue}>{formatCurrency(lotData.info.purchase_price)}</Text>
                 </View>
               )}
            </View>
            <View style={styles.infoRow}>
               <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Qté initiale</Text>
                  <Text style={styles.infoValue}>{formatNumber(lotData.info.initial_quantity)} têtes</Text>
               </View>
               <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Qté actuelle</Text>
                  <Text style={[styles.infoValue, { color: theme.colors.primary, fontWeight: 'bold' }]}>{formatNumber(lotData.info.current_quantity)} têtes</Text>
               </View>
            </View>
          </Card>

          <View style={styles.kpiGrid}>
            <Card style={styles.kpiItem}>
               <MaterialIcons name="groups" size={24} color={theme.colors.primary} />
               <Text style={styles.kpiValue}>{formatNumber(lotData.info.current_quantity)}</Text>
               <Text style={styles.kpiLabel}>{t('lots.birds')}</Text>
            </Card>
            <Card style={styles.kpiItem}>
               <MaterialCommunityIcons name="egg" size={24} color={theme.colors.primary} />
               <Text style={styles.kpiValue}>{formatNumber(lotData.totalCasiers)}</Text>
               <Text style={styles.kpiLabel}>{t('lots.traysProduced')}</Text>
            </Card>
            <Card style={styles.kpiItem}>
               <MaterialIcons name="inventory" size={24} color={theme.colors.primary} />
               <Text style={styles.kpiValue}>{formatNumber(lotData.availableStock)}</Text>
               <Text style={styles.kpiLabel}>Casiers Vendables</Text>
            </Card>
            <Card style={styles.kpiItem}>
               <MaterialIcons name="shopping-basket" size={24} color={theme.colors.warning} />
               <Text style={styles.kpiValue}>{formatNumber(lotData.availableCasses)}</Text>
               <Text style={styles.kpiLabel}>Casiers Cassés Disp.</Text>
            </Card>
            <Card style={styles.kpiItem}>
               <MaterialIcons name="heart-broken" size={24} color={theme.colors.danger} />
               <Text style={[styles.kpiValue, {color: theme.colors.danger}]}>{formatNumber(lotData.deadCount)}</Text>
               <Text style={styles.kpiLabel}>{t('lots.mortality')}</Text>

               <View style={styles.healthStatsMini}>
                  <View style={styles.healthStatMiniItem}>
                     <MaterialCommunityIcons name="emoticon-sick-outline" size={14} color={theme.colors.warning} />
                     <Text style={[styles.miniStatText, { color: theme.colors.warning, fontWeight: 'bold' }]}>{lotData.currentSick}</Text>
                     <Text style={styles.miniStatLabel}> Mal.</Text>
                  </View>
                  <View style={styles.healthStatMiniDivider} />
                  <View style={styles.healthStatMiniItem}>
                     <MaterialCommunityIcons name="heart-pulse" size={14} color={theme.colors.success} />
                     <Text style={[styles.miniStatText, { color: theme.colors.success, fontWeight: 'bold' }]}>{lotData.recoveredCount}</Text>
                     <Text style={styles.miniStatLabel}> Gué.</Text>
                  </View>
               </View>
            </Card>
            <Card style={styles.kpiItem}>
               <MaterialIcons name={performance >= 90 ? "trending-up" : performance >= 70 ? "trending-flat" : "trending-down"} size={24} color={getPerformanceLabel(performance).color} />
               <Text style={[styles.kpiValue, {color: getPerformanceLabel(performance).color}]}>
                  {performance}%
               </Text>
               <Text style={styles.kpiLabel}>{t('lots.performance')}</Text>
               <Text style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 4 }}>{getPerformanceLabel(performance).label}</Text>
            </Card>

            {userRole !== 'EMPLOYE' && (
              <>
                <Card style={styles.kpiItem}>
                   <MaterialIcons name="payments" size={24} color={theme.colors.success} />
                   <Text style={[styles.kpiValue, {color: theme.colors.success}]}>{formatNumber(lotData.revenues)}</Text>
                   <Text style={styles.kpiLabel}>{t('finance.income')}</Text>
                </Card>
                <Card style={styles.kpiItem}>
                   <MaterialIcons name="shopping-cart-checkout" size={24} color={theme.colors.danger} />
                   <Text style={[styles.kpiValue, {color: theme.colors.danger}]}>{formatNumber(lotData.expenses)}</Text>
                   <Text style={styles.kpiLabel}>{t('finance.expenses')}</Text>
                </Card>
                <Card style={[styles.kpiItem, { width: '100%', marginTop: theme.spacing.s }]}>
                   <MaterialIcons name="account-balance" size={24} color={lotData.profit >= 0 ? theme.colors.success : lotData.profit < 0 ? theme.colors.danger : theme.colors.text} />
                   <Text style={[styles.kpiValue, { color: lotData.profit >= 0 ? theme.colors.success : theme.colors.danger }]}>
                      {formatCurrency(lotData.profit)}
                   </Text>
                   <Text style={styles.kpiLabel}>{t('dashboard.finance')}</Text>
                </Card>
              </>
            )}
          </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('lots.quickActions')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionRow}>
          {actions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.actionCircle}
              onPress={() => navigation.navigate(action.screen, {
                lotId,
                lotName,
                farmId,
                lotPurchaseDate: lotData?.info?.purchase_date
              })}
            >
              <View style={styles.iconContainer}>
                {action.iconType === 'MaterialCommunityIcons' ? (
                  <MaterialCommunityIcons name={action.icon as any} size={26} color={theme.colors.text} />
                ) : (
                  <MaterialIcons name={action.icon as any} size={26} color={theme.colors.text} />
                )}
              </View>
              <Text style={styles.actionLabel}>{action.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {lotData && lotData.recentActions.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>{t('lots.history')}</Text>
              {lotData.recentActions.length >= 3 && (
                <TouchableOpacity onPress={() => navigation.navigate('LotHistory', { lotId, lotName })}>
                  <Text style={styles.seeAll}>{t('lots.seeAll')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {lotData.recentActions.map((act: any, i: number) => (
              <TouchableOpacity
                key={i}
                onPress={() => navigation.navigate(act.screen, act.params)}
              >
                <Card style={styles.historyCard}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyType}>{act.type}</Text>
                    <Text style={styles.historyDate}>{new Date(act.date).toLocaleDateString('fr-FR')}</Text>
                  </View>
                  <Text style={[styles.historyDesc, { color: act.color }]}>{act.desc}</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: theme.spacing.m,
  },
  headerActionBtn: {
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    ...theme.shadows.light,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary },
  editButton: {
    padding: 8,
  },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.l,
  },
  kpiItem: {
    width: '48%',
    padding: theme.spacing.m,
    alignItems: 'center',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  kpiValue: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginVertical: 4 },
  kpiLabel: { fontSize: 11, color: theme.colors.textSecondary, textTransform: 'uppercase', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m, marginTop: theme.spacing.s },
  actionRow: { marginBottom: theme.spacing.xl, marginHorizontal: -theme.spacing.m, paddingLeft: theme.spacing.m },
  actionCircle: { alignItems: 'center', marginRight: 16, width: 85 },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...theme.shadows.medium
  },
  actionLabel: { fontSize: 12, color: theme.colors.text, fontWeight: '600', textAlign: 'center' },
  historySection: { marginTop: theme.spacing.s },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m },
  seeAll: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  historyLeft: { flex: 1 },
  historyType: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  historyDate: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  historyDesc: { fontSize: 15, fontWeight: 'bold' },
  healthStatsMini: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border + '15',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  healthStatMiniItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  healthStatMiniDivider: {
    width: 1,
    height: 12,
    backgroundColor: theme.colors.border + '20',
    marginHorizontal: 4,
  },
  miniStatText: {
    fontSize: 12,
    marginLeft: 4,
  },
  miniStatLabel: {
    fontSize: 9,
    color: theme.colors.textSecondary,
  },
  infoDetailsCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
  }
});
