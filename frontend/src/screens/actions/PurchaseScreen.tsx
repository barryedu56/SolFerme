import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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
import { useBreakpoint } from '../../hooks/useBreakpoint';

export const PurchaseScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;
  const { isDesktop } = useBreakpoint();
  const { type = 'feed', farmId: initialFarmId, lotId: initialLotId, item } = route.params || {};

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      Alert.alert(t('common.accessDenied'), t('purchase.ownerOnly'));
      navigation.goBack();
    }
  }, [userRole]);

  // Édition seulement si l'item a un id ; un item partiel {feed_type} sert juste
  // à pré-remplir le nom (réapprovisionnement depuis la vue Stock).
  const [isEdit] = useState(!!(item && item.id));
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [productName, setProductName] = useState(item?.feed_type || item?.product_name || '');
  const [quantity, setQuantity] = useState(item?.quantity_kg?.toString() || item?.quantity?.toString() || '');
  const [totalPrice, setTotalPrice] = useState(item?.total_price?.toString() || '');
  // Mode de saisie du prix : 'total' (prix total direct, historique) ou 'unit'
  // (prix par unité → le système calcule le total). item.unit_price non-nul
  // signifie que l'achat avait été saisi en mode « par unité ».
  const [priceMode, setPriceMode] = useState<'total' | 'unit'>(item?.unit_price ? 'unit' : 'total');
  const [unitPrice, setUnitPrice] = useState(item?.unit_price?.toString() || '');
  const [supplier, setSupplier] = useState(item?.supplier || '');
  const [productType, setProductType] = useState(item?.product_type || (type === 'health' ? 'Autre' : ''));
  const [unit, setUnit] = useState(item?.unit || (type === 'health' ? 'Flacon' : ''));
  const [loading, setLoading] = useState(false);

  // Sélection Ferme
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(item?.farm || item?.farm_id || initialFarmId || null);
  // Sélection Lot
  const [selectedLotId, setSelectedLotId] = useState<number | null>(item?.lot || item?.lot_id || initialLotId || null);

  // 🔧 Fallback SQLite : si userFarms (AsyncStorage) est vide, charger depuis la DB locale
  const [localFarms, setLocalFarms] = useState<any[]>([]);
  useEffect(() => {
    if (userRole === 'EMPLOYE') return;
    const farms = userFarms?.length ? userFarms : [];
    if (farms.length === 0 || !farms[0]?.lots) {
      fetchRows<any>('farms', "status = 'ACTIF'").then(dbFarms => {
        if (dbFarms?.length) setLocalFarms(dbFarms.map((f: any) => ({ id: f.id, name: f.name })));
      }).catch(() => {});
    } else {
      setLocalFarms(farms);
    }
  }, [userFarms, userRole]);

  // 🔧 Fallback SQLite pour les lots : charger depuis la DB locale si userFarms n'a pas les lots
  const [localLots, setLocalLots] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedFarmId) { setLocalLots([]); return; }
    // D'abord essayer via userFarms
    const farm = userFarms?.find((f: any) => f.id === selectedFarmId);
    if (farm?.lots?.length) {
      setLocalLots(farm.lots.filter((l: any) => l.status === 'ACTIF'));
      return;
    }
    // Sinon charger depuis SQLite
    fetchRows<any>('lots', "farm_id = ? AND status = 'ACTIF'", [selectedFarmId])
      .then(rows => setLocalLots(rows.map((l: any) => ({ id: l.id, name: l.name, status: l.status }))))
      .catch(() => setLocalLots([]));
  }, [selectedFarmId, userFarms]);

  // Init: si farmId fourni et un seul lot dans la ferme, on le pré-sélectionne
  useEffect(() => {
    if (initialFarmId && !initialLotId) {
      const farm = userFarms?.find((f: any) => f.id === initialFarmId);
      if (farm?.lots?.length === 1) {
        setSelectedLotId(farm.lots[0].id);
      } else if (localLots.length === 1) {
        setSelectedLotId(localLots[0].id);
      }
    }
  }, [initialFarmId, userFarms, localLots]);

  const currentFarmLots = useMemo(() => {
    if (!selectedFarmId) return [];
    return localLots;
  }, [selectedFarmId, localLots]);

  // Unité de référence pour le prix « par unité »
  const priceUnit = type === 'feed' ? 'kg' : (unit || 'unité');
  // Total calculé par le système en mode « par unité »
  const computedTotal = useMemo(() => {
    const q = parseFloat((quantity || '').toString().replace(/\s/g, '').replace(',', '.')) || 0;
    const u = parseFloat((unitPrice || '').toString().replace(/\s/g, '').replace(',', '.')) || 0;
    return q * u;
  }, [quantity, unitPrice]);
  // Prix total effectif selon le mode de saisie
  const effectiveTotal = priceMode === 'unit'
    ? computedTotal
    : (parseFloat((totalPrice || '').toString().replace(/\s/g, '').replace(',', '.')) || 0);

  const handleSubmit = async () => {
    if (loading) return;
    if (!productName || !quantity || !selectedFarmId) {
      Alert.alert(t('common.error'), 'Veuillez remplir les champs obligatoires (produit, quantité, ferme).');
      return;
    }
    if (priceMode === 'unit' ? !(parseFloat(unitPrice) > 0) : !(effectiveTotal > 0)) {
      Alert.alert(t('common.error'), priceMode === 'unit' ? 'Veuillez saisir un prix par unité valide.' : 'Veuillez saisir le prix total.');
      return;
    }

    setLoading(true);
    const endpoint = type === 'feed' ? '/feed-purchases/' : '/health-purchases/';
    const payload = {
      farm: selectedFarmId,
      lot: selectedLotId || null,
      date,
      supplier,
      total_price: Math.round(effectiveTotal * 100) / 100,
      unit_price: priceMode === 'unit' ? (Math.round(parseFloat(unitPrice) * 100) / 100) : null,
      ...(type === 'feed'
        ? { feed_type: productName, quantity_kg: parseFloat(quantity) }
        : { product_name: productName, quantity: parseFloat(quantity), product_type: productType || 'Autre', unit: unit || 'Flacon' }
      )
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`${endpoint}${item.id}/`, payload);
        Alert.alert(t('common.success'), 'Achat mis à jour avec succès.');
      } else {
        await repositoryProvider.api.post(endpoint, payload);
        Alert.alert(t('common.success'), t('purchase.success'));
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('common.error'), getErrorMessage(e, t('purchase.error')));
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {type === 'feed' ? t('purchase.feedTitle') : t('purchase.healthTitle')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]}>
          <Card style={styles.formCard}>

            {/* --- SÉLECTION FERME --- */}
            {!initialFarmId && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Ferme *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(localFarms.length > 0 ? localFarms : userFarms || []).map((farm: any) => (
                    <TouchableOpacity
                      key={farm.id}
                      style={[styles.chip, selectedFarmId === farm.id && styles.chipActive]}
                      onPress={() => { setSelectedFarmId(farm.id); setSelectedLotId(null); }}
                    >
                      <Text style={[styles.chipText, selectedFarmId === farm.id && styles.chipTextActive]}>
                        {farm.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* --- SÉLECTION LOT (optionnel : impute le coût à un lot) --- */}
            {selectedFarmId && !initialLotId && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Lot (optionnel — impute le coût à ce lot)</Text>
                {currentFarmLots.length === 0 ? (
                  <Text style={styles.noLotText}>Le stock ira à la ferme. Aucun lot actif pour l'imputation du coût.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                      style={[styles.chip, !selectedLotId && styles.chipActive]}
                      onPress={() => setSelectedLotId(null)}
                    >
                      <Text style={[styles.chipText, !selectedLotId && styles.chipTextActive]}>Ferme entière</Text>
                    </TouchableOpacity>
                    {currentFarmLots.filter((l: any) => l.status !== 'ARCHIVE').map((lot: any) => (
                      <TouchableOpacity
                        key={lot.id}
                        style={[styles.chip, selectedLotId === lot.id && styles.chipActive]}
                        onPress={() => setSelectedLotId(lot.id)}
                      >
                        <Text style={[styles.chipText, selectedLotId === lot.id && styles.chipTextActive]}>
                          {lot.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Lot pré-sélectionné (mode depuis un lot) */}
            {initialLotId && (
              <View style={[styles.infoBox]}>
                <MaterialIcons name="info-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.infoText]}>
                  Le stock entre dans le stock général de la ferme. Le coût de cet achat est imputé au lot sélectionné.
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('purchase.productName')}</Text>
              <Input
                placeholder={type === 'feed' ? t('purchase.placeholderFeed') : t('purchase.placeholderHealth')}
                value={productName}
                onChangeText={setProductName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('purchase.quantity')} ({priceUnit})</Text>
              <Input
                placeholder="0"
                value={quantity}
                onChangeText={setQuantity}
                isNumeric
              />
            </View>

            {/* --- MODE DE SAISIE DU PRIX --- */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Prix</Text>
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
                  <Text style={[styles.segmentText, priceMode === 'unit' && styles.segmentTextActive]}>Prix par {priceUnit}</Text>
                </TouchableOpacity>
              </View>

              {priceMode === 'total' ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.label}>{t('purchase.totalPrice')} (GNF)</Text>
                  <Input placeholder="0" value={totalPrice} onChangeText={setTotalPrice} isNumeric />
                </View>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.label}>Prix par {priceUnit} (GNF)</Text>
                  <Input placeholder="0" value={unitPrice} onChangeText={setUnitPrice} isNumeric />
                  <View style={styles.computedBox}>
                    <MaterialIcons name="calculate" size={16} color={theme.colors.primary} />
                    <Text style={styles.computedText}>
                      Prix total : {computedTotal.toLocaleString('fr-FR')} GNF
                      {quantity ? `  (${quantity} ${priceUnit} × ${unitPrice || 0})` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('purchase.supplier')}</Text>
              <Input
                placeholder={t('purchase.placeholderSupplier')}
                value={supplier}
                onChangeText={setSupplier}
              />
            </View>

            {/* Correction: champs product_type et unit pour les achats santé */}
            {type === 'health' && (
              <>
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.label}>Type de produit</Text>
                    <Input
                      placeholder="Autre"
                      value={productType}
                      onChangeText={setProductType}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Unité</Text>
                    <Input
                      placeholder="Flacon"
                      value={unit}
                      onChangeText={setUnit}
                    />
                  </View>
                </View>
              </>
            )}

            <DatePicker label={t('purchase.date')} value={date} onChange={setDate} />
          </Card>

          <Button
            title={t('purchase.submit')}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.m, paddingTop: theme.spacing.l, maxWidth: 760, width: '100%', alignSelf: 'center' },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface, ...theme.shadows.light },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  scrollDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  formCard: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.l, borderWidth: 0.8, borderColor: theme.colors.border },
  inputGroup: { marginBottom: theme.spacing.m },
  label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row' },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, marginTop: theme.spacing.m, borderWidth: 0.8, borderColor: theme.colors.border },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: theme.colors.background, marginRight: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  noLotText: { fontSize: 13, color: theme.colors.textSecondary, fontStyle: 'italic' },
  segment: {
    flexDirection: 'row', backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.border, padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: theme.borderRadius.s },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  segmentTextActive: { color: '#fff' },
  computedBox: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8,
    backgroundColor: theme.colors.primary + '15', borderRadius: theme.borderRadius.m, padding: 10,
  },
  computedText: { fontSize: 13, color: theme.colors.primary, marginLeft: 8, flex: 1, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.m, padding: 10, marginBottom: theme.spacing.m,
  },
  infoText: { fontSize: 12, color: theme.colors.primary, marginLeft: 8, flex: 1, fontWeight: '500' },
});