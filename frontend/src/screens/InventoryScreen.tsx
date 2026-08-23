import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, useWindowDimensions, Alert, Platform
} from 'react-native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatNumber } from '../utils/formatters';
import { generateInventoryPDF } from '../utils/reportGenerator';

import { STOCK_THRESHOLDS } from '../constants/InventoryConstants';
import { EmptyState } from '../components/EmptyState';

const FEED_ICONS: Record<string, any> = {
  'Maïs': 'corn',
  'Tournesol': 'sunflower',
  'Soja': 'leaf',
  'Son': 'grain',
  'Torto': 'seed',
};

const getFeedIcon = (name: string) => FEED_ICONS[name] || 'package-variant';

export const InventoryScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { userFarms } = useAuth() as any;
  const { t } = useTranslation();
  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<number | 'ALL'>('ALL');
  const [selectedLot, setSelectedLot] = useState<number | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'FEED' | 'HEALTH'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'qty_desc' | 'qty_asc'>('name');

  const [inventory, setInventory] = useState({
    rawMaterials: [] as any[],
    preparedFeeds: [] as any[],
    health: [] as any[],
  });

  const currentFarmLots = useMemo(() => {
    if (selectedFarm === 'ALL') return [];
    return userFarms?.find((f: any) => f.id === selectedFarm)?.lots || [];
  }, [selectedFarm, userFarms]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = { include_zero: true };
      if (selectedLot !== 'ALL') params.lot = selectedLot;
      else if (selectedFarm !== 'ALL') params.farm = selectedFarm;

      const [rawRes, prepRes, healthRes] = await Promise.all([
        repositoryProvider.feedInventory.list(params),
        repositoryProvider.preparedFeedInventory.list(params),
        repositoryProvider.healthInventory.list(params),
      ]);

      setInventory({
        rawMaterials: rawRes,
        preparedFeeds: prepRes,
        health: healthRes,
      });
    } catch (e) {
      console.error('Stock error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedFarm, selectedLot]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleExportPDF = async () => {
    const hasData = inventory.rawMaterials.length > 0 || inventory.preparedFeeds.length > 0 || inventory.health.length > 0;
    if (!hasData) {
      Alert.alert(t('common.info') || 'Info', t('common.noData') || 'Aucune donnée à exporter.');
      return;
    }

    const farmName = selectedFarm === 'ALL'
      ? (t('common.all') || 'Toutes')
      : userFarms?.find((f: any) => f.id === selectedFarm)?.name || '';

    const currentLots = userFarms?.find((f: any) => f.id === selectedFarm)?.lots || [];
    const lotName = selectedLot !== 'ALL'
      ? currentLots.find((l: any) => l.id === selectedLot)?.name
      : undefined;

    await generateInventoryPDF(
      {
        rawMaterials: sortedRaw,
        preparedFeeds: sortedPrep,
        health: sortedHealth,
      },
      {
        farmName,
        lotName,
        dateStr: new Date().toLocaleString(t('common.dateLocale') || 'fr-FR'),
        totalFeed,
        totalHealth,
        thresholds: STOCK_THRESHOLDS,
      },
      t
    );
  };

  const sortFn = (a: any, b: any, getQty: (x: any) => number, getName: (x: any) => string) => {
    if (sortBy === 'name') return getName(a).localeCompare(getName(b));
    if (sortBy === 'qty_asc') return getQty(a) - getQty(b);
    return getQty(b) - getQty(a);
  };

  const sortedRaw = useMemo(() =>
    [...inventory.rawMaterials].sort((a, b) => sortFn(a, b, x => x.quantity_kg, x => x.feed_type)),
    [inventory.rawMaterials, sortBy]
  );
  const sortedPrep = useMemo(() =>
    [...inventory.preparedFeeds].sort((a, b) => sortFn(a, b, x => x.quantity_kg, x => x.feed_name)),
    [inventory.preparedFeeds, sortBy]
  );
  const sortedHealth = useMemo(() =>
    [...inventory.health].sort((a, b) => sortFn(a, b, x => x.quantity, x => x.product_name)),
    [inventory.health, sortBy]
  );

  const getStatus = (qty: number, type: 'feed' | 'health') => {
    const low = type === 'health' ? STOCK_THRESHOLDS.HEALTH : STOCK_THRESHOLDS.FEED;
    if (qty <= 0) return { label: t('inventory.outOfStock'), color: theme.colors.danger, icon: 'error-outline' };
    if (qty < low) return { label: t('inventory.lowStock'), color: theme.colors.warning, icon: 'warning-amber' };
    return { label: t('inventory.available'), color: theme.colors.success, icon: 'check-circle-outline' };
  };

  const totalFeed = inventory.rawMaterials.reduce((s, x) => s + parseFloat(x.quantity_kg || 0), 0)
    + inventory.preparedFeeds.reduce((s, x) => s + parseFloat(x.quantity_kg || 0), 0);
  const totalHealth = inventory.health.reduce((s, x) => s + parseFloat(x.quantity || 0), 0);

  const showFeed = selectedType === 'ALL' || selectedType === 'FEED';
  const showHealth = selectedType === 'ALL' || selectedType === 'HEALTH';

  const S = createStyles(theme, isDarkMode, isDesktop, isTablet, isDesktopOrTablet);

  const StockCard = ({ name, qty, unit, statusType, icon, iconLib = 'community', sub }: any) => {
    const st = getStatus(parseFloat(qty), statusType);
    return (
      <View style={[S.stockCard, isDesktop && S.stockCardDesktop]}>
        <View style={[S.stockIconWrap, { backgroundColor: st.color + '15' }]}>
          {iconLib === 'material'
            ? <MaterialIcons name={icon} size={22} color={st.color} />
            : <MaterialCommunityIcons name={icon} size={22} color={st.color} />}
        </View>
        <View style={S.stockInfo}>
          <Text style={S.stockName} numberOfLines={1}>{name}</Text>
          {sub && <Text style={S.stockSub}>{sub}</Text>}
          <View style={[S.statusPill, { backgroundColor: st.color + '15' }]}>
            <MaterialIcons name={st.icon as any} size={11} color={st.color} />
            <Text style={[S.statusText, { color: st.color }]}> {st.label}</Text>
          </View>
        </View>
        <View style={S.stockQtyWrap}>
          <Text style={[S.stockQty, { color: st.color }]}>{formatNumber(parseFloat(qty))}</Text>
          <Text style={S.stockUnit}>{unit}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaWrapper style={S.container}>
      {/* ── HEADER ── */}
      <View style={S.header}>
        <View style={S.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={S.title}>{t('inventory.title')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={onRefresh} style={S.backBtn}>
            <MaterialIcons name="refresh" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExportPDF} style={[S.backBtn, { backgroundColor: theme.colors.primary + '18' }]}>
            <MaterialIcons name="picture-as-pdf" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={S.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <View style={S.mainLayout}>
            {/* ── FILTRES ── */}
            <View style={S.filterBar}>
              {/* Fermes */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[S.chip, selectedFarm === 'ALL' && S.chipActive]}
                  onPress={() => { setSelectedFarm('ALL'); setSelectedLot('ALL'); }}
                >
                  <MaterialIcons name="domain" size={13} color={selectedFarm === 'ALL' ? '#fff' : theme.colors.textSecondary} />
                  <Text style={[S.chipTxt, selectedFarm === 'ALL' && S.chipTxtActive]}>  {t('common.all')}</Text>
                </TouchableOpacity>
                {userFarms?.map((f: any) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[S.chip, selectedFarm === f.id && S.chipActive]}
                    onPress={() => { setSelectedFarm(f.id); setSelectedLot('ALL'); }}
                  >
                    <Text style={[S.chipTxt, selectedFarm === f.id && S.chipTxtActive]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Lots */}
              {selectedFarm !== 'ALL' && currentFarmLots.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <TouchableOpacity
                    style={[S.chip, S.chipSm, selectedLot === 'ALL' && S.chipSmActive]}
                    onPress={() => setSelectedLot('ALL')}
                  >
                    <Text style={[S.chipTxtSm, selectedLot === 'ALL' && S.chipTxtSmActive]}>{t('lots.allLots')}</Text>
                  </TouchableOpacity>
                  {currentFarmLots.map((lot: any) => (
                    <TouchableOpacity
                      key={lot.id}
                      style={[S.chip, S.chipSm, selectedLot === lot.id && S.chipSmActive]}
                      onPress={() => setSelectedLot(lot.id)}
                    >
                      <Text style={[S.chipTxtSm, selectedLot === lot.id && S.chipTxtSmActive]}>{lot.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Type + Tri */}
              <View style={S.controlRow}>
                <View style={S.typeRow}>
                  {(['ALL', 'FEED', 'HEALTH'] as const).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[S.typeBtn, selectedType === type && S.typeBtnActive]}
                      onPress={() => setSelectedType(type)}
                    >
                      {type === 'ALL' && <MaterialIcons name="apps" size={13} color={selectedType === type ? theme.colors.primary : theme.colors.textSecondary} />}
                      {type === 'FEED' && <MaterialCommunityIcons name="food-apple-outline" size={13} color={selectedType === type ? theme.colors.primary : theme.colors.textSecondary} />}
                      {type === 'HEALTH' && <MaterialIcons name="medical-services" size={13} color={selectedType === type ? '#E91E63' : theme.colors.textSecondary} />}
                      <Text style={[S.typeTxt, selectedType === type && S.typeTxtActive, type === 'HEALTH' && selectedType === type && { color: '#E91E63' }]}>
                        {' '}{type === 'ALL' ? t('common.all') : type === 'FEED' ? t('actions.nutrition') : t('actions.health')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={S.sortRow}>
                  {([['name', 'sort-by-alpha'], ['qty_desc', 'arrow-downward'], ['qty_asc', 'arrow-upward']] as [string, any][]).map(([val, icon]) => (
                    <TouchableOpacity
                      key={val}
                      style={[S.sortBtn, sortBy === val && S.sortBtnActive]}
                      onPress={() => setSortBy(val as any)}
                    >
                      <MaterialIcons name={icon} size={16} color={sortBy === val ? theme.colors.primary : theme.colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* ── RÉSUMÉ TOTAL ── */}
            <View style={S.summaryRow}>
              {showFeed && (
                <View style={[S.summaryCard, { borderLeftColor: theme.colors.warning }]}>
                  <MaterialCommunityIcons name="silo" size={22} color={theme.colors.warning} />
                  <Text style={S.summaryValue}>{formatNumber(totalFeed)} {t('common.kg')}</Text>
                  <Text style={S.summaryLabel}>{t('lots.stockAliment')}</Text>
                </View>
              )}
              {showHealth && (
                <View style={[S.summaryCard, { borderLeftColor: '#E91E63' }]}>
                  <MaterialIcons name="medical-services" size={22} color="#E91E63" />
                  <Text style={S.summaryValue}>{formatNumber(totalHealth)}</Text>
                  <Text style={S.summaryLabel}>{t('inventory.healthProducts')}</Text>
                </View>
              )}
            </View>

            {/* ── MATIÈRES PREMIÈRES ── */}
            {showFeed && sortedRaw.length > 0 && (
              <View style={S.section}>
                <View style={S.secHeader}>
                  <View style={[S.secIconWrap, { backgroundColor: '#FF9800' + '18' }]}>
                    <MaterialCommunityIcons name="grain" size={18} color="#FF9800" />
                  </View>
                  <Text style={S.secTitle}>{t('inventory.rawMaterials')}</Text>
                  <Text style={S.secBadge}>{sortedRaw.length} {t('inventory.productsCount')}</Text>
                </View>
                <View style={S.cardsGrid}>
                  {sortedRaw.map((item, i) => (
                    <StockCard
                      key={i}
                      name={item.feed_type}
                      qty={item.quantity_kg}
                      unit={t('common.kg')}
                      statusType="feed"
                      icon={getFeedIcon(item.feed_type)}
                      iconLib="community"
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── ALIMENTS PRÉPARÉS ── */}
            {showFeed && sortedPrep.length > 0 && (
              <View style={S.section}>
                <View style={S.secHeader}>
                  <View style={[S.secIconWrap, { backgroundColor: theme.colors.primary + '18' }]}>
                    <MaterialCommunityIcons name="blender-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={S.secTitle}>{t('inventory.preparedFeeds')}</Text>
                  <Text style={S.secBadge}>{sortedPrep.length} {t('inventory.mixesCount')}</Text>
                </View>
                <View style={S.cardsGrid}>
                  {sortedPrep.map((item, i) => (
                    <StockCard
                      key={i}
                      name={item.feed_name}
                      qty={item.quantity_kg}
                      unit={t('common.kg')}
                      statusType="feed"
                      icon="food-variant"
                      iconLib="community"
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── SANTÉ ── */}
            {showHealth && sortedHealth.length > 0 && (
              <View style={S.section}>
                <View style={S.secHeader}>
                  <View style={[S.secIconWrap, { backgroundColor: '#E91E63' + '18' }]}>
                    <MaterialIcons name="medical-services" size={18} color="#E91E63" />
                  </View>
                  <Text style={S.secTitle}>{t('inventory.healthProductsTitle')}</Text>
                  <Text style={[S.secBadge, { color: '#E91E63', backgroundColor: '#E91E63' + '15' }]}>{sortedHealth.length} {t('inventory.productsCount')}</Text>
                </View>
                <View style={S.cardsGrid}>
                  {sortedHealth.map((item, i) => (
                    <StockCard
                      key={i}
                      name={item.product_name}
                      qty={item.quantity}
                      unit={item.unit || t('common.unit')}
                      statusType="health"
                      icon="pill"
                      iconLib="community"
                      sub={item.product_type}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── VIDE ── */}
            {sortedRaw.length === 0 && sortedPrep.length === 0 && sortedHealth.length === 0 && (
              <EmptyState
                icon="package-variant-closed"
                title={t('inventory.noStockFound')}
                description={
                  selectedLot !== 'ALL'
                    ? t('inventory.noStockForLot')
                    : selectedFarm !== 'ALL'
                    ? t('inventory.noStockForFarm')
                    : t('inventory.startByRegistering')
                }
              />
            )}

            <View style={{ height: 40 }} />
          </View>
        )}
      </ScrollView>
    </SafeAreaWrapper>
  );
};

const createStyles = (theme: any, isDarkMode: boolean, isDesktop: boolean, isTablet: boolean, isDesktopOrTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center', ...theme.shadows.light },
  title: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginLeft: 12 },
  filterBar: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
  },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },
  chipSm: { paddingHorizontal: 10, paddingVertical: 5 },
  chipSmActive: { backgroundColor: theme.colors.primary + '25', borderColor: theme.colors.primary },
  chipTxtSm: { fontSize: 11, color: theme.colors.textSecondary },
  chipTxtSmActive: { color: theme.colors.primary, fontWeight: '700' },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  typeRow: { flexDirection: 'row', backgroundColor: theme.colors.background, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: theme.colors.border, flex: 1, marginRight: 8, maxWidth: isDesktop ? 400 : 'auto' },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 8 },
  typeBtnActive: { backgroundColor: theme.colors.surface, ...theme.shadows.light },
  typeTxt: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  typeTxtActive: { color: theme.colors.primary, fontWeight: '800' },
  sortRow: { flexDirection: 'row', gap: 4 },
  sortBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  sortBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '15' },
  scroll: { padding: 16 },
  mainLayout: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, alignItems: 'center', borderLeftWidth: 4, ...theme.shadows.light },
  summaryValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginTop: 6 },
  summaryLabel: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
  section: { marginBottom: 24 },
  secHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  secIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  secTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.colors.text },
  secBadge: { fontSize: 11, color: theme.colors.primary, backgroundColor: theme.colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontWeight: '700' },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  stockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    width: '100%',
  },
  stockCardDesktop: {
    width: '31%',
    marginHorizontal: '1%',
    marginBottom: 16,
  },
  stockIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stockInfo: { flex: 1 },
  stockName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  stockSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, marginTop: 5 },
  statusText: { fontSize: 10, fontWeight: '700' },
  stockQtyWrap: { alignItems: 'flex-end' },
  stockQty: { fontSize: 20, fontWeight: '800' },
  stockUnit: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16 },
  emptySub: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});