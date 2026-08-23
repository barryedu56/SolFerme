import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Alert,
  TouchableOpacity, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getErrorMessage } from '../utils/errors';
import { toast } from '../utils/toast';
import { validateFarmCapacity } from '../repositories/dataSources/LocalApiFallback';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─── Type for extra expenses ────────────────────────────────────────────────
interface LotExpenseItem {
  id?: number;           // undefined = new (not yet created), >0 = existing on server
  localKey: string;     // unique key for React list rendering
  name: string;
  amount: string;       // string for text input
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _keyCounter = 0;
const genKey = () => `expense_${++_keyCounter}_${Date.now()}`;

const EXPENSE_SUGGESTIONS = [
  'Transport', 'Chargement', 'Vaccination', 'Déchargement',
  'Assurance', 'Taxe', 'Frais vétérinaire', 'Autre',
];

export const CreateLotScreen = ({ route, navigation }: any) => {
  const { farmId, farmName, lot, lotId: paramLotId } = route.params || {};
  const isEditing = !!lot;
  const editingLotId = paramLotId || lot?.id;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ─── Basic lot fields ───────────────────────────────────────────────────
  const [name, setName] = useState(lot?.name || '');
  const [animalType, setAnimalType] = useState(lot?.animal_type || 'Pondeuses');

  const breedParts = lot?.breed ? lot.breed.split(' - ') : ['Poule'];
  const [species, setSpecies] = useState(breedParts[0]);
  const [strain, setStrain] = useState(breedParts[1] || '');

  const [arrivalDate, setArrivalDate] = useState(
    lot?.purchase_date || new Date().toISOString().split('T')[0]
  );
  const [initialQuantity, setInitialQuantity] = useState(
    lot?.initial_quantity?.toString() || ''
  );
  const [currentQuantity, setCurrentQuantity] = useState(
    lot?.current_quantity?.toString() || ''
  );
  const [supplier, setSupplier] = useState(lot?.supplier || '');
  const [notes, setNotes] = useState(lot?.notes || '');
  const [status, setStatus] = useState(lot?.status || 'ACTIF');

  // ─── New cost fields ────────────────────────────────────────────────────
  // unitPrice: prix d'achat par sujet
  const [unitPrice, setUnitPrice] = useState(
    lot?.unit_price?.toString() || ''
  );
  // expenses: frais additionnels (liste dynamique)
  const [expenses, setExpenses] = useState<LotExpenseItem[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState<string | null>(null); // localKey of open suggestion

  const [loading, setLoading] = useState(false);
  const [showStrainSuggestions, setShowStrainSuggestions] = useState(false);

  // ─── Load existing expenses when editing ────────────────────────────────
  useEffect(() => {
    if (!isEditing || !editingLotId) return;
    setLoadingExpenses(true);
    repositoryProvider.lotExpense
      .getByLot(editingLotId)
      .then((data) => {
        setExpenses(
          data.map((e: any) => ({
            id: e.id,
            localKey: genKey(),
            name: e.name || '',
            amount: e.amount?.toString() || '',
          }))
        );
      })
      .catch(() => { /* best-effort */ })
      .finally(() => setLoadingExpenses(false));
  }, [isEditing, editingLotId]);

  // ─── Real-time summary calculations ────────────────────────────────────
  const qty = parseInt(initialQuantity) || 0;
  const unitPriceNum = parseFloat(unitPrice) || 0;
  const subjectsPrice = qty * unitPriceNum;
  const totalExtras = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const totalCost = subjectsPrice + totalExtras;
  const costPerSubject = qty > 0 ? totalCost / qty : 0;

  // ─── Expense helpers ────────────────────────────────────────────────────
  const addExpense = useCallback(() => {
    setExpenses((prev) => [...prev, { localKey: genKey(), name: '', amount: '' }]);
  }, []);

  const removeExpense = useCallback((localKey: string) => {
    setExpenses((prev) => prev.filter((e) => e.localKey !== localKey));
  }, []);

  const updateExpenseName = useCallback((localKey: string, value: string) => {
    setExpenses((prev) =>
      prev.map((e) => (e.localKey === localKey ? { ...e, name: value } : e))
    );
  }, []);

  const updateExpenseAmount = useCallback((localKey: string, value: string) => {
    setExpenses((prev) =>
      prev.map((e) => (e.localKey === localKey ? { ...e, amount: value } : e))
    );
  }, []);

  const pickSuggestion = useCallback((localKey: string, suggestion: string) => {
    updateExpenseName(localKey, suggestion);
    setShowSuggestions(null);
  }, [updateExpenseName]);

  // ─── Expense persistence helpers (online + offline) ──────────────────────
  const persistExpenses = async (lotServerId: number, newExpenses: LotExpenseItem[]) => {
    for (const expense of newExpenses) {
      if (!expense.name.trim()) continue;
      const amount = parseFloat(expense.amount) || 0;
      const payload = {
        lot: lotServerId,
        name: expense.name.trim(),
        amount,
      };

      if (expense.id) {
        // Update existing
        await repositoryProvider.lotExpense.update(expense.id, payload);
      } else {
        // Create new
        await repositoryProvider.lotExpense.create(payload);
      }
    }
  };

  const deleteRemovedExpenses = async (original: LotExpenseItem[], updated: LotExpenseItem[]) => {
    const updatedIds = new Set(updated.filter((e) => e.id).map((e) => e.id));
    const toDelete = original.filter((e) => e.id && !updatedIds.has(e.id));
    for (const expense of toDelete) {
      if (expense.id) {
        await repositoryProvider.lotExpense.delete(expense.id);
      }
    }
  };

  // ─── Validation ─────────────────────────────────────────────────────────
  const ANIMAL_TYPES = ['Pondeuses', 'Poulets de chair', 'Coqs', 'Pintades'];
  const STRAIN_SUGGESTIONS = ['ISA Brown', 'Lohmann Brown', 'Hy-Line Brown', 'Leghorn', 'Cobb'];
  const STATUS_OPTIONS = [
    { label: t('lots.status.active') || 'Actif', value: 'ACTIF' },
    { label: t('lots.status.finished') || 'Terminé', value: 'TERMINE' },
    { label: t('lots.status.archived') || 'Archivé', value: 'ARCHIVE' },
  ];

  // ─── Save handler ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name) {
      toast.error(t('common.error'), t('lots.messages.nameRequired'));
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast.error(t('common.error'), t('lots.messages.quantityRequired'));
      return;
    }

    const targetFarmId = farmId || lot?.farm || lot?.farm_id;
    if (targetFarmId) {
      try {
        await validateFarmCapacity({
          farm: targetFarmId,
          farm_id: targetFarmId,
          initial_quantity: qty,
          current_quantity: isEditing ? parseInt(currentQuantity) || qty : qty,
        }, isEditing ? editingLotId : undefined);
      } catch (validationErr: any) {
        if (validationErr?.message?.includes('Capacité ferme dépassée')) {
          toast.error(t('common.error'), validationErr.message);
          return;
        }
      }
    }

    setLoading(true);
    try {
      // Build payload: purchase_price = totalCost (coût total)
      // unit_price = prix unitaire
      // subjects_price = quantité × prix unitaire
      // extra_expenses = total des frais
      // real_cost_per_subject = totalCost / qty  (calculé aussi côté backend)
      const payload: Record<string, any> = {
        farm: targetFarmId,
        name,
        breed: strain ? `${species} - ${strain}` : species,
        purchase_date: arrivalDate,
        purchase_price: totalCost || parseFloat(unitPrice) || 0,
        unit_price: unitPriceNum || null,
        subjects_price: subjectsPrice || null,
        extra_expenses: totalExtras,
        real_cost_per_subject: costPerSubject || null,
        initial_quantity: qty,
        current_quantity: isEditing ? parseInt(currentQuantity) : qty,
        supplier,
        status,
      };

      let savedLot: any;
      let savedLotId: number;

      if (isEditing) {
        if (!editingLotId) {
          toast.error(t('common.error'), 'ID du lot manquant.');
          setLoading(false);
          return;
        }
        savedLot = await repositoryProvider.lot.update(editingLotId, payload);
        savedLotId = editingLotId;

        // Manage expense changes
        const previousExpenses = await repositoryProvider.lotExpense
          .getByLot(editingLotId)
          .then((arr) => arr.map((e: any) => ({
            id: e.id, localKey: '', name: e.name, amount: e.amount?.toString() || '',
          })))
          .catch(() => [] as LotExpenseItem[]);

        await deleteRemovedExpenses(previousExpenses, expenses);
        await persistExpenses(savedLotId, expenses);
        toast.success(t('common.success'), t('lots.messages.updateSuccess'));
      } else {
        savedLot = await repositoryProvider.lot.create(payload);
        savedLotId = savedLot.id;
        // Create all expenses
        if (savedLotId) {
          await persistExpenses(savedLotId, expenses);
        }
        toast.success(t('common.success'), t('lots.messages.createSuccess'));
      }

      navigation.goBack();
    } catch (error) {
      toast.error(
        'Action impossible',
        getErrorMessage(error, isEditing ? t('lots.messages.updateError') : t('lots.messages.createError'))
      );
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete / Archive handler ────────────────────────────────────────────
  const handleDelete = () => {
    const canDeleteDefinitively = !lot?.has_data;
    const actionTitle = canDeleteDefinitively ? t('common.delete') : t('common.archive');
    const actionMessage = canDeleteDefinitively
      ? t('lots.messages.deleteConfirmExtra')
      : t('lots.messages.hasDataDeleteError');

    Alert.alert(actionTitle, actionMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: actionTitle,
        style: 'destructive',
        onPress: async () => {
          try {
            if (canDeleteDefinitively) {
              await repositoryProvider.lot.delete(editingLotId);
              toast.success(t('common.success'), t('lots.deleteSuccess'));
            } else {
              // Note: repositoryProvider.lot doesn't have an archive method,
              // but we can add it or use direct API if it's a specific action.
              // For consistency, let's keep it direct for now or add to repo.
              await repositoryProvider.api.post(`/lots/${editingLotId}/archive/`);
              toast.success(t('common.success'), t('lots.archiveSuccess'));
            }
            navigation.pop(2);
          } catch (e) {
            toast.error(
              'Action impossible',
              getErrorMessage(e, canDeleteDefinitively ? t('lots.deleteError') : t('lots.messages.archiveError'))
            );
          }
        },
      },
    ]);
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const formatCurrency = (val: number) =>
    val.toLocaleString('fr-FR') + ' GNF';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? t('lots.form.editTitle') : t('lots.form.newTitle')}
          </Text>
          {isEditing ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <MaterialIcons
                name={lot?.has_data ? 'archive' : 'delete-outline'}
                size={24}
                color={theme.colors.danger}
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Farm context */}
          <Card style={styles.farmContextCard}>
            <MaterialIcons name="business" size={20} color={theme.colors.primary} />
            <Text style={styles.farmContextText}>
              {t('lots.form.assignment')}: <Text style={{ fontWeight: 'bold' }}>{farmName || t('lots.form.farmAttached')}</Text>
            </Text>
          </Card>

          {/* Animal type */}
          <Text style={styles.sectionTitle}>{t('lots.form.breedingType')}</Text>
          <View style={styles.typeSelector}>
            {ANIMAL_TYPES.map(at => (
              <TouchableOpacity
                key={at}
                style={[styles.typeButton, animalType === at && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                onPress={() => setAnimalType(at)}
              >
                <Text style={[styles.typeButtonText, animalType === at && { color: theme.colors.text, fontWeight: 'bold' }]}>{at}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Lot identity */}
          <Text style={styles.sectionTitle}>{t('lots.form.lotIdentity')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="label" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('lots.form.nameLabel')}</Text>
              </View>
              <Input
                placeholder={t('lots.form.namePlaceholder')}
                value={name}
                onChangeText={setName}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="egg" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('lots.form.species')}</Text>
                </View>
                <Input
                  placeholder={t('lots.form.speciesPlaceholder')}
                  value={species}
                  onChangeText={setSpecies}
                  style={styles.fieldInput}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <MaterialCommunityIcons name="dna" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('lots.strain')}</Text>
                </View>
                <Input
                  placeholder={t('lots.form.strainPlaceholder')}
                  value={strain}
                  onChangeText={(text) => {
                    setStrain(text);
                    setShowStrainSuggestions(text.length > 0);
                  }}
                  style={styles.fieldInput}
                />
                {showStrainSuggestions && (
                  <View style={styles.suggestionsContainer}>
                    {STRAIN_SUGGESTIONS.filter(s => s.toLowerCase().includes(strain.toLowerCase())).map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.suggestionItem}
                        onPress={() => { setStrain(item); setShowStrainSuggestions(false); }}
                      >
                        <Text style={styles.suggestionText}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </Card>

          {/* Status */}
          <Text style={styles.sectionTitle}>{t('lots.form.lotStatus')}</Text>
          <View style={styles.typeSelector}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeButton, status === opt.value && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                onPress={() => setStatus(opt.value)}
              >
                <Text style={[styles.typeButtonText, status === opt.value && { color: theme.colors.text, fontWeight: 'bold' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Entry details */}
          <Text style={styles.sectionTitle}>{t('lots.form.entryDetails')}</Text>
          <Card style={styles.formCard}>
            <DatePicker label={t('lots.form.setupDate')} value={arrivalDate} onChange={setArrivalDate} />

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="group-add" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('lots.initialQty')}</Text>
                </View>
                <Input
                  placeholder="0"
                  value={initialQuantity}
                  onChangeText={setInitialQuantity}
                  isNumeric
                  style={styles.fieldInput}
                />
              </View>
              {isEditing && (
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="groups" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('lots.currentQty')}</Text>
                  </View>
                  <Input
                    placeholder="0"
                    value={currentQuantity}
                    onChangeText={setCurrentQuantity}
                    isNumeric
                    style={styles.fieldInput}
                  />
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialCommunityIcons name="egg" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('lots.supplier')}</Text>
              </View>
              <Input
                placeholder={t('lots.form.supplierPlaceholder')}
                value={supplier}
                onChangeText={setSupplier}
                style={styles.fieldInput}
              />
            </View>

            <View style={[styles.inputGroup, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <MaterialIcons name="notes" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('common.notes')} ({t('common.unknown').toLowerCase()})</Text>
              </View>
              <Input
                placeholder={t('lots.form.notesPlaceholder')}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]}
              />
            </View>
          </Card>

          {/* ─── NEW: Cost calculation section ───────────────────────────── */}
          <Text style={styles.sectionTitle}>💰 Coût d'acquisition</Text>
          <Card style={styles.formCard}>
            {/* Unit price */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="attach-money" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>Prix unitaire par sujet (GNF)</Text>
                <View style={styles.badgeOptional}><Text style={styles.badgeText}>Nouveau</Text></View>
              </View>
              <Input
                placeholder="Ex: 5000"
                value={unitPrice}
                onChangeText={setUnitPrice}
                isNumeric
                style={styles.fieldInput}
              />
              {unitPriceNum > 0 && qty > 0 && (
                <Text style={styles.subCalc}>
                  Prix des sujets = {qty} × {unitPriceNum.toLocaleString('fr-FR')} = {formatCurrency(subjectsPrice)}
                </Text>
              )}
            </View>

            {/* Extra expenses */}
            <View style={styles.expensesHeader}>
              <View style={styles.labelRow}>
                <MaterialIcons name="receipt-long" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>Frais supplémentaires</Text>
              </View>
              <TouchableOpacity style={styles.addExpenseBtn} onPress={addExpense}>
                <MaterialIcons name="add-circle" size={22} color={theme.colors.primary} />
                <Text style={styles.addExpenseBtnText}>Ajouter</Text>
              </TouchableOpacity>
            </View>

            {loadingExpenses ? (
              <Text style={styles.loadingText}>Chargement des frais…</Text>
            ) : expenses.length === 0 ? (
              <TouchableOpacity style={styles.emptyExpensesHint} onPress={addExpense}>
                <MaterialIcons name="add-box" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.emptyExpensesText}>
                  Ajouter transport, vaccination, chargement…
                </Text>
              </TouchableOpacity>
            ) : (
              expenses.map((expense) => (
                <View key={expense.localKey} style={styles.expenseRow}>
                  <View style={{ flex: 2, marginRight: 8 }}>
                    <Input
                      placeholder="Ex: Transport"
                      value={expense.name}
                      onChangeText={(v) => {
                        updateExpenseName(expense.localKey, v);
                        setShowSuggestions(v.length > 0 ? expense.localKey : null);
                      }}
                      style={styles.fieldInput}
                    />
                    {showSuggestions === expense.localKey && (
                      <View style={[styles.suggestionsContainer, { zIndex: 999 }]}>
                        {EXPENSE_SUGGESTIONS.filter(s =>
                          s.toLowerCase().includes(expense.name.toLowerCase())
                        ).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={styles.suggestionItem}
                            onPress={() => pickSuggestion(expense.localKey, s)}
                          >
                            <Text style={styles.suggestionText}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1.5, marginRight: 8 }}>
                    <Input
                      placeholder="0 GNF"
                      value={expense.amount}
                      onChangeText={(v) => updateExpenseAmount(expense.localKey, v)}
                      isNumeric
                      style={styles.fieldInput}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeExpenseBtn}
                    onPress={() => removeExpense(expense.localKey)}
                  >
                    <MaterialIcons name="remove-circle-outline" size={24} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Card>

          {/* ─── Real-time cost summary ──────────────────────────────────── */}
          {(unitPriceNum > 0 || totalExtras > 0) && (
            <Card style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <MaterialIcons name="calculate" size={20} color={theme.colors.primary} />
                <Text style={styles.summaryTitle}>Récapitulatif du coût</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Prix des sujets</Text>
                <Text style={styles.summaryValue}>{formatCurrency(subjectsPrice)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Frais supplémentaires</Text>
                <Text style={[styles.summaryValue, { color: theme.colors.warning || '#F59E0B' }]}>
                  + {formatCurrency(totalExtras)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { fontWeight: '700', color: theme.colors.text }]}>Coût total</Text>
                <Text style={[styles.summaryValue, { fontWeight: '700', color: theme.colors.primary, fontSize: 16 }]}>
                  {formatCurrency(totalCost)}
                </Text>
              </View>
              {qty > 0 && (
                <View style={[styles.summaryRow, styles.summaryHighlight]}>
                  <Text style={[styles.summaryLabel, { color: theme.colors.primary }]}>
                    Coût réel / sujet
                  </Text>
                  <Text style={[styles.summaryValue, { color: theme.colors.primary, fontWeight: '700' }]}>
                    {formatCurrency(costPerSubject)}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Submit */}
          <Button
            title={isEditing ? t('lots.form.updateBtn') : t('lots.form.createBtn')}
            onPress={handleSave}
            loading={loading}
            style={styles.submitBtn}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
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
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center',
    ...theme.shadows.light,
  },
  deleteBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.danger + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 60 },
  scrollDesktop: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  farmContextCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: theme.spacing.m, borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.l, backgroundColor: theme.colors.surface,
  },
  farmContextText: { marginLeft: 10, fontSize: 14, color: theme.colors.textSecondary },
  sectionTitle: {
    fontSize: 16, fontWeight: 'bold', color: theme.colors.text,
    marginBottom: theme.spacing.m, marginLeft: 4,
  },
  formCard: {
    padding: theme.spacing.m, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600', marginLeft: 8 },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background + '40',
    borderRadius: theme.borderRadius.m,
  },
  row: { flexDirection: 'row' },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.l },
  typeButton: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.surface,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  typeButtonText: { fontSize: 13, color: theme.colors.textSecondary },
  submitBtn: {
    height: 56, borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary, marginTop: theme.spacing.m,
    ...theme.shadows.medium,
  },
  cancelBtn: { marginTop: theme.spacing.m, alignItems: 'center', padding: theme.spacing.m },
  cancelText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' },
  suggestionsContainer: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.m,
    marginTop: 4, borderWidth: 0.8, borderColor: theme.colors.border,
  },
  suggestionItem: { padding: 10, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border },
  suggestionText: { fontSize: 13, color: theme.colors.text },

  // ─── Cost section styles ────────────────────────────────────────────────
  badgeOptional: {
    marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: theme.colors.primary + '25',
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, color: theme.colors.primary, fontWeight: '700' },
  subCalc: {
    fontSize: 12, color: theme.colors.textSecondary,
    marginTop: 4, fontStyle: 'italic',
  },
  expensesHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  addExpenseBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.m,
  },
  addExpenseBtnText: {
    fontSize: 13, color: theme.colors.primary, fontWeight: '600', marginLeft: 4,
  },
  emptyExpensesHint: {
    flexDirection: 'row', alignItems: 'center',
    padding: theme.spacing.m,
    backgroundColor: theme.colors.background + '60',
    borderRadius: theme.borderRadius.m,
    borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border,
    marginBottom: theme.spacing.s,
  },
  emptyExpensesText: {
    fontSize: 13, color: theme.colors.textSecondary,
    marginLeft: 8, flex: 1,
  },
  expenseRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: theme.spacing.s,
  },
  removeExpenseBtn: {
    padding: 4, justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', padding: 12 },

  // ─── Summary card ───────────────────────────────────────────────────────
  summaryCard: {
    padding: theme.spacing.m, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: theme.colors.primary + '40',
  },
  summaryHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m,
  },
  summaryTitle: {
    fontSize: 15, fontWeight: '700', color: theme.colors.text, marginLeft: 8,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 14, color: theme.colors.textSecondary },
  summaryValue: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  summaryDivider: {
    height: 1, backgroundColor: theme.colors.border, marginVertical: 8,
  },
  summaryHighlight: {
    marginTop: 4, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: theme.borderRadius.m,
  },
});