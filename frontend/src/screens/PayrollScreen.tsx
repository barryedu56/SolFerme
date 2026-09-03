import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { generatePayrollPDF, generateGroupPayrollPDF } from '../utils/reportGenerator';
import { formatCurrency } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getPeriodInfo } from '../utils/payrollUtils';
import { Screen, ScreenHeader, Card, Badge, EmptyState, SectionHeader, space, radius } from '../components/ui';

export const PayrollScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const S = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [payrollSummary, setPayrollSummary] = useState({ total_paid: 0, count_paid: 0, count_pending: 0, period: '' });

  const currentLocale = t('common.dateLocale');
  const currentMonth = new Date().toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });

  const fetchData = async () => {
    if (!isOwner) { setLoading(false); return; }
    setLoading(true);
    try {
      const [empRes, payRes, summaryRes] = await Promise.all([
        repositoryProvider.api.get('/employees/'),
        repositoryProvider.api.get('/payrolls/'),
        repositoryProvider.api.get('/payrolls/summary/'),
      ]);
      setEmployees(empRes.data);
      setPayrolls(payRes.data);
      setPayrollSummary(summaryRes.data);
    } catch (error) {
      console.error('Erreur lors du chargement des données de paie:', error);
      Alert.alert(t('common.error'), t('payroll.loadError') || 'Impossible de charger les données de paie.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchData(); });
    return unsubscribe;
  }, [navigation]);

  if (!isOwner) {
    return (
      <Screen header={<ScreenHeader title={t('payroll.mgtTitle')} onBack={() => navigation.goBack()} />} width="narrow">
        <View style={S.center}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[S.restrictedTitle, { color: theme.colors.text }]}>Accès Restreint</Text>
          <Text style={[S.restrictedText, { color: theme.colors.textSecondary }]}>
            Cette section est réservée aux propriétaires de la ferme.
          </Text>
          <Button title="Retour" onPress={() => navigation.goBack()} style={{ marginTop: 30, width: '100%' }} />
        </View>
      </Screen>
    );
  }

  const getCurrentPeriodInfo = (frequency: string) =>
    getPeriodInfo(frequency, new Date(), currentLocale.startsWith('fr') ? 'fr' : 'en');

  const getEmpStatus = (emp: any) => {
    const { periodKey, periodLabel } = getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL');
    const payment = payrolls.find((p) => {
      if (p.employee !== emp.id || p.status === 'ANNULEE') return false;
      if (p.period_key) return p.period_key === periodKey;
      const pInfo = getPeriodInfo(emp.payment_frequency || 'MENSUEL', p.date, 'en');
      return pInfo.periodKey === periodKey;
    });
    return { isPaid: !!payment, period: periodLabel, periodKey, payment };
  };

  const handlePay = (emp: any) => {
    const { periodLabel } = getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL');
    navigation.navigate('CreatePayroll', { employee: emp, initialMonth: periodLabel });
  };

  const calculateTotalPayroll = () => payrollSummary.total_paid;

  const handleGenerateBulletin = async (emp: any, payment?: any) => {
    try {
      const payrollData = payment ? {
        name: emp.user_name || `${t('profile.employee')} #${emp.user}`,
        position: emp.position,
        base_salary: parseFloat(payment.base_salary),
        bonus: parseFloat(payment.bonus),
        deduction: parseFloat(payment.deduction),
        amount_paid: parseFloat(payment.amount_paid),
        month: payment.month,
      } : {
        name: emp.user_name || `${t('profile.employee')} #${emp.user}`,
        position: emp.position,
        base_salary: parseFloat(emp.salary),
        bonus: 0,
        deduction: 0,
        amount_paid: parseFloat(emp.salary),
        month: getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL').periodLabel,
      };
      await generatePayrollPDF(payrollData, t);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.bulletinError'));
    }
  };

  const handleExportAll = async () => {
    try {
      const data = employees.map((emp) => {
        const { payment, period } = getEmpStatus(emp);
        return {
          employee: emp.user_name || `${t('profile.employee')} #${emp.user}`,
          period,
          salary: parseFloat(payment ? payment.amount_paid : emp.salary),
          status: payment ? t('profile.paidStatus') : t('profile.pendingStatus'),
          isPaid: !!payment,
        };
      });
      await generateGroupPayrollPDF(data, currentMonth, t, calculateTotalPayroll());
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.groupReportError'));
    }
  };

  const handleCancel = (emp: any, payment: any, period: string) => {
    const title = t('employees.messages.cancelSalaryTitle') || 'Annuler ce salaire';
    const msg = t('employees.messages.cancelSalaryMsg') || `Voulez-vous vraiment annuler le paiement de ${emp.user_name} pour ${period} ?`;
    const executeCancel = async () => {
      try {
        setLoading(true);
        await repositoryProvider.api.delete(`/payrolls/${payment.id}/`);
        await fetchData();
        if (Platform.OS === 'web') window.alert(t('employees.messages.cancelSalarySuccess') || 'Paiement annulé.');
        else Alert.alert(t('common.success') || 'Succès', t('employees.messages.cancelSalarySuccess') || 'Paiement annulé.');
      } catch (error) {
        if (Platform.OS === 'web') window.alert(t('employees.messages.cancelSalaryError') || "Impossible d'annuler.");
        else Alert.alert(t('common.error') || 'Erreur', t('employees.messages.cancelSalaryError') || "Impossible d'annuler.");
      } finally {
        setLoading(false);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeCancel();
    } else {
      Alert.alert(title, msg, [
        { text: t('common.no') || 'Non', style: 'cancel' },
        { text: t('finance.yesCancel') || 'Oui, Annuler', style: 'destructive', onPress: executeCancel },
      ]);
    }
  };

  if (loading) {
    return (
      <Screen header={<ScreenHeader title={t('payroll.mgtTitle')} onBack={() => navigation.goBack()} />}>
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </Screen>
    );
  }

  const Act = ({ icon, label, onPress, tint, flex = 1, filled }: any) => (
    <Pressable style={[S.act, { flex }, filled && { backgroundColor: theme.colors.primary }]} onPress={onPress}>
      <MaterialIcons name={icon} size={17} color={tint || theme.colors.textSecondary} />
      <Text style={[S.actText, { color: tint || theme.colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen
      scroll
      width="narrow"
      header={
        <ScreenHeader
          title={t('payroll.mgtTitle')}
          onBack={() => navigation.goBack()}
          actions={[{ icon: 'refresh', onPress: fetchData, tint: theme.colors.primary }]}
        />
      }
    >
      <Card style={[S.summary, { backgroundColor: theme.colors.primary }]}>
        <View style={S.summaryHead}>
          <View style={S.summaryIcon}><MaterialIcons name="account-balance" size={22} color="#000" /></View>
          <Text style={S.summaryLabel}>{t('reports.salaryMasse')} — {currentMonth}</Text>
        </View>
        <Text style={S.summaryValue}>{formatCurrency(calculateTotalPayroll())}</Text>
        <View style={S.summaryFooter}>
          <View style={S.fItem}><MaterialIcons name="people" size={14} color="rgba(0,0,0,0.6)" /><Text style={S.fText}>{payrollSummary.count_paid} {t('profile.paidStatus').toLowerCase()}</Text></View>
          <View style={S.fItem}><MaterialIcons name="pending" size={14} color="rgba(0,0,0,0.6)" /><Text style={S.fText}>{payrollSummary.count_pending} {t('profile.pendingStatus').toLowerCase()}</Text></View>
        </View>
      </Card>

      <SectionHeader title={t('reports.payrollReportTitle')} icon="cash-multiple" />

      {employees.length === 0 && <EmptyState icon="account-group-outline" title={t('common.noData')} />}

      {employees.map((emp) => {
        const { isPaid, period, payment } = getEmpStatus(emp);
        return (
          <Card key={emp.id} style={S.payCard}>
            <View style={S.payMain}>
              <View style={[S.avatar, { backgroundColor: theme.colors.primary }]}>
                <Text style={S.avatarText}>{(emp.user_name || 'E').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[S.payName, { color: theme.colors.text }]} numberOfLines={1}>{emp.user_name || `${t('profile.employee')} #${emp.user}`}</Text>
                <Text style={S.payPos} numberOfLines={1}>{emp.position} • {emp.payment_frequency?.toLowerCase()}</Text>
                {isPaid && <Text style={[S.paidOn, { color: '#2E7D32' }]}>{t('profile.paidOn')} {new Date(payment.date).toLocaleDateString(currentLocale)}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[S.payAmount, { color: theme.colors.text }]}>{formatCurrency(isPaid ? payment.amount_paid : emp.salary)}</Text>
                <Badge label={isPaid ? t('profile.PAID') : t('profile.PENDING')} color={isPaid ? '#2E7D32' : '#F57C00'} />
              </View>
            </View>

            <View style={[S.payActions, { borderTopColor: theme.colors.border }]}>
              <Act icon="visibility" label={t('common.info')} onPress={() => navigation.navigate('EmployeeDetail', { employeeId: emp.id, farms: [] })} />
              {!isPaid ? (
                <Act icon="payments" label={`${t('payroll.pay')} ${period.split(' ')[0]}`} tint={theme.colors.text} filled onPress={() => handlePay(emp)} />
              ) : (
                <>
                  <Act icon="description" label={t('reports.payrollTitle')} flex={1.4} onPress={() => handleGenerateBulletin(emp, payment)} />
                  <Act icon="cancel" label="Annuler" tint={theme.colors.danger} onPress={() => handleCancel(emp, payment, period)} />
                </>
              )}
            </View>
          </Card>
        );
      })}

      <Button title={t('payroll.exportAll')} variant="secondary" style={{ marginTop: space.sm }} onPress={handleExportAll} />
      <View style={{ height: space.xxl }} />
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  restrictedTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  restrictedText: { fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '600' },

  summary: { marginBottom: space.md, borderRadius: radius.xl },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.sm },
  summaryIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { flex: 1, fontSize: 12.5, color: '#000', fontWeight: '900', textTransform: 'uppercase' },
  summaryValue: { fontSize: 28, fontWeight: '900', color: '#000' },
  summaryFooter: { flexDirection: 'row', gap: 20, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)' },
  fItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fText: { fontSize: 12, color: '#000', fontWeight: '800' },

  payCard: { marginBottom: space.sm, borderRadius: radius.lg },
  payMain: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  avatar: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#000' },
  payName: { fontSize: 15, fontWeight: '800' },
  payPos: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
  paidOn: { fontSize: 11, marginTop: 2, fontWeight: '700' },
  payAmount: { fontSize: 16, fontWeight: '900' },
  payActions: { flexDirection: 'row', gap: 8, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  act: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: radius.sm },
  actText: { fontSize: 12.5, fontWeight: '800' },
});
