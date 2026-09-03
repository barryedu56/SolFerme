import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { getErrorMessage } from '../utils/errors';
import { toast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import { getPeriodInfo } from '../utils/payrollUtils';
import { Screen, ScreenHeader, Card, space, radius } from '../components/ui';

export const CreatePayrollScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialEmployee = route.params?.employee;
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployee?.id?.toString() || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [baseSalary, setBaseSalary] = useState(initialEmployee?.salary?.toString() || '0');
  const [bonus, setBonus] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [employeeBonuses, setEmployeeBonuses] = useState<any[]>([]);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const selectedEmployee = useMemo(() => employees.find((e) => e.id.toString() === selectedEmployeeId), [employees, selectedEmployeeId]);
  const paymentFrequency = selectedEmployee?.payment_frequency || 'MENSUEL';

  const { periodKey, periodLabel } = useMemo(() => getPeriodInfo(paymentFrequency, date, activeLanguage), [paymentFrequency, date, activeLanguage]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await repositoryProvider.api.get('/employees/');
        setEmployees(res.data);
      } catch (error) {
        console.error('Erreur fetch employees:', error);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    const fetchEmployeeBonuses = async () => {
      if (selectedEmployeeId) {
        try {
          const res = await repositoryProvider.api.get(`/bonuses/?employee=${selectedEmployeeId}`);
          setEmployeeBonuses(res.data);
          const totalBonus = res.data.reduce((sum: number, b: any) => sum + parseFloat(b.amount), 0);
          setBonus(totalBonus.toString());
        } catch (error) {
          console.error('Erreur fetch bonuses:', error);
        }
      }
    };
    fetchEmployeeBonuses();
  }, [selectedEmployeeId]);

  const calculateNet = () => {
    const base = parseFloat(baseSalary) || 0;
    const b = parseFloat(bonus) || 0;
    const d = parseFloat(deduction) || 0;
    return base + b - d;
  };

  const handleCreate = async () => {
    if (!selectedEmployeeId || !date) {
      toast.error(t('common.error'), t('payroll.fillRequired'));
      return;
    }
    setLoading(true);
    try {
      await repositoryProvider.api.post('/payrolls/', {
        employee: parseInt(selectedEmployeeId),
        date,
        month: periodLabel,
        period_key: periodKey,
        base_salary: parseFloat(baseSalary) || 0,
        bonus: parseFloat(bonus) || 0,
        deduction: parseFloat(deduction) || 0,
        amount_paid: calculateNet(),
        status: 'ACTIVE',
        payment_method: paymentMethod,
      });
      toast.success(t('common.success'), t('payroll.success'));
      navigation.goBack();
    } catch (error: any) {
      console.error(error);
      toast.error('Action impossible', getErrorMessage(error, t('payroll.error')));
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeName = () => {
    const emp = employees.find((e) => e.id.toString() === selectedEmployeeId);
    return emp ? emp.user_name : t('payroll.selectEmployee');
  };

  return (
    <Screen scroll width="narrow" edges={['top', 'bottom']}
      header={<ScreenHeader title={t('payroll.title')} onBack={() => navigation.goBack()} />}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Card style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('payroll.employee')} *</Text>
            <Pressable style={styles.pickerButton} onPress={() => setShowEmployeePicker(!showEmployeePicker)}>
              <Text style={[styles.pickerButtonText, { color: theme.colors.text }]}>{getEmployeeName()}</Text>
              <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
            </Pressable>
            {showEmployeePicker && (
              <View style={styles.pickerOptions}>
                {employees.map((emp) => (
                  <Pressable key={emp.id} style={styles.pickerOption} onPress={() => {
                    setSelectedEmployeeId(emp.id.toString());
                    setBaseSalary(emp.salary.toString());
                    setShowEmployeePicker(false);
                  }}>
                    <Text style={[styles.pickerOptionText, selectedEmployeeId === emp.id.toString() && styles.selectedOptionText]}>{emp.user_name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t('payroll.date')} *</Text>
              <Input value={date} onChangeText={setDate} placeholder="AAAA-MM-JJ" />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t('payroll.period')} ({paymentFrequency.toLowerCase()})</Text>
              <Input value={periodLabel} editable={false} style={{ backgroundColor: theme.colors.background + '80' }} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('payroll.baseSalary')}</Text>
            <Input isNumeric value={baseSalary} onChangeText={setBaseSalary} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t('payroll.bonus')} (Auto-calculé)</Text>
              <Input isNumeric value={bonus} onChangeText={setBonus} editable={false} style={{ backgroundColor: theme.colors.background + '80' }} />
              {employeeBonuses.length > 0 && <Text style={styles.bonusHint}>{employeeBonuses.length} prime(s) inclue(s)</Text>}
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t('payroll.deduction')}</Text>
              <Input isNumeric value={deduction} onChangeText={setDeduction} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('payroll.paymentMethod')}</Text>
            <Input value={paymentMethod} onChangeText={setPaymentMethod} />
          </View>

          <View style={[styles.netBox, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={styles.netLabel}>{t('payroll.netAmount')}</Text>
            <Text style={[styles.netValue, { color: theme.colors.primary }]}>{formatCurrency(calculateNet())}</Text>
          </View>
        </Card>

        <Button title={t('payroll.submit')} onPress={handleCreate} loading={loading} style={styles.submitBtn} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  formCard: { padding: space.md, borderRadius: radius.lg, marginBottom: space.md },
  inputGroup: { marginBottom: space.md },
  label: { fontSize: 13.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, marginLeft: 2 },
  row: { flexDirection: 'row', gap: space.sm },
  pickerButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.colors.background + '40', padding: 12, borderRadius: radius.sm,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  pickerButtonText: { fontSize: 14 },
  pickerOptions: { marginTop: 4, backgroundColor: theme.colors.surface, borderRadius: radius.sm, borderWidth: 0.8, borderColor: theme.colors.border, maxHeight: 220, overflow: 'hidden' },
  pickerOption: { padding: 12, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border },
  pickerOptionText: { fontSize: 14, color: theme.colors.textSecondary },
  selectedOptionText: { color: theme.colors.primary, fontWeight: '800' },
  bonusHint: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  netBox: { marginTop: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'center' },
  netLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  netValue: { fontSize: 24, fontWeight: '800' },
  submitBtn: { height: 54, borderRadius: radius.lg, backgroundColor: theme.colors.primary },
});
