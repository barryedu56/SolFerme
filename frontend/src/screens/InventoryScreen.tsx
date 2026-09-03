import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatNumber } from '../utils/formatters';
import { generateInventoryPDF } from '../utils/reportGenerator';
import { STOCK_THRESHOLDS } from '../constants/InventoryConstants';
import { Screen, ScreenHeader, Card, StatTile, Chip, SectionHeader, Badge, EmptyState, space, radius } from '../components/ui';

const FEED_ICONS: Record<string, any> = { 'Maïs': 'corn', 'Tournesol': 'flower', 'Soja': 'leaf', 'Son': 'grain', 'Torto': 'seed-outline' };
const getFeedIcon = (name: string) => FEED_ICONS[name] || 'package-variant';

export const InventoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userFarms } = useAuth() as any;
  const { t } = useTranslation();
  const { isDesktop, isTablet } = useBreakpoint();
  const cols = isDesktop ? 3 : isTablet ? 2 : 1;
  const S = useMemo(() => createStyles(theme), [theme]);
  // Largeur de cellule explicite (indispensable sur Android/iOS : `flex` seul
  // dans un conteneur `flexWrap` s'effondre à 0 — quirk Yoga).
  const cellStyle: any = cols === 1
    ? { width: '100%' }
    : { flexBasis: cols === 3 ? '31%' : '47%', flexGrow: 1, minWidth: 0 };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<number | 'ALL'>('ALL');
  const [selectedLot, setSelectedLot] = useState<number | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'FEED' | 'HEALTH'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'qty_desc' | 'qty_asc'>('name');
  const [inventory, setInventory] = useState({ rawMaterials: [] as any[], preparedFeeds: [] as any[], health: [] as any[] });

  const currentFarmLots = useMemo(() => {
    if (selectedFarm === 'ALL') return [];
    return userFarms?.find((f: any) => f.id === selectedFarm)?.lots || [];
  }, [selectedFarm, userFarms]);

  // On charge tout le stock accessible une seule fois (au montage / focus /
  // pull-to-refresh). Les filtres ferme/lot sont appliqués côté client
  // ci-dessous — le contenu change instantanément au clic, sans aller-retour
  // réseau pour chaque changement de filtre.
  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = { include_zero: true };
      const [rawRes, prepRes, healthRes] = await Promise.all([
        repositoryProvider.feedInventory.list(params),
        repositoryProvider.preparedFeedInventory.list(params),
        repositoryProvider.healthInventory.list(params),
      ]);
      setInventory({ rawMaterials: rawRes, preparedFeeds: prepRes, health: healthRes });
    } catch (e) {
      console.error('Stock error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Correspondance lot -> ferme, pour filtrer par ferme sans info directe sur l'item.
  const lotToFarm = useMemo(() => {
    const map = new Map<number, number>();
    (userFarms || []).forEach((f: any) => (f.lots || []).forEach((l: any) => map.set(l.id, f.id)));
    return map;
  }, [userFarms]);

  const filterByFarmLot = (items: any[]): any[] => {
    if (selectedLot !== 'ALL') return items.filter((item) => item.lot === selectedLot);
    if (selectedFarm !== 'ALL') return items.filter((item) => lotToFarm.get(item.lot) === selectedFarm);
    return items;
  };

  const filteredRaw = useMemo(() => filterByFarmLot(inventory.rawMaterials), [inventory.rawMaterials, selectedFarm, selectedLot, lotToFarm]);
  const filteredPrep = useMemo(() => filterByFarmLot(inventory.preparedFeeds), [inventory.preparedFeeds, selectedFarm, selectedLot, lotToFarm]);
  const filteredHealth = useMemo(() => filterByFarmLot(inventory.health), [inventory.health, selectedFarm, selectedLot, lotToFarm]);

  const sortFn = (a: any, b: any, getQty: (x: any) => number, getName: (x: any) => string) => {
    if (sortBy === 'name') return getName(a).localeCompare(getName(b));
    if (sortBy === 'qty_asc') return getQty(a) - getQty(b);
    return getQty(b) - getQty(a);
  };
  const sortedRaw = useMemo(() => [...filteredRaw].sort((a, b) => sortFn(a, b, (x) => x.quantity_kg, (x) => x.feed_type)), [filteredRaw, sortBy]);
  const sortedPrep = useMemo(() => [...filteredPrep].sort((a, b) => sortFn(a, b, (x) => x.quantity_kg, (x) => x.feed_name)), [filteredPrep, sortBy]);
  const sortedHealth = useMemo(() => [...filteredHealth].sort((a, b) => sortFn(a, b, (x) => x.quantity, (x) => x.product_name)), [filteredHealth, sortBy]);

  const totalFeed = filteredRaw.reduce((s, x) => s + parseFloat(x.quantity_kg || 0), 0) + filteredPrep.reduce((s, x) => s + parseFloat(x.quantity_kg || 0), 0);
  const totalHealth = filteredHealth.reduce((s, x) => s + parseFloat(x.quantity || 0), 0);

  const handleExportPDF = async () => {
    const hasData = inventory.rawMaterials.length > 0 || inventory.preparedFeeds.length > 0 || inventory.health.length > 0;
    if (!hasData) { Alert.alert(t('common.info') || 'Info', t('common.noData') || 'Aucune donnée à exporter.'); return; }
    const farmName = selectedFarm === 'ALL' ? (t('common.all') || 'Toutes') : userFarms?.find((f: any) => f.id === selectedFarm)?.name || '';
    const currentLots = userFarms?.find((f: any) => f.id === selectedFarm)?.lots || [];
    const lotName = selectedLot !== 'ALL' ? currentLots.find((l: any) => l.id === selectedLot)?.name : undefined;
    await generateInventoryPDF(
      { rawMaterials: sortedRaw, preparedFeeds: sortedPrep, health: sortedHealth },
      { farmName, lotName, dateStr: new Date().toLocaleString(t('common.dateLocale') || 'fr-FR'), totalFeed, totalHealth, thresholds: STOCK_THRESHOLDS },
      t,
    );
  };

  const status = (qty: number, type: 'feed' | 'health') => {
    const low = type === 'health' ? STOCK_THRESHOLDS.HEALTH : STOCK_THRESHOLDS.FEED;
    if (qty <= 0) return { label: t('inventory.outOfStock'), color: theme.colors.danger };
    if (qty < low) return { label: t('inventory.lowStock'), color: '#F57C00' };
    return { label: t('inventory.available'), color: '#2E7D32' };
  };

  const showFeed = selectedType === 'ALL' || selectedType === 'FEED';
  const showHealth = selectedType === 'ALL' || selectedType === 'HEALTH';

  const StockCard = ({ name, qty, unit, statusType, icon, sub }: any) => {
    const n = parseFloat(qty);
    const st = status(n, statusType);
    return (
      <View style={cellStyle}>
        <Card style={S.stock} padding={space.sm}>
          <View style={[S.stockIcon, { backgroundColor: st.color + '1F' }]}>
            <MaterialCommunityIcons name={icon} size={20} color={st.color} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.stockName, { color: theme.colors.text }]} numberOfLines={1}>{name}</Text>
            {!!sub && <Text style={S.stockSub}>{sub}</Text>}
            <View style={{ marginTop: 4 }}><Badge label={st.label} color={st.color} /></View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[S.stockQty, { color: st.color }]}>{formatNumber(n)}</Text>
            <Text style={S.stockUnit}>{unit}</Text>
          </View>
        </Card>
      </View>
    );
  };

  const empty = sortedRaw.length === 0 && sortedPrep.length === 0 && sortedHealth.length === 0;

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <ScreenHeader
          title={t('inventory.title')}
          onBack={() => navigation.goBack()}
          actions={[
            { icon: 'refresh', onPress: onRefresh, tint: theme.colors.primary },
            { icon: 'picture-as-pdf', onPress: handleExportPDF, tint: theme.colors.primary },
          ]}
        />
      }
    >
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Filtres */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
            <Chip label={t('common.all')} icon="home-group" active={selectedFarm === 'ALL'} onPress={() => { setSelectedFarm('ALL'); setSelectedLot('ALL'); }} />
            {userFarms?.map((f: any) => (
              <Chip key={f.id} label={f.name} active={selectedFarm === f.id} onPress={() => { setSelectedFarm(f.id); setSelectedLot('ALL'); }} />
            ))}
          </ScrollView>
          {selectedFarm !== 'ALL' && currentFarmLots.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={[S.chipRow, { paddingTop: 0 }]}>
              <Chip label={t('lots.allLots')} active={selectedLot === 'ALL'} onPress={() => setSelectedLot('ALL')} />
              {currentFarmLots.map((lot: any) => (
                <Chip key={lot.id} label={lot.name} active={selectedLot === lot.id} onPress={() => setSelectedLot(lot.id)} />
              ))}
            </ScrollView>
          )}

          <View style={S.controls}>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' }}>
              <Chip label={t('common.all')} icon="view-grid-outline" active={selectedType === 'ALL'} onPress={() => setSelectedType('ALL')} />
              <Chip label={t('actions.nutrition')} icon="silo" active={selectedType === 'FEED'} onPress={() => setSelectedType('FEED')} />
              <Chip label={t('actions.health')} icon="medical-bag" active={selectedType === 'HEALTH'} onPress={() => setSelectedType('HEALTH')} color="#8E24AA" />
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {([['name', 'sort-by-alpha'], ['qty_desc', 'south'], ['qty_asc', 'north']] as [any, any][]).map(([val, icon]) => (
                <Pressable key={val} onPress={() => setSortBy(val)} style={[S.sortBtn, { borderColor: sortBy === val ? theme.colors.primary : theme.colors.border, backgroundColor: sortBy === val ? theme.colors.primary + '18' : theme.colors.surface }]}>
                  <MaterialIcons name={icon} size={16} color={sortBy === val ? theme.colors.primary : theme.colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          </View>

          <View style={S.summary}>
            {showFeed && <StatTile label={t('lots.stockAliment')} value={`${formatNumber(totalFeed)} ${t('common.kg')}`} icon="silo" accent="#F57C00" />}
            {showHealth && <StatTile label={t('inventory.healthProducts')} value={formatNumber(totalHealth)} icon="medical-bag" accent="#8E24AA" />}
          </View>

          {empty ? (
            <EmptyState
              icon="package-variant-closed"
              title={t('inventory.noStockFound')}
              description={selectedLot !== 'ALL' ? t('inventory.noStockForLot') : selectedFarm !== 'ALL' ? t('inventory.noStockForFarm') : t('inventory.startByRegistering')}
            />
          ) : (
            <>
              {showFeed && sortedRaw.length > 0 && (
                <>
                  <SectionHeader title={t('inventory.rawMaterials')} icon="grain" />
                  <View style={S.grid}>{sortedRaw.map((item, i) => <StockCard key={i} name={item.feed_type} qty={item.quantity_kg} unit={t('common.kg')} statusType="feed" icon={getFeedIcon(item.feed_type)} />)}</View>
                </>
              )}
              {showFeed && sortedPrep.length > 0 && (
                <>
                  <SectionHeader title={t('inventory.preparedFeeds')} icon="blender-outline" />
                  <View style={S.grid}>{sortedPrep.map((item, i) => <StockCard key={i} name={item.feed_name} qty={item.quantity_kg} unit={t('common.kg')} statusType="feed" icon="food-variant" />)}</View>
                </>
              )}
              {showHealth && sortedHealth.length > 0 && (
                <>
                  <SectionHeader title={t('inventory.healthProductsTitle')} icon="medical-bag" />
                  <View style={S.grid}>{sortedHealth.map((item, i) => <StockCard key={i} name={item.product_name} qty={item.quantity} unit={item.unit || t('common.unit')} statusType="health" icon="pill" sub={item.product_type} />)}</View>
                </>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: space.sm, alignItems: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.md, flexWrap: 'wrap' },
  sortBtn: { width: 34, height: 34, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stock: { marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md },
  stockIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stockName: { fontSize: 14, fontWeight: '700' },
  stockSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  stockQty: { fontSize: 19, fontWeight: '800' },
  stockUnit: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
});
