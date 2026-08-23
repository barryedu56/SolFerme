import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { getErrorMessage } from '../utils/errors';
import { toast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import { getPeriodInfo } from '../utils/payrollUtils';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const CreatePayrollScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop), [theme, isDesktop]);

  const initialEmployee = route.params?.employee;
  const initialMonthParam = route.params?.initialMonth;
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

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id.toString() === selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  const paymentFrequency = selectedEmployee?.payment_frequency || 'MENSUEL';

  const { periodKey, periodLabel } = useMemo(() => {
    return getPeriodInfo(paymentFrequency, date, activeLanguage);
  }, [paymentFrequency, date, activeLanguage]);

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
          // Auto-calculate total bonuses
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
        date: date,
        month: periodLabel,
        period_key: periodKey,
        base_salary: parseFloat(baseSalary) || 0,
        bonus: parseFloat(bonus) || 0,
        deduction: parseFloat(deduction) || 0,
        amount_paid: calculateNet(),
        status: 'ACTIVE',
        payment_method: paymentMethod
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
    const emp = employees.find(e => e.id.toString() === selectedEmployeeId);
    return emp ? emp.user_name : t('payroll.selectEmployee');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('payroll.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('payroll.employee')} *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowEmployeePicker(!showEmployeePicker)}
              >
                <Text style={styles.pickerButtonText}>{getEmployeeName()}</Text>
                <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {showEmployeePicker && (
                <View style={styles.pickerOptions}>
                  {employees.map(emp => (
                    <TouchableOpacity
                      key={emp.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setSelectedEmployeeId(emp.id.toString());
                        setBaseSalary(emp.salary.toString());
                        setShowEmployeePicker(false);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, selectedEmployeeId === emp.id.toString() && styles.selectedOptionText]}>
                        {emp.user_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
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
              <Input
                isNumeric
                value={baseSalary}
                onChangeText={setBaseSalary}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>{t('payroll.bonus')} (Auto-calculé)</Text>
                <Input
                  isNumeric
                  value={bonus}
                  onChangeText={setBonus}
                  editable={false}
                  style={{ backgroundColor: theme.colors.background + '80' }}
                />
                {employeeBonuses.length > 0 && (
                  <Text style={styles.bonusHint}>{employeeBonuses.length} prime(s) inclue(s)</Text>
                )}
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('payroll.deduction')}</Text>
                <Input
                  isNumeric
                  value={deduction}
                  onChangeText={setDeduction}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('payroll.paymentMethod')}</Text>
              <Input
                value={paymentMethod}
                onChangeText={setPaymentMethod}
              />
            </View>

            <View style={styles.netAmountContainer}>
               <Text style={styles.netLabel}>{t('payroll.netAmount')}</Text>
               <Text style={styles.netValue}>{formatCurrency(calculateNet())}</Text>
            </View>
          </Card>

          <Button
            title={t('payroll.submit')}
            onPress={handleCreate}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  scrollDesktop: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: { flexDirection: 'row' },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background + '40',
    padding: 12,
    borderRadius: theme.borderRadius.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  pickerButtonText: { fontSize: 14, color: theme.colors.text },
  pickerOptions: {
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
    maxHeight: 200,
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border,
  },
  pickerOptionText: { fontSize: 14, color: theme.colors.textSecondary },
  selectedOptionText: { color: theme.colors.primary, fontWeight: 'bold' },
  bonusHint: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic'
  },
  netAmountContainer: {
    marginTop: theme.spacing.m,
    padding: theme.spacing.m,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
  },
  netLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  netValue: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  }
});