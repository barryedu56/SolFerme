import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatNumber } from '../utils/formatters';
import { generateInventoryPDF } from '../utils/reportGenerator';
import { STOCK_THRESHOLDS } from '../constants/InventoryConstants';
import { Screen, ScreenHeader, Card, StatTile, Chip, SectionHeader, Badge, space, radius } from '../components/ui';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DatePicker } from '../components/DatePicker';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

const parseNum = (v: string) => parseFloat((v || '').toString().replace(/\s/g, '').replace(',', '.')) || 0;

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
  const lotNameById = useMemo(() => {
    const map = new Map<number, string>();
    (userFarms || []).forEach((f: any) => (f.lots || []).forEach((l: any) => map.set(l.id, l.name)));
    return map;
  }, [userFarms]);

  // Matières premières & produits santé = stock FERME (le filtre lot ne s'applique pas).
  const filterFarmOnly = (items: any[]): any[] => {
    if (selectedFarm === 'ALL') return items;
    return items.filter((item) => (item.farm ?? lotToFarm.get(item.lot)) === selectedFarm);
  };
  // Aliment préparé = ferme + réserve de lot éventuelle. Filtre lot = réserve du lot OU stock général.
  const filterPrepared = (items: any[]): any[] => {
    let out = items;
    if (selectedFarm !== 'ALL') out = out.filter((item) => (item.farm ?? lotToFarm.get(item.lot)) === selectedFarm);
    if (selectedLot !== 'ALL') out = out.filter((item) => item.lot === selectedLot || item.lot == null);
    return out;
  };

  const filteredRaw = useMemo(() => filterFarmOnly(inventory.rawMaterials), [inventory.rawMaterials, selectedFarm, lotToFarm]);
  const filteredPrep = useMemo(() => filterPrepared(inventory.preparedFeeds), [inventory.preparedFeeds, selectedFarm, selectedLot, lotToFarm]);
  const filteredHealth = useMemo(() => filterFarmOnly(inventory.health), [inventory.health, selectedFarm, lotToFarm]);

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

  const StockCard = ({ name, qty, unit, statusType, icon, sub, onRestock }: any) => {
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
            <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Badge label={st.label} color={st.color} />
              {!!onRestock && (
                <Pressable onPress={onRestock} hitSlop={6} style={S.restockBtn}>
                  <MaterialIcons name="add" size={13} color={theme.colors.primary} />
                  <Text style={S.restockText}>Ajouter</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[S.stockQty, { color: st.color }]}>{formatNumber(n)}</Text>
            <Text style={S.stockUnit}>{unit}</Text>
          </View>
        </Card>
      </View>
    );
  };

  // Ferme cible : ferme filtrée, sinon celle de l'item.
  const restockFarmId = (item?: any): number | undefined =>
    (selectedFarm !== 'ALL' ? selectedFarm : undefined) ?? item?.farm ?? lotToFarm.get(item?.lot);

  // ── Bon d'appro (multi-lignes) ──
  const openAppro = (type: 'feed' | 'health') =>
    navigation.navigate('Appro', { type, farmId: selectedFarm !== 'ALL' ? selectedFarm : undefined });

  // ── Ajout rapide « + » sur une carte ──
  const [quickAdd, setQuickAdd] = useState<{ type: 'feed' | 'health'; item: any } | null>(null);
  const [qaQty, setQaQty] = useState('');
  const [qaPrice, setQaPrice] = useState('');
  const [qaMode, setQaMode] = useState<'total' | 'unit'>('total');
  const [qaSupplier, setQaSupplier] = useState('');
  const [qaDate, setQaDate] = useState(new Date().toISOString().split('T')[0]);
  const [qaSaving, setQaSaving] = useState(false);

  const openQuickAdd = (type: 'feed' | 'health', item: any) => {
    setQaQty(''); setQaPrice(''); setQaMode('total'); setQaSupplier('');
    setQaDate(new Date().toISOString().split('T')[0]);
    setQuickAdd({ type, item });
  };
  const qaUnit = quickAdd?.type === 'feed' ? 'kg' : (quickAdd?.item?.unit || 'unité');
  const qaComputedTotal = qaMode === 'unit' ? parseNum(qaQty) * parseNum(qaPrice) : parseNum(qaPrice);

  const submitQuickAdd = async () => {
    if (!quickAdd || qaSaving) return;
    const farmId = restockFarmId(quickAdd.item);
    if (!farmId) { Alert.alert(t('common.error'), "Ferme introuvable pour ce produit."); return; }
    if (!(parseNum(qaQty) > 0) || !(qaComputedTotal > 0)) {
      Alert.alert(t('common.error'), 'Renseignez une quantité et un prix valides.');
      return;
    }
    setQaSaving(true);
    const isFeed = quickAdd.type === 'feed';
    const payload: any = {
      farm: farmId,
      lot: null,
      date: qaDate,
      supplier: qaSupplier || undefined,
      total_price: Math.round(qaComputedTotal * 100) / 100,
      unit_price: qaMode === 'unit' ? Math.round(parseNum(qaPrice) * 100) / 100 : null,
      ...(isFeed
        ? { feed_type: quickAdd.item.feed_type, quantity_kg: parseNum(qaQty) }
        : { product_name: quickAdd.item.product_name, quantity: parseNum(qaQty), unit: quickAdd.item.unit || 'Flacon', product_type: quickAdd.item.product_type || 'Autre' }),
    };
    try {
      await repositoryProvider.api.post(isFeed ? '/feed-purchases/' : '/health-purchases/', payload);
      const nm = isFeed ? quickAdd.item.feed_type : quickAdd.item.product_name;
      if (Platform.OS === 'web') toast.success(t('common.success'), `« ${nm} » réapprovisionné.`);
      else toast.success(t('common.success'), `« ${nm} » réapprovisionné.`);
      setQuickAdd(null);
      fetchData();
    } catch (e: any) {
      Alert.alert(t('common.actionImpossible'), getErrorMessage(e, 'Échec du réapprovisionnement.'));
    } finally {
      setQaSaving(false);
    }
  };


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

          {(
            <>
              {showFeed && (
                <>
                  <SectionHeader title={t('inventory.rawMaterials')} icon="grain" action={{ label: '+ Bon d\'appro', onPress: () => openAppro('feed') }} />
                  {sortedRaw.length > 0
                    ? <View style={S.grid}>{sortedRaw.map((item, i) => <StockCard key={i} name={item.feed_type} qty={item.quantity_kg} unit={t('common.kg')} statusType="feed" icon={getFeedIcon(item.feed_type)} onRestock={() => openQuickAdd('feed', item)} />)}</View>
                    : <Text style={S.emptyLine}>Aucune matière première. Touchez « Bon d'appro » pour en acheter.</Text>}
                </>
              )}
              {showFeed && sortedPrep.length > 0 && (
                <>
                  <SectionHeader title={t('inventory.preparedFeeds')} icon="blender-outline" />
                  <View style={S.grid}>{sortedPrep.map((item, i) => <StockCard key={i} name={item.feed_name} qty={item.quantity_kg} unit={t('common.kg')} statusType="feed" icon="food-variant" sub={item.lot ? `Réservé ${lotNameById.get(item.lot) || 'lot'}` : 'Ferme'} />)}</View>
                </>
              )}
              {showHealth && (
                <>
                  <SectionHeader title={t('inventory.healthProductsTitle')} icon="medical-bag" action={{ label: '+ Bon d\'appro', onPress: () => openAppro('health') }} />
                  {sortedHealth.length > 0
                    ? <View style={S.grid}>{sortedHealth.map((item, i) => <StockCard key={i} name={item.product_name} qty={item.quantity} unit={item.unit || t('common.unit')} statusType="health" icon="pill" sub={item.product_type} onRestock={() => openQuickAdd('health', item)} />)}</View>
                    : <Text style={S.emptyLine}>Aucun produit santé. Touchez « Bon d'appro » pour en acheter.</Text>}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Ajout rapide sur un produit ── */}
      <Modal visible={!!quickAdd} transparent animationType="slide" onRequestClose={() => setQuickAdd(null)}>
        <View style={S.qaOverlay}>
          <View style={S.qaCard}>
            <View style={S.qaHead}>
              <Text style={S.qaTitle} numberOfLines={1}>
                Ajouter du « {quickAdd?.type === 'feed' ? quickAdd?.item?.feed_type : quickAdd?.item?.product_name} »
              </Text>
              <Pressable onPress={() => setQuickAdd(null)} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={S.qaRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={S.qaLabel}>Quantité ({qaUnit})</Text>
                <Input placeholder="0" value={qaQty} onChangeText={setQaQty} isNumeric />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.qaLabel}>{qaMode === 'unit' ? `Prix / ${qaUnit}` : 'Prix total'} (GNF)</Text>
                <Input placeholder="0" value={qaPrice} onChangeText={setQaPrice} isNumeric />
              </View>
            </View>

            <View style={S.qaSegment}>
              <Pressable style={[S.qaSegBtn, qaMode === 'total' && S.qaSegBtnActive]} onPress={() => setQaMode('total')}>
                <Text style={[S.qaSegText, qaMode === 'total' && S.qaSegTextActive]}>Prix total</Text>
              </Pressable>
              <Pressable style={[S.qaSegBtn, qaMode === 'unit' && S.qaSegBtnActive]} onPress={() => setQaMode('unit')}>
                <Text style={[S.qaSegText, qaMode === 'unit' && S.qaSegTextActive]}>Prix par {qaUnit}</Text>
              </Pressable>
            </View>
            {qaMode === 'unit' && (
              <Text style={S.qaCalc}>= {qaComputedTotal.toLocaleString('fr-FR')} GNF</Text>
            )}

            <Text style={S.qaLabel}>Fournisseur (optionnel)</Text>
            <Input placeholder="Nom du fournisseur" value={qaSupplier} onChangeText={setQaSupplier} />
            <DatePicker label="Date" value={qaDate} onChange={setQaDate} />

            <Button title="Ajouter au stock" onPress={submitQuickAdd} loading={qaSaving} style={{ marginTop: space.sm, height: 52, borderRadius: radius.lg }} />
          </View>
        </View>
      </Modal>
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
  restockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
    backgroundColor: theme.colors.primary + '18',
  },
  restockText: { fontSize: 10, fontWeight: '800', color: theme.colors.primary },
  emptyLine: { fontSize: 13, color: theme.colors.textSecondary, fontStyle: 'italic', marginBottom: space.md, paddingHorizontal: 4 },
  qaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  qaCard: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  qaHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 },
  qaTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, flex: 1 },
  qaRow: { flexDirection: 'row' },
  qaLabel: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '700', textTransform: 'uppercase' },
  qaSegment: { flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 3, marginTop: 4 },
  qaSegBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  qaSegBtnActive: { backgroundColor: theme.colors.primary },
  qaSegText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  qaSegTextActive: { color: '#fff' },
  qaCalc: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.primary, textAlign: 'right' },
});
