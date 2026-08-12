import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { formatCurrency } from '../utils/formatters';
import { getErrorMessage } from '../utils/errors';

const BONUS_TYPES = [
  { value: 'PERFORMANCE', label: 'Prime performance', icon: 'trending-up' },
  { value: 'EXCEPTIONNEL', label: 'Prime exceptionnelle', icon: 'star' },
  { value: 'AUTRE', label: 'Autre', icon: 'redeem' },
];

export const CreateBonusScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const preselectedEmployee = route.params?.employee;

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    preselectedEmployee?.id?.toString() || ''
  );
  const [amount, setAmount] = useState('');
  const [bonusType, setBonusType] = useState('PERFORMANCE');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const formatAmountInput = (text: string) => {
    // Remove all non-numeric characters
    const cleanText = text.replace(/\D/g, '');
    if (cleanText === '') return '';
    // Add thousand separators
    return parseInt(cleanText, 10).toLocaleString('fr-FR');
  };

  const handleAmountChange = (text: string) => {
    const formatted = formatAmountInput(text);
    setAmount(formatted);
  };

  const getNumericAmount = () => {
    if (!amount) return 0;
    return parseFloat(amount.replace(/\s/g, '')) || 0;
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await repositoryProvider.api.get('/employees/');
        setEmployees(res.data.filter((e: any) => e.status === 'ACTIF'));
      } catch (e) {
        console.error('Erreur fetch employees:', e);
      }
    };
    fetchEmployees();
  }, []);

  const getEmployeeName = () => {
    if (preselectedEmployee && selectedEmployeeId === preselectedEmployee.id?.toString()) {
      return preselectedEmployee.user_name;
    }
    const emp = employees.find(e => e.id.toString() === selectedEmployeeId);
    return emp ? emp.user_name : t('employees.selectEmployee');
  };

  const handleSubmit = async () => {
    if (!selectedEmployeeId) {
      Alert.alert(t('common.error'), t('employees.employeeRequired'));
      return;
    }
    const numericAmount = getNumericAmount();
    if (!amount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('employees.bonusAmountRequired'));
      return;
    }
    if (!date) {
      Alert.alert(t('common.error'), t('employees.bonusDateRequired'));
      return;
    }
    setLoading(true);
    try {
      await repositoryProvider.api.post('/bonuses/', {
        employee: parseInt(selectedEmployeeId),
        amount: numericAmount,
        bonus_type: bonusType,
        reason: reason.trim() || null,
        date,
      });
      Alert.alert(t('common.success'), t('employees.bonusSuccess'));
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t('common.error'), getErrorMessage(error, t('employees.bonusSaveError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('employees.assignBonusTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Sélection employé */}
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>{t('employees.employeeLabel').toUpperCase()} *</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowEmployeePicker(!showEmployeePicker)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="person" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.pickerText, !selectedEmployeeId && { color: theme.colors.textSecondary }]}>
                  {getEmployeeName()}
                </Text>
              </View>
              <MaterialIcons name={showEmployeePicker ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            {showEmployeePicker && (
              <View style={styles.pickerOptions}>
                {employees.map(emp => (
                  <TouchableOpacity
                    key={emp.id}
                    style={styles.pickerOption}
                    onPress={() => {
                      setSelectedEmployeeId(emp.id.toString());
                      setShowEmployeePicker(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      selectedEmployeeId === emp.id.toString() && { color: theme.colors.primary, fontWeight: 'bold' }
                    ]}>
                      {emp.user_name} — {emp.position}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Card>

          {/* Type de prime */}
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>{t('employees.bonusTypeLabel').toUpperCase()} *</Text>
            <View style={styles.typeRow}>
              {BONUS_TYPES.map(bt => (
                <TouchableOpacity
                  key={bt.value}
                  style={[styles.typeChip, bonusType === bt.value && styles.typeChipActive]}
                  onPress={() => setBonusType(bt.value)}
                >
                  <MaterialIcons
                    name={bt.icon as any}
                    size={18}
                    color={bonusType === bt.value ? '#000' : theme.colors.textSecondary}
                  />
                  <Text style={[styles.typeChipText, bonusType === bt.value && styles.typeChipTextActive]}>
                    {bt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Montant & date */}
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>{t('employees.bonusDetails').toUpperCase()} *</Text>
            <View style={styles.row}>
              <View style={{ flex: 1.5, marginRight: 8 }}>
                <Text style={styles.label}>{t('employees.amountGnf')}</Text>
                <Input
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={handleAmountChange}
                  placeholder="ex: 100 000"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('common.date')}</Text>
                <Input
                  value={date}
                  onChangeText={setDate}
                  placeholder="AAAA-MM-JJ"
                />
              </View>
            </View>

            <Text style={styles.label}>{t('employees.reasonLabel')}</Text>
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="Ex : Excellente performance sur le lot B..."
              multiline
              numberOfLines={3}
            />
          </Card>

          {/* Aperçu */}
          {!!amount && getNumericAmount() > 0 && (
            <View style={styles.preview}>
              <MaterialIcons name="star" size={24} color={theme.colors.primary} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.previewLabel}>{t('employees.bonusAmountLabel')}</Text>
                <Text style={styles.previewValue}>{formatCurrency(getNumericAmount())}</Text>
              </View>
            </View>
          )}

          <Button
            title={t('employees.assignBonusTitle')}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
          <View style={{ height: 40 }} />
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  card: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '900',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.m,
  },
  pickerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    padding: 12, borderRadius: theme.borderRadius.m,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  pickerText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  pickerOptions: {
    marginTop: 4, backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m, borderWidth: 0.8,
    borderColor: theme.colors.border, ...theme.shadows.light, maxHeight: 200,
  },
  pickerOption: { padding: 12, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border },
  pickerOptionText: { fontSize: 14, color: theme.colors.text },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 0.8, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  typeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginLeft: 6 },
  typeChipTextActive: { color: '#000' },
  row: { flexDirection: 'row', marginBottom: theme.spacing.m },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  preview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.l, padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
  },
  previewLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  previewValue: { fontSize: 22, fontWeight: '900', color: theme.colors.primary },
  submitBtn: {
    height: 56, borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary, ...theme.shadows.medium,
  },
});