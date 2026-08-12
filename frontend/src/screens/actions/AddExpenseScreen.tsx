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

export const AddExpenseScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole, userFarms } = useAuth() as any;

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

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[6]); // Divers
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    if (!description || !amount) {
      Alert.alert(t('common.error'), t('expense.fillRequired'));
      return;
    }

    setLoading(true);
    try {
      let farmId = null;
      try {
        const farmsRes = await repositoryProvider.api.get<any[]>('/farms/');
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
        Alert.alert(t('common.error'), t('expense.noFarmFound'));
        setLoading(false);
        return;
      }

      const payload = {
        farm: farmId,
        category,
        description,
        amount: parseFloat(amount.toString().replace(/\s/g, '')) || 0,
        date,
      };

      await repositoryProvider.api.post('/expenses/', payload);
      Alert.alert(t('common.success'), t('expense.success'));
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('expense.error'));
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
          <Text style={styles.headerTitle}>{t('expense.newExpenseTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
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

          <Button title={t('expense.submit')} onPress={handleSubmit} loading={loading} style={styles.submitBtn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.m, paddingTop: theme.spacing.l },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface, ...theme.shadows.light },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
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