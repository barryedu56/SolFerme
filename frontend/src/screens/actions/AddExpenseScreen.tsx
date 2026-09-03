import React, { useState, useMemo, useEffect } from 'react';
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
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

export const AddExpenseScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;
  const { isDesktop } = useBreakpoint();
  // item = Expense existante (mode edition)
  const { item } = route.params || {};
  const isEdit = !!item;

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      Alert.alert(t('common.error'), t('common.actionForbidden'));
      navigation.goBack();
    }
  }, [userRole]);

  const CATEGORIES = useMemo(() => [
    t('expense.catElectricity'),
    t('expense.catWater'),
    t('expense.catRent'),
    t('expense.catTransport'),
    t('expense.catLabor'),
    t('expense.catMaintenance'),
    t('expense.catMisc')
  ], [t]);

  const [description, setDescription] = useState(isEdit ? (item.description || '') : '');
  const [category, setCategory] = useState(isEdit ? (item.category || CATEGORIES[6]) : CATEGORIES[6]);
  const [amount, setAmount] = useState(isEdit ? String(item.amount || '') : '');
  const [date, setDate] = useState(isEdit ? (item.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    if (!description || !amount) {
      const msg = t('expense.fillRequired');
      if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
      else { Alert.alert(t('common.error'), msg); }
      return;
    }

    const parsedAmount = parseFloat(amount.toString().replace(/\s/g, '')) || 0;
    if (parsedAmount <= 0) {
      const msg = 'Le montant doit etre superieur a zero.';
      if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
      else { Alert.alert(t('common.error'), msg); }
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        // Mode edition : PUT sur la depense existante
        const payload = {
          category,
          description,
          amount: parsedAmount,
          date,
        };
        await repositoryProvider.api.put(`/expenses/${item.id}/`, payload);
        const successMsg = `Depense mise a jour : ${description} — ${parsedAmount} GNF`;
        if (Platform.OS === 'web') { toast.success(t('common.success'), successMsg); }
        else { Alert.alert(t('common.success'), successMsg); }
      } else {
        // Mode creation : POST
        let farmId = null;
        try {
          const farmsRes = await repositoryProvider.api.get('/farms/');
          if (farmsRes.data && farmsRes.data.length > 0) {
            farmId = farmsRes.data[0].id;
          }
        } catch (err) {
          // API failed, fallback to context
        }

        if (!farmId && userFarms && userFarms.length > 0) {
          farmId = userFarms[0].id;
        }

        if (!farmId) {
          const msg = t('expense.noFarmFound');
          if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
          else { Alert.alert(t('common.error'), msg); }
          setLoading(false);
          return;
        }

        const payload = {
          farm: farmId,
          category,
          description,
          amount: parsedAmount,
          date,
        };
        await repositoryProvider.api.post('/expenses/', payload);
        if (Platform.OS === 'web') { toast.success(t('common.success'), t('expense.success')); }
        else { Alert.alert(t('common.success'), t('expense.success')); }
      }
      navigation.goBack();
    } catch (e: any) {
      const errorMsg = getErrorMessage(e, t('expense.error') || 'Erreur lors de la sauvegarde de la dépense');
      if (Platform.OS === 'web') { toast.error(t('common.error'), errorMsg); }
      else { Alert.alert(t('common.error'), errorMsg); }
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
            {isEdit ? 'Modifier la Depense' : t('expense.newExpenseTitle')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
               <Text style={styles.label}>{t('expense.category')}</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                 {CATEGORIES.map(cat => (
                   <TouchableOpacity
                     key={cat}
                     style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
                     onPress={() => setCategory(cat)}
                   >
                     <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
                   </TouchableOpacity>
                 ))}
               </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('expense.description')}</Text>
              <Input placeholder={t('expense.placeholderDescription')} value={description} onChangeText={setDescription} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('expense.amount')} (GNF)</Text>
              <Input placeholder="0" value={amount} onChangeText={setAmount} isNumeric />
            </View>

            <DatePicker label={t('expense.date')} value={date} onChange={setDate} />
          </Card>

          <Button
            title={isEdit ? t('common.update') : t('expense.submit')}
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
  formCard: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.l },
  inputGroup: { marginBottom: theme.spacing.m },
  label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  categoryScroll: { flexDirection: 'row', marginBottom: 8 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.background, marginRight: 8, borderWidth: 0.8, borderColor: theme.colors.border },
  categoryBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  categoryText: { fontSize: 13, color: theme.colors.textSecondary },
  categoryTextActive: { color: '#000000', fontWeight: 'bold' },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, marginTop: theme.spacing.m, borderWidth: 1, borderColor: theme.colors.border },
});