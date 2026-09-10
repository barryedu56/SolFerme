import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, FlatList } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { getErrorMessage } from '../../utils/errors';
import { fetchRows } from '../../database/localDatabase';
import { toast } from '../../utils/toast';

type Line = { name: string; quantity: string; price: string; unit: string };

const emptyLine = (): Line => ({ name: '', quantity: '', price: '', unit: 'Flacon' });
const num = (v: string) => parseFloat((v || '').toString().replace(/\s/g, '').replace(',', '.')) || 0;

/**
 * Bon d'approvisionnement : ajoute PLUSIEURS achats en une passe.
 * Les champs communs (ferme, date, fournisseur, imputation, mode prix) sont
 * saisis une seule fois ; chaque ligne = un produit. Un seul « Enregistrer »
 * crée tous les achats (feed-purchases ou health-purchases selon `type`).
 */
export const ApproScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { type = 'feed', farmId: initialFarmId, prefillName } = route.params || {};
  const isFeed = type !== 'health';
  const priceUnitLabel = isFeed ? 'kg' : 'unité';

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      Alert.alert(t('common.accessDenied'), t('purchase.ownerOnly'));
      navigation.goBack();
    }
  }, [userRole]);

  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(initialFarmId || null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplier, setSupplier] = useState('');
  const [lotImput, setLotImput] = useState<number | null>(null); // null = ferme entière
  const [priceMode, setPriceMode] = useState<'total' | 'unit'>('total');
  const [lines, setLines] = useState<Line[]>([
    prefillName ? { ...emptyLine(), name: prefillName } : emptyLine(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Picker produit
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  // ── Fermes (fallback SQLite si userFarms vide) ──
  const [localFarms, setLocalFarms] = useState<any[]>([]);
  useEffect(() => {
    const farms = userFarms?.length ? userFarms : [];
    if (farms.length === 0) {
      fetchRows<any>('farms', "status = 'ACTIF'").then(rows => {
        if (rows?.length) setLocalFarms(rows.map((f: any) => ({ id: f.id, name: f.name })));
      }).catch(() => {});
    } else {
      setLocalFarms(farms);
    }
  }, [userFarms]);
  const farmOptions = localFarms.length > 0 ? localFarms : (userFarms || []);

  // Un seul choix de ferme possible → présélection
  useEffect(() => {
    if (!selectedFarmId && farmOptions.length === 1) setSelectedFarmId(farmOptions[0].id);
  }, [farmOptions, selectedFarmId]);

  // ── Lots de la ferme (pour l'imputation du coût) ──
  const [farmLots, setFarmLots] = useState<any[]>([]);
  useEffect(() => {
    setLotImput(null);
    if (!selectedFarmId) { setFarmLots([]); return; }
    const farm = userFarms?.find((f: any) => f.id === selectedFarmId);
    if (farm?.lots?.length) {
      setFarmLots(farm.lots.filter((l: any) => l.status === 'ACTIF'));
      return;
    }
    fetchRows<any>('lots', "farm_id = ? AND status = 'ACTIF'", [selectedFarmId])
      .then(rows => setFarmLots(rows.map((l: any) => ({ id: l.id, name: l.name }))))
      .catch(() => setFarmLots([]));
  }, [selectedFarmId, userFarms]);

  // ── Produits déjà en stock (pour le picker) ──
  useEffect(() => {
    if (!selectedFarmId) { setExistingProducts([]); return; }
    const endpoint = isFeed ? '/feed-inventory/' : '/health-inventory/';
    repositoryProvider.api.get<any[]>(endpoint, { params: { farm: selectedFarmId, include_zero: true } })
      .then(r => setExistingProducts(Array.isArray(r.data) ? r.data : (r.data as any)?.results || []))
      .catch(() => setExistingProducts([]));
  }, [selectedFarmId, isFeed]);

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const lineTotal = (l: Line) => (priceMode === 'unit' ? num(l.quantity) * num(l.price) : num(l.price));
  const bonTotal = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines, priceMode]);

  const pickProduct = (name: string, product?: any) => {
    if (pickerIndex === null) return;
    updateLine(pickerIndex, {
      name,
      unit: product?.unit || lines[pickerIndex]?.unit || 'Flacon',
    });
    setPickerIndex(null);
  };

  const validLines = () => lines
    .map(l => ({ ...l, name: l.name.trim() }))
    .filter(l => l.name && num(l.quantity) > 0 && lineTotal(l) > 0);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!selectedFarmId) {
      Alert.alert(t('common.error'), 'Choisissez une ferme.');
      return;
    }
    const ready = validLines();
    if (ready.length === 0) {
      Alert.alert(t('common.error'), 'Ajoutez au moins un produit avec une quantité et un prix.');
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: ready.length });
    const endpoint = isFeed ? '/feed-purchases/' : '/health-purchases/';
    const failures: { name: string; msg: string }[] = [];

    for (let i = 0; i < ready.length; i++) {
      const l = ready[i];
      const existing = existingProducts.find((p: any) => (isFeed ? p.feed_type : p.product_name) === l.name);
      const total = Math.round(lineTotal(l) * 100) / 100;
      const unitPrice = priceMode === 'unit' ? Math.round(num(l.price) * 100) / 100 : null;
      const payload: any = {
        farm: selectedFarmId,
        lot: lotImput || null,
        date,
        supplier: supplier || undefined,
        total_price: total,
        unit_price: unitPrice,
        ...(isFeed
          ? { feed_type: l.name, quantity_kg: num(l.quantity) }
          : {
              product_name: l.name,
              quantity: num(l.quantity),
              unit: existing?.unit || l.unit || 'Flacon',
              product_type: existing?.product_type || 'Autre',
            }),
      };
      try {
        await repositoryProvider.api.post(endpoint, payload);
      } catch (e: any) {
        failures.push({ name: l.name, msg: getErrorMessage(e, 'Échec') });
      }
      setProgress({ done: i + 1, total: ready.length });
    }

    setSubmitting(false);
    setProgress(null);

    if (failures.length === 0) {
      const msg = `${ready.length} achat${ready.length > 1 ? 's' : ''} enregistré${ready.length > 1 ? 's' : ''}. Stock à jour.`;
      if (Platform.OS === 'web') toast.success(t('common.success'), msg);
      else Alert.alert(t('common.success'), msg);
      navigation.goBack();
    } else {
      // Garder uniquement les lignes en échec pour correction
      const failedNames = new Set(failures.map(f => f.name));
      setLines(lines.filter(l => failedNames.has(l.name.trim())));
      const detail = failures.map(f => `• ${f.name} : ${f.msg}`).join('\n');
      Alert.alert(
        'Certaines lignes ont échoué',
        `${ready.length - failures.length} enregistrée(s), ${failures.length} en échec :\n\n${detail}`,
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isFeed ? 'Bon d\'appro — Aliments' : 'Bon d\'appro — Santé'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* ── En-tête commun ── */}
          <Card style={styles.card}>
            {farmOptions.length > 1 && (
              <View style={styles.group}>
                <Text style={styles.label}>Ferme *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {farmOptions.map((f: any) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.chip, selectedFarmId === f.id && styles.chipActive]}
                      onPress={() => setSelectedFarmId(f.id)}
                    >
                      <Text style={[styles.chipText, selectedFarmId === f.id && styles.chipTextActive]}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <DatePicker label="Date" value={date} onChange={setDate} />

            <View style={styles.group}>
              <Text style={styles.label}>Fournisseur (optionnel)</Text>
              <Input placeholder="Nom du fournisseur" value={supplier} onChangeText={setSupplier} />
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Imputer le coût à</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.chip, !lotImput && styles.chipActive]}
                  onPress={() => setLotImput(null)}
                >
                  <Text style={[styles.chipText, !lotImput && styles.chipTextActive]}>Ferme entière</Text>
                </TouchableOpacity>
                {farmLots.map((l: any) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.chip, lotImput === l.id && styles.chipActive]}
                    onPress={() => setLotImput(l.id)}
                  >
                    <Text style={[styles.chipText, lotImput === l.id && styles.chipTextActive]}>{l.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.hint}>Le stock va toujours à la ferme ; le coût apparaît dans la finance du lot choisi.</Text>
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Prix saisi en</Text>
              <View style={styles.segment}>
                <TouchableOpacity
                  style={[styles.segmentBtn, priceMode === 'total' && styles.segmentBtnActive]}
                  onPress={() => setPriceMode('total')}
                >
                  <Text style={[styles.segmentText, priceMode === 'total' && styles.segmentTextActive]}>Prix total</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, priceMode === 'unit' && styles.segmentBtnActive]}
                  onPress={() => setPriceMode('unit')}
                >
                  <Text style={[styles.segmentText, priceMode === 'unit' && styles.segmentTextActive]}>Prix par {priceUnitLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>

          {/* ── Lignes produit ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produits</Text>
            <TouchableOpacity onPress={addLine} style={styles.addBtn}>
              <MaterialIcons name="add" size={18} color={theme.colors.primary} />
              <Text style={styles.addBtnText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {lines.map((l, i) => (
            <Card key={i} style={styles.lineCard}>
              <View style={styles.lineTop}>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() => setPickerIndex(i)}
                >
                  <Text style={[styles.selectorText, !l.name && { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {l.name || 'Choisir / nouveau produit'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeLine(i)} disabled={lines.length === 1} style={styles.trash}>
                  <MaterialIcons name="delete-outline" size={22} color={lines.length === 1 ? theme.colors.border : '#E53935'} />
                </TouchableOpacity>
              </View>

              <View style={styles.lineRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.miniLabel}>Quantité ({priceUnitLabel})</Text>
                  <Input placeholder="0" value={l.quantity} onChangeText={v => updateLine(i, { quantity: v })} isNumeric />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>{priceMode === 'unit' ? `Prix / ${priceUnitLabel}` : 'Prix total'} (GNF)</Text>
                  <Input placeholder="0" value={l.price} onChangeText={v => updateLine(i, { price: v })} isNumeric />
                </View>
              </View>

              {priceMode === 'unit' && (
                <Text style={styles.lineCalc}>= {lineTotal(l).toLocaleString('fr-FR')} GNF</Text>
              )}
            </Card>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total approvisionnement</Text>
            <Text style={styles.totalValue}>{bonTotal.toLocaleString('fr-FR')} GNF</Text>
          </View>

          <Button
            title={
              progress
                ? `Enregistrement ${progress.done}/${progress.total}…`
                : (() => {
                    const n = validLines().length;
                    return n > 1 ? `Enregistrer ${n} achats` : 'Enregistrer';
                  })()
            }
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submit}
          />
        </ScrollView>

        {/* ── Picker produit ── */}
        <Modal visible={pickerIndex !== null} transparent animationType="slide" onRequestClose={() => setPickerIndex(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Produit</Text>
                <TouchableOpacity onPress={() => setPickerIndex(null)}>
                  <MaterialIcons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              {pickerIndex !== null && (
                <>
                  <Text style={styles.miniLabel}>Nouveau produit</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        placeholder="Nom du produit"
                        value={lines[pickerIndex].name}
                        onChangeText={v => updateLine(pickerIndex, { name: v })}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.okBtn}
                      onPress={() => setPickerIndex(null)}
                    >
                      <Text style={styles.okBtnText}>OK</Text>
                    </TouchableOpacity>
                  </View>
                  {existingProducts.length > 0 && <Text style={styles.miniLabel}>Déjà en stock</Text>}
                  <FlatList
                    data={existingProducts}
                    keyExtractor={(it: any) => String(it.id)}
                    style={{ maxHeight: 320 }}
                    renderItem={({ item }) => {
                      const nm = isFeed ? item.feed_type : item.product_name;
                      return (
                        <TouchableOpacity style={styles.prodRow} onPress={() => pickProduct(nm, item)}>
                          <Text style={styles.prodName}>{nm}</Text>
                          <Text style={styles.prodQty}>{Number(isFeed ? item.quantity_kg : item.quantity)} {isFeed ? 'kg' : (item.unit || '')}</Text>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={<Text style={styles.hint}>Aucun produit en stock pour l'instant.</Text>}
                  />
                </>
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.m, paddingTop: theme.spacing.l, maxWidth: 760, width: '100%', alignSelf: 'center' },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface, ...theme.shadows.light },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  card: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.m, borderWidth: 0.8, borderColor: theme.colors.border },
  group: { marginBottom: theme.spacing.m },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '900', textTransform: 'uppercase' },
  miniLabel: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '700', textTransform: 'uppercase' },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.background, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.border, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: theme.borderRadius.s },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  segmentTextActive: { color: '#fff' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.s },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center' },
  addBtnText: { color: theme.colors.primary, fontWeight: 'bold', marginLeft: 4 },
  lineCard: { padding: theme.spacing.m, marginBottom: theme.spacing.s, borderRadius: theme.borderRadius.l, borderWidth: 0.8, borderColor: theme.colors.border },
  lineTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  selector: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.m, paddingHorizontal: 12, height: 46, backgroundColor: theme.colors.inputBackground },
  selectorText: { fontSize: 14, color: theme.colors.text, flex: 1 },
  trash: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  lineRow: { flexDirection: 'row' },
  lineCalc: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.colors.primary, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.m, marginBottom: theme.spacing.s, paddingHorizontal: 4 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  totalValue: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  submit: { height: 56, borderRadius: theme.borderRadius.xl, marginTop: theme.spacing.s, borderWidth: 0.8, borderColor: theme.colors.border },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '82%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  okBtn: { paddingHorizontal: 16, height: 46, borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  okBtnText: { color: '#fff', fontWeight: 'bold' },
  prodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border },
  prodName: { fontSize: 15, color: theme.colors.text, fontWeight: '500' },
  prodQty: { fontSize: 13, color: theme.colors.textSecondary },
});
