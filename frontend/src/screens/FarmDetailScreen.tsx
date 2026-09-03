import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatNumber } from '../utils/formatters';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';
import { toast } from '../utils/toast';
import { Screen, ScreenHeader, Card, Chip, StatTile, Badge, EmptyState, SectionHeader, space, radius } from '../components/ui';

export const FarmDetailScreen = ({ route, navigation }: any) => {
  const { farmId, farmName } = route.params;
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const { userRole } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const cols = isDesktop ? 3 : isTablet ? 2 : 1;
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Largeur explicite : `flex` seul dans `flexWrap` s'effondre sur Android/iOS.
  // Sur Web, `flexGrow: 1` étire une carte isolée (dernière ligne incomplète,
  // ou un seul lot) sur toute la largeur de la grille : on le désactive pour
  // que la carte garde sa largeur de colonne. Android/iOS : comportement
  // conservé (flexGrow) pour occuper l'espace disponible.
  const cellStyle: any = cols === 1
    ? { width: '100%' }
    : { flexBasis: cols === 3 ? '31%' : '47%', flexGrow: Platform.OS === 'web' ? 0 : 1, minWidth: 0 };

  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalBirds: 0, totalProduction: 0 });
  const [productions, setProductions] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [farm, setFarm] = useState<any>(null);

  const fetchLots = async () => {
    setLoading(true);
    try {
      const [lotsRes, prodRes, movementsRes, farmRes] = await Promise.all([
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/productions/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/movements/').catch(() => ({ data: [] })),
        repositoryProvider.api.get(`/farms/${farmId}/`).catch(() => ({ data: {} })),
      ]);

      setFarm(farmRes.data);
      const lotList = Array.isArray(lotsRes.data) ? lotsRes.data : lotsRes.data?.results || [];
      const productionList = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.results || [];
      const movementList = Array.isArray(movementsRes.data) ? movementsRes.data : movementsRes.data?.results || [];
      const farmLots = lotList.filter((l: any) => String(l.farm ?? l.farm_id) === String(farmId));
      setLots(farmLots);
      setProductions(productionList);
      setMovements(movementList);

      const activeLots = farmLots.filter((l: any) => l.status === 'ACTIF');
      const totalBirds = activeLots.reduce((sum: number, lot: any) => sum + lot.current_quantity, 0);

      const lotIds = activeLots.map((l: any) => l.id);
      const totalProd = prodRes.data
        .filter((p: any) => lotIds.includes(p.lot))
        .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);

      setStats({ totalBirds, totalProduction: totalProd });
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchLots(); });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchLots(); };

  const handleReactivate = async () => {
    console.log('[TEST SOLFERME] REACTIVATE FARM CLICK', { farmId, farmStatus: farm?.status });
    try {
      console.log('[TEST SOLFERME] REACTIVATE FARM: calling API');
      const response = await repositoryProvider.api.post(`/farms/${farmId}/reactivate/`);
      console.log('[TEST SOLFERME] REACTIVATE FARM: API response', response);
      toast.success(t('common.success'), t('farms.reactivateSuccess'));
      fetchLots();
    } catch (e: any) {
      console.error('[TEST SOLFERME] REACTIVATE FARM ERROR:', e);
      console.error('[TEST SOLFERME] REACTIVATE FARM ERROR RESPONSE:', e.response?.data);
      toast.error(t('common.error'), e.response?.data?.error || e.response?.data?.detail || t('farms.reactivateError'));
    }
  };

  const calculateAge = (purchaseDate: string) => {
    const diffTime = Math.abs(new Date().getTime() - new Date(purchaseDate).getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return { value: diffDays, unit: 'days' };
    const diffWeeks = Math.floor(diffDays / 7);
    return { value: diffWeeks, unit: 'weeks' };
  };

  const getLayingRate = (lot: any) => {
    if (lot.status !== 'ACTIF' || lot.current_quantity === 0) return '0%';
    const lotProds = productions
      .filter((p: any) => p.lot === lot.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7);
    if (lotProds.length === 0) return '0%';
    const avgCasiers = lotProds.reduce((sum, p) => sum + (p.casiers_produits || 0), 0) / lotProds.length;
    const rate = (avgCasiers * 30 / lot.current_quantity) * 100;
    return `${Math.min(100, Math.round(rate))}%`;
  };
  void getLayingRate;

  const getPerformance = (lot: any) => {
    if (lot.status !== 'ACTIF' || lot.current_quantity === 0) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const lotProds = productions.filter((p: any) =>
      p.lot === lot.id && new Date(p.date) >= sevenDaysAgo && p.status !== 'ANNULEE',
    );
    if (lotProds.length === 0) return 0;
    const recentProductionEggs = lotProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
    const daysWithData = new Set(lotProds.map((p: any) => p.date)).size || 1;
    const lotMovements = movements.filter((m: any) => m.lot === lot.id && m.status !== 'ANNULEE');
    const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + m.quantity, 0);
    const recoveredCount = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + m.quantity, 0);
    const currentSick = Math.max(0, totalSick - recoveredCount);
    return calculatePerformance(lot.initial_quantity, lot.current_quantity, currentSick, recentProductionEggs, daysWithData);
  };

  const statusMeta = (status: string) => {
    if (status === 'ACTIF') return { label: t('lots.status.active') || 'Actif', color: '#2E7D32' };
    if (status === 'TERMINE') return { label: t('lots.status.finished') || 'Terminé', color: '#E65100' };
    return { label: t('lots.status.archived') || 'Archivé', color: '#C62828' };
  };

  const renderLotItem = (item: any) => {
    const perf = getPerformance(item);
    const perfColor = getPerformanceLabel(perf).color;
    const sm = statusMeta(item.status);
    const age = calculateAge(item.purchase_date);

    return (
      <View key={item.id} style={cellStyle}>
        <Pressable onPress={() => navigation.navigate('LotDetail', { farmId, farmName, lotId: item.id, lotName: item.name })}>
          <Card style={styles.lotCard}>
            <View style={styles.lotHeader}>
              <View style={styles.lotTitle}>
                <View style={[styles.lotIcon, { backgroundColor: theme.colors.primary + '18' }]}>
                  <MaterialIcons name="inventory-2" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.lotName, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.lotBreed}>{item.breed || 'ISA Brown'}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
            </View>

            <View style={[styles.lotStats, { backgroundColor: theme.colors.background }]}>
              <View style={styles.lotStat}>
                <MaterialIcons name="groups" size={16} color={theme.colors.textSecondary} />
                <View>
                  <Text style={[styles.lotStatValue, { color: theme.colors.text }]}>{formatNumber(item.current_quantity)}</Text>
                  <Text style={styles.lotStatLabel}>{t('dashboard.totalBirds')}</Text>
                </View>
              </View>
              <View style={styles.lotStat}>
                <MaterialIcons name="speed" size={16} color={perfColor} />
                <View>
                  <Text style={[styles.lotStatValue, { color: perfColor }]}>{perf}%</Text>
                  <Text style={styles.lotStatLabel}>{t('lots.performance')}</Text>
                </View>
              </View>
            </View>

            <View style={styles.lotFooter}>
              <Text style={styles.lotAge}>{t(age.unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: age.value })}</Text>
              <Badge label={sm.label} color={sm.color} />
            </View>
          </Card>
        </Pressable>
      </View>
    );
  };

  const filteredLots = lots.filter((l: any) => (showArchived ? l.status === 'ARCHIVE' : l.status !== 'ARCHIVE'));

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <ScreenHeader
          title={farmName}
          onBack={() => navigation.goBack()}
          right={farm?.status === 'ARCHIVE' ? <Badge label={t('profile.inactive')} color={theme.colors.textSecondary} /> : undefined}
          actions={[
            ...(userRole !== 'EMPLOYE' ? [{ icon: 'edit' as const, onPress: () => navigation.navigate('CreateFarm', { farm }), tint: theme.colors.textSecondary }] : []),
            // Sur Web, la navigation passe par la DesktopSidebar : le tiroir mobile
            // n'existe plus visuellement, ce bouton ne doit donc pas y apparaître.
            ...(Platform.OS !== 'web' ? [{ icon: 'more-vert' as const, onPress: () => navigation.openDrawer(), tint: theme.colors.text }] : []),
          ]}
        />
      }
    >
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {farm?.status === 'ARCHIVE' && (
            <Card style={styles.archiveAlert}>
              <MaterialIcons name="info-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.archiveAlertText}>
                Cette ferme est archivée. Elle n'apparaît plus dans les statistiques globales.
              </Text>
              <Pressable onPress={handleReactivate} style={[styles.reactivateBtn, { backgroundColor: theme.colors.primary }]}>
                <Text style={[styles.reactivateBtnText, { color: theme.colors.text }]}>Réactiver</Text>
              </Pressable>
            </Card>
          )}

          <View style={styles.statsRow}>
            <StatTile label={t('farms.totalBirds')} value={formatNumber(stats.totalBirds)} icon="bird" />
            <StatTile label={t('farms.cumulativeProduction')} value={`${formatNumber(stats.totalProduction)}`} hint={t('lots.traysProduced')} icon="egg-outline" accent="#F57C00" />
          </View>

          <SectionHeader title={t('farms.batchesInFarm')} icon="layers-triple" />
          <View style={styles.filterRow}>
            <Chip label={t('lots.status.active') || 'Actifs'} icon="package-variant" active={!showArchived} onPress={() => setShowArchived(false)} />
            <Chip label={t('lots.status.archived') || 'Archivés'} icon="archive-outline" active={showArchived} onPress={() => setShowArchived(true)} />
          </View>

          {filteredLots.length > 0 ? (
            <View style={styles.lotsGrid}>{filteredLots.map(renderLotItem)}</View>
          ) : (
            <EmptyState
              icon={showArchived ? 'archive' : 'warehouse'}
              title={t('common.noData')}
              description={!showArchived && userRole !== 'EMPLOYE' ? t('farms.newBatch') : undefined}
            />
          )}

          {userRole !== 'EMPLOYE' && (
            <Pressable style={[styles.bigAdd, { backgroundColor: theme.colors.primary }]} onPress={() => navigation.navigate('CreateLot', { farmId, farmName })}>
              <MaterialIcons name="add" size={22} color={theme.colors.text} />
              <Text style={[styles.bigAddText, { color: theme.colors.text }]}>{t('farms.newBatch')}</Text>
            </Pressable>
          )}
        </>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  archiveAlert: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.sm, marginBottom: space.md, borderRadius: radius.md },
  archiveAlertText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  reactivateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  reactivateBtnText: { fontSize: 12, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: space.md },
  lotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  lotCard: { marginBottom: 0, borderRadius: radius.lg },
  lotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  lotTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 },
  lotIcon: { width: 38, height: 38, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  lotName: { fontSize: 15.5, fontWeight: '800' },
  lotBreed: { fontSize: 12, color: theme.colors.textSecondary },
  lotStats: { flexDirection: 'row', justifyContent: 'space-between', padding: space.sm, borderRadius: radius.md },
  lotStat: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '46%' },
  lotStatLabel: { fontSize: 10, color: theme.colors.textSecondary, textTransform: 'uppercase' },
  lotStatValue: { fontSize: 15, fontWeight: '800' },
  lotFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  lotAge: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: 'italic' },
  bigAdd: { flexDirection: 'row', gap: 8, height: 50, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginVertical: space.md },
  bigAddText: { fontSize: 16, fontWeight: '800' },
});
