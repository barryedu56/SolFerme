import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { formatCurrency } from '../utils/formatters';
import { getErrorMessage } from '../utils/errors';
import { Screen, ScreenHeader, Card, Chip, space, radius } from '../components/ui';

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

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(preselectedEmployee?.id?.toString() || '');
  const [amount, setAmount] = useState('');
  const [bonusType, setBonusType] = useState('PERFORMANCE');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const formatAmountInput = (text: string) => {
    const cleanText = text.replace(/\D/g, '');
    if (cleanText === '') return '';
    return parseInt(cleanText, 10).toLocaleString('fr-FR');
  };
  const handleAmountChange = (text: string) => setAmount(formatAmountInput(text));
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
    const emp = employees.find((e) => e.id.toString() === selectedEmployeeId);
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
    <Screen scroll width="narrow" edges={['top', 'bottom']}
      header={<ScreenHeader title={t('employees.assignBonusTitle')} onBack={() => navigation.goBack()} />}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>{t('employees.employeeLabel').toUpperCase()} *</Text>
          <Pressable style={styles.pickerButton} onPress={() => setShowEmployeePicker(!showEmployeePicker)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="person" size={19} color={theme.colors.primary} />
              <Text style={[styles.pickerText, { color: selectedEmployeeId ? theme.colors.text : theme.colors.textSecondary }]}>{getEmployeeName()}</Text>
            </View>
            <MaterialIcons name={showEmployeePicker ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color={theme.colors.textSecondary} />
          </Pressable>
          {showEmployeePicker && (
            <View style={styles.pickerOptions}>
              {employees.map((emp) => (
                <Pressable key={emp.id} style={styles.pickerOption} onPress={() => { setSelectedEmployeeId(emp.id.toString()); setShowEmployeePicker(false); }}>
                  <Text style={[styles.pickerOptionText, selectedEmployeeId === emp.id.toString() && { color: theme.colors.primary, fontWeight: '800' }]}>
                    {emp.user_name} — {emp.position}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>{t('employees.bonusTypeLabel').toUpperCase()} *</Text>
          <View style={styles.typeRow}>
            {BONUS_TYPES.map((bt) => (
              <Chip key={bt.value} label={bt.label} icon={bt.icon as any} active={bonusType === bt.value} onPress={() => setBonusType(bt.value)} />
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>{t('employees.bonusDetails').toUpperCase()} *</Text>
          <View style={styles.row}>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.label}>{t('employees.amountGnf')}</Text>
              <Input keyboardType="numeric" value={amount} onChangeText={handleAmountChange} placeholder="ex: 100 000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('common.date')}</Text>
              <Input value={date} onChangeText={setDate} placeholder="AAAA-MM-JJ" />
            </View>
          </View>
          <Text style={styles.label}>{t('employees.reasonLabel')}</Text>
          <Input value={reason} onChangeText={setReason} placeholder="Ex : Excellente performance sur le lot B..." multiline numberOfLines={3} />
        </Card>

        {!!amount && getNumericAmount() > 0 && (
          <View style={[styles.preview, { backgroundColor: theme.colors.primary + '12' }]}>
            <MaterialIcons name="star" size={24} color={theme.colors.primary} />
            <View>
              <Text style={styles.previewLabel}>{t('employees.bonusAmountLabel')}</Text>
              <Text style={[styles.previewValue, { color: theme.colors.primary }]}>{formatCurrency(getNumericAmount())}</Text>
            </View>
          </View>
        )}

        <Button title={t('employees.assignBonusTitle')} onPress={handleSubmit} loading={loading} style={styles.submitBtn} />
        <View style={{ height: space.xl }} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  card: { padding: space.md, borderRadius: radius.lg, marginBottom: space.md },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: theme.colors.textSecondary, letterSpacing: 1, marginBottom: space.sm },
  pickerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.background, padding: 12, borderRadius: radius.sm,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  pickerText: { fontSize: 14, fontWeight: '600' },
  pickerOptions: { marginTop: 4, backgroundColor: theme.colors.surface, borderRadius: radius.sm, borderWidth: 0.8, borderColor: theme.colors.border, maxHeight: 220, overflow: 'hidden' },
  pickerOption: { padding: 12, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border },
  pickerOptionText: { fontSize: 14, color: theme.colors.text },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  previewLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  previewValue: { fontSize: 22, fontWeight: '900' },
  submitBtn: { height: 54, borderRadius: radius.lg, backgroundColor: theme.colors.primary },
});
