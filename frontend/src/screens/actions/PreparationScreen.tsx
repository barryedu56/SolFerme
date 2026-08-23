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

export const PreparationScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth() as any;
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lotId, farmId } = route.params || {};

  useEffect(() => {
    // Les employés peuvent préparer des aliments (FeedPreparationViewSet backend: IsAuthenticated)
    // La validation se fait via les permissions backend et le contrôle des stocks
  }, [userRole]);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [feedName, setFeedName] = useState('');
  const [totalQuantity, setTotalQuantity] = useState('');
  const [ingredients, setIngredients] = useState([{ material_name: '', quantity_used_kg: '' }]);
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
      // Récupération des matières premières par LOT uniquement
      const params: any = {};
      if (lotId) params.lot = lotId;
      else if (farmId) params.farm = farmId;
      const response = await repositoryProvider.api.get<any[]>('/feed-inventory/', { params });
      setRawMaterials(response.data);
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

    if (!lotId) {
      Alert.alert(t('common.error'), "Un lot doit être spécifié pour cette préparation.");
      return;
    }

    const finalQty = parseFloat(totalQuantity);
    if (!date || !feedName || !totalQuantity || ingredients.some(i => !i.material_name || !i.quantity_used_kg)) {
      Alert.alert(t('common.error'), t('feed.fillRequiredPreparation'));
      return;
    }

    if (finalQty <= 0) {
      Alert.alert(t('common.error'), t('common.invalidQuantity'));
      return;
    }

    // Validation: vérifier le stock de matières premières pour chaque ingrédient
    for (const ing of ingredients) {
      const materialName = ing.material_name;
      const neededQty = parseFloat(ing.quantity_used_kg);
      const material = rawMaterials.find((m: any) => m.feed_type === materialName);
      const available = material ? parseFloat(material.quantity_kg || '0') : 0;
      if (available < neededQty) {
        Alert.alert(
          t('common.error'),
          `Stock insuffisant pour "${materialName}". Disponible: ${available} kg, requis: ${neededQty} kg.`
        );
        return;
      }
    }

    setLoading(true);
    // Correction: farm retiré (FeedPreparation n'a pas de champ farm, seulement lot)
    const payload = {
      lot: lotId || undefined,
      feed_name: feedName,
      quantity_produced_kg: parseFloat(totalQuantity),
      date,
      ingredients: ingredients.map(i => ({
        material_name: i.material_name,
        quantity_used_kg: parseFloat(i.quantity_used_kg)
      }))
    };

    try {
      await repositoryProvider.api.post('/feed-preparations/', payload);
      Alert.alert(t('common.success'), t('feed.preparationSuccess'));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('common.actionImpossible'), getErrorMessage(e, t('feed.preparationError')));
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
          <Text style={styles.headerTitle}>{t('feed.titlePreparation')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          <Card style={styles.infoCard}>
            <DatePicker value={date} onChange={setDate} />
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
            title={t('feed.submitPreparation')}
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
  scrollDesktop: { maxWidth: 680, width: '100%', alignSelf: 'center' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  materialItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border },
  materialName: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  materialStock: { fontSize: 14, color: theme.colors.textSecondary },
  emptyText: { textAlign: 'center', marginTop: 20, color: theme.colors.textSecondary }
});