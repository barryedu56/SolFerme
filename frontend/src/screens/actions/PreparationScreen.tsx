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
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../../utils/toast';

// RNW ne rend pas les Alert de manière fiable → toast sur web, Alert sur natif.
const notify = (title: string, msg: string, kind: 'error' | 'success' = 'error') => {
  if (Platform.OS === 'web') { kind === 'success' ? toast.success(title, msg) : toast.error(title, msg); }
  else Alert.alert(title, msg);
};

export const PreparationScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { item } = route.params || {};
  const isEdit = !!(item && item.id);
  const routeLotId = route.params?.lotId ?? item?.lot ?? item?.lot_id ?? null;

  // Ferme de rattachement du mélange (obligatoire)
  const farmId: number | undefined = route.params?.farmId ?? item?.farm ?? item?.farm_id
    ?? (routeLotId ? userFarms?.find((f: any) => (f.lots || []).some((l: any) => l.id === routeLotId))?.id : undefined);

  // Lot rattaché (optionnel) : réserve l'aliment produit à ce lot. null = ferme entière.
  const [selectedLotId, setSelectedLotId] = useState<number | null>(routeLotId ?? null);

  const farmLots = useMemo(
    () => (userFarms?.find((f: any) => f.id === farmId)?.lots || []).filter((l: any) => l.status !== 'ARCHIVE'),
    [userFarms, farmId]
  );

  useEffect(() => {
    // Les employés peuvent préparer des aliments (FeedPreparationViewSet backend: IsAuthenticated)
    // La validation se fait via les permissions backend et le contrôle des stocks
  }, [userRole]);

  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [feedName, setFeedName] = useState(item?.feed_name || '');
  const [totalQuantity, setTotalQuantity] = useState(item?.quantity_produced_kg?.toString() || '');
  const [ingredients, setIngredients] = useState<{ material_name: string; quantity_used_kg: string }[]>(
    item?.ingredients?.length
      ? item.ingredients.map((i: any) => ({
          material_name: i.material_name || '',
          quantity_used_kg: (i.quantity_used_kg ?? '').toString(),
        }))
      : [{ material_name: '', quantity_used_kg: '' }]
  );
  const [loading, setLoading] = useState(false);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentIngredientIndex, setCurrentIngredientIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchRawMaterials();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchRawMaterials();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchRawMaterials = async () => {
    try {
      // Matières premières = stock général de la FERME
      const params: any = {};
      if (farmId) params.farm = farmId;
      const response = await repositoryProvider.api.get<any[]>('/feed-inventory/', { params });
      setRawMaterials(Array.isArray(response.data) ? response.data : (response.data as any)?.results || []);
    } catch (e) {
      console.error("Error fetching raw materials", e);
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { material_name: '', quantity_used_kg: '' }]);
  };

  const removeIngredient = (index: number) => {
    const newIngredients = [...ingredients];
    newIngredients.splice(index, 1);
    setIngredients(newIngredients);
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    const newIngredients = [...ingredients];
    (newIngredients[index] as any)[field] = value;
    setIngredients(newIngredients);
  };

  const selectMaterial = (materialName: string) => {
    if (currentIngredientIndex !== null) {
      updateIngredient(currentIngredientIndex, 'material_name', materialName);
    }
    setIsModalVisible(false);
  };

  const theoreticalQty = useMemo(() => {
    return ingredients.reduce((sum, item) => {
      const q = parseFloat(item.quantity_used_kg) || 0;
      return sum + q;
    }, 0);
  }, [ingredients]);

  useEffect(() => {
    if (theoreticalQty > 0) {
      setTotalQuantity(theoreticalQty.toString());
    }
  }, [theoreticalQty]);

  const handleSubmit = async () => {
    if (loading) return;

    if (!farmId) {
      notify(t('common.error'), "Ferme introuvable pour ce mélange.");
      return;
    }

    const finalQty = parseFloat(totalQuantity);
    if (!date || !feedName || !totalQuantity || ingredients.some(i => !i.material_name || !i.quantity_used_kg)) {
      notify(t('common.error'), t('feed.fillRequiredPreparation'));
      return;
    }

    if (finalQty <= 0) {
      notify(t('common.error'), t('common.invalidQuantity'));
      return;
    }

    // Pré-vérification du stock de matières premières — SEULEMENT à la création.
    // En édition, les ingrédients actuels ont déjà été déduits du stock ; le
    // contrôle client-side (qui ne les recrédite pas) rejetterait à tort un
    // simple changement de date. Le backend valide correctement (exclude_id).
    if (!isEdit) {
      for (const ing of ingredients) {
        const materialName = ing.material_name;
        const neededQty = parseFloat(ing.quantity_used_kg);
        const material = rawMaterials.find((m: any) => m.feed_type === materialName);
        const available = material ? parseFloat(material.quantity_kg || '0') : 0;
        if (available < neededQty) {
          notify(
            t('common.error'),
            `Stock insuffisant pour "${materialName}". Disponible: ${available} kg, requis: ${neededQty} kg.`
          );
          return;
        }
      }
    }

    setLoading(true);
    const payload = {
      farm: farmId,
      lot: selectedLotId || null,
      feed_name: feedName,
      quantity_produced_kg: parseFloat(totalQuantity),
      date,
      ingredients: ingredients.map(i => ({
        material_name: i.material_name,
        quantity_used_kg: parseFloat(i.quantity_used_kg)
      }))
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/feed-preparations/${item.id}/`, payload);
        notify(t('common.success'), t('feed.updated'), 'success');
      } else {
        await repositoryProvider.api.post('/feed-preparations/', payload);
        notify(t('common.success'), t('feed.preparationSuccess'), 'success');
      }
      navigation.goBack();
    } catch (e: any) {
      notify(t('common.actionImpossible'), getErrorMessage(e, t('feed.preparationError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? t('common.edit') : t('feed.titlePreparation')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          <Card style={styles.infoCard}>
            <DatePicker value={date} onChange={setDate} />

            {/* Rattachement du mélange : ferme entière (défaut) ou un lot précis */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Aliment préparé pour</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.lotChip, selectedLotId == null && styles.lotChipActive]}
                  onPress={() => setSelectedLotId(null)}
                >
                  <Text style={[styles.lotChipText, selectedLotId == null && styles.lotChipTextActive]}>Ferme entière</Text>
                </TouchableOpacity>
                {farmLots.map((lot: any) => (
                  <TouchableOpacity
                    key={lot.id}
                    style={[styles.lotChip, selectedLotId === lot.id && styles.lotChipActive]}
                    onPress={() => setSelectedLotId(lot.id)}
                  >
                    <Text style={[styles.lotChipText, selectedLotId === lot.id && styles.lotChipTextActive]}>{lot.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.hint}>
                {selectedLotId == null
                  ? "L'aliment produit entre dans le stock général de la ferme."
                  : "L'aliment produit est réservé à ce lot."}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('feed.preparedName')}</Text>
              <Input
                placeholder={t('feed.placeholderPreparedName')}
                value={feedName}
                onChangeText={setFeedName}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('feed.totalProduced')}</Text>
                <View style={styles.theoreticalBox}>
                  <Text style={styles.theoreticalValue}>{theoreticalQty} kg</Text>
                </View>
              </View>
            </View>
          </Card>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('feed.ingredients')}</Text>
            <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
              <MaterialIcons name="add" size={20} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>

          {ingredients.map((ingredient, index) => (
            <Card key={index} style={styles.ingredientCard}>
              <View style={styles.ingredientRow}>
                <View style={{ flex: 2, marginRight: 10 }}>
                  <Text style={styles.label}>{t('feed.rawMaterial')}</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => {
                      setCurrentIngredientIndex(index);
                      setIsModalVisible(true);
                    }}
                  >
                    <Text style={[styles.selectorText, !ingredient.material_name && { color: theme.colors.textSecondary }]}>
                      {ingredient.material_name || t('feed.selectMaterial')}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.label}>{t('feed.quantity') + ' (kg)'}</Text>
                  <Input
                    placeholder="0"
                    value={ingredient.quantity_used_kg}
                    onChangeText={(val) => updateIngredient(index, 'quantity_used_kg', val)}
                    isNumeric
                    style={styles.fieldInput}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => removeIngredient(index)}
                  style={styles.removeButton}
                  disabled={ingredients.length === 1}
                >
                  <MaterialIcons name="delete-outline" size={24} color={ingredients.length === 1 ? theme.colors.border : "#FF5252"} />
                </TouchableOpacity>
              </View>
            </Card>
          ))}

          <Button
            title={isEdit ? t('common.update') : t('feed.submitPreparation')}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>

        <Modal visible={isModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('feed.selectMaterial')}</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={rawMaterials}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.materialItem}
                    onPress={() => selectMaterial(item.feed_type)}
                  >
                    <Text style={styles.materialName}>{item.feed_type}</Text>
                    <Text style={styles.materialStock}>{item.quantity_kg} kg</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>{t('common.noData')}</Text>}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
    backgroundColor: theme.colors.background,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  infoCard: { padding: theme.spacing.m, marginBottom: theme.spacing.m, borderRadius: theme.borderRadius.l },
  inputGroup: { marginTop: theme.spacing.m },
  label: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase' },
  fieldInput: { marginBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  theoreticalBox: {
    height: 50,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  theoreticalValue: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: 'bold',
  },
  inputWarning: {
    borderColor: '#FF9800',
    borderWidth: 1.5,
  },
  lossIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: theme.borderRadius.s,
  },
  lossText: {
    fontSize: 12,
    color: '#E65100',
    marginLeft: 6,
    fontWeight: '500',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  addButton: { flexDirection: 'row', alignItems: 'center' },
  addButtonText: { color: theme.colors.primary, fontWeight: 'bold', marginLeft: 4 },
  ingredientCard: { padding: theme.spacing.m, marginBottom: theme.spacing.s, borderRadius: theme.borderRadius.m },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-end' },
  removeButton: { height: 48, justifyContent: 'center', alignItems: 'center' },
  submitBtn: { marginTop: theme.spacing.l, height: 56, borderRadius: theme.borderRadius.xl },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.m,
    padding: 12,
    backgroundColor: theme.colors.inputBackground,
    height: 50,
  },
  selectorText: { fontSize: 14, color: theme.colors.text },
  lotChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, marginRight: 8, marginTop: 4,
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border,
  },
  lotChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  lotChipText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  lotChipTextActive: { color: '#fff', fontWeight: 'bold' },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  materialItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border },
  materialName: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  materialStock: { fontSize: 14, color: theme.colors.textSecondary },
  emptyText: { textAlign: 'center', marginTop: 20, color: theme.colors.textSecondary }
});