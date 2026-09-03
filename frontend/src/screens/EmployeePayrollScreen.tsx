import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { generatePayrollPDF } from '../utils/reportGenerator';
import { formatCurrency } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Screen, ScreenHeader, useContentWidth, Card, EmptyState, space, radius } from '../components/ui';

export const EmployeePayrollScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userName } = useAuth();
  const S = useMemo(() => createStyles(theme), [theme]);
  const contentW = useContentWidth('narrow');
  const [loading, setLoading] = useState(true);
  const [payrolls, setPayrolls] = useState<any[]>([]);

  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/payrolls/');
      setPayrolls(response.data);
    } catch (error) {
      console.error('Erreur fetch payrolls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayrolls(); }, []);

  const handleGeneratePDF = async (item: any) => {
    try {
      const payrollData = {
        name: userName || 'Employé',
        position: item.employee_position || '',
        base_salary: parseFloat(item.base_salary),
        bonus: parseFloat(item.bonus),
        deduction: parseFloat(item.deduction),
        amount_paid: parseFloat(item.amount_paid),
        month: item.month,
      };
      await generatePayrollPDF(payrollData, t);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.bulletinError'));
    }
  };

  const Row = ({ label, value, color }: any) => (
    <View style={{ flex: 1 }}>
      <Text style={S.detLabel}>{label}</Text>
      <Text style={[S.detValue, { color: color || theme.colors.text }]}>{value}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: any }) => (
    <Card style={S.card}>
      <View style={S.head}>
        <View style={S.monthRow}>
          <MaterialIcons name="event-note" size={19} color={theme.colors.primary} />
          <Text style={[S.month, { color: theme.colors.text }]}>{item.month}</Text>
        </View>
        <Pressable style={[S.dl, { backgroundColor: theme.colors.primary + '20' }]} onPress={() => handleGeneratePDF(item)} hitSlop={6}>
          <MaterialIcons name="file-download" size={20} color={theme.colors.primary} />
        </Pressable>
      </View>

      <View style={[S.divider, { backgroundColor: theme.colors.border }]} />

      <View style={S.detRow}>
        <Row label={t('payroll.baseSalary')} value={formatCurrency(item.base_salary)} />
        <Row label={t('payroll.bonus')} value={`+ ${formatCurrency(item.bonus)}`} color="#2E7D32" />
      </View>
      <View style={S.detRow}>
        <Row label={t('payroll.deduction')} value={`- ${formatCurrency(item.deduction)}`} color={theme.colors.danger} />
        <Row label={t('payroll.netAmount')} value={formatCurrency(item.amount_paid)} color={theme.colors.primary} />
      </View>

      <View style={[S.footer, { borderTopColor: theme.colors.border }]}>
        <MaterialIcons name="calendar-today" size={13} color={theme.colors.textSecondary} />
        <Text style={S.footerText}>{t('profile.paidOn')} {new Date(item.date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}</Text>
      </View>
    </Card>
  );

  return (
    <Screen header={<ScreenHeader title={t('profile.paymentHistory')} onBack={() => navigation.goBack()} />}>
      {loading ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={payrolls}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          ListEmptyComponent={<EmptyState icon="cash-multiple" title={t('profile.noPayments')} />}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: { marginBottom: 0, borderRadius: radius.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  month: { fontSize: 17, fontWeight: '900' },
  dl: { padding: 8, borderRadius: radius.sm },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.md },
  detRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  detLabel: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  detValue: { fontSize: 14, fontWeight: '900' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  footerText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
});
