import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { generatePayrollPDF, generateGroupPayrollPDF } from '../utils/reportGenerator';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';

export const PayrollScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);

  const currentLocale = activeLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const currentMonth = new Date().toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });
  const currentMonthISO = new Date().toISOString().split('T')[0];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, payRes] = await Promise.all([
        apiClient.get('/employees/'),
        apiClient.get('/payrolls/'),
      ]);
      setEmployees(empRes.data);
      setPayrolls(payRes.data);
    } catch (error) {
      console.error('Erreur lors du chargement des données de paie:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de paie.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const getCurrentPeriod = (frequency: string) => {
    const now = new Date();
    if (frequency === 'ANNUEL') return `${t('profile.stats.year')} ${now.getFullYear()}`;
    if (frequency === 'SEMESTRIEL') return `${now.getMonth() < 6 ? '1er' : '2ème'} ${t('profile.stats.semester')} ${now.getFullYear()}`;
    // Mensuel
    const month = now.toLocaleDateString(currentLocale, { month: 'long' });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${now.getFullYear()}`;
  };

  const getEmpStatus = (emp: any) => {
    const period = getCurrentPeriod(emp.payment_frequency || 'MENSUEL');
    const payment = payrolls.find(p =>
      p.employee === emp.id &&
      p.month?.toLowerCase() === period.toLowerCase()
    );

    return {
      isPaid: !!payment,
      period,
      payment
    };
  };

  const handlePay = (emp: any) => {
    const period = getCurrentPeriod(emp.payment_frequency || 'MENSUEL');
    navigation.navigate('CreatePayroll', {
      employee: emp,
      initialMonth: period
    });
  };

  const calculateTotalPayroll = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;
    return payrolls
      .filter(p => {
        const pDate = new Date(p.date);
        return pDate.getFullYear() === currentYear && (pDate.getMonth() + 1) === currentMonthNum;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0);
  };

  const handleGenerateBulletin = async (emp: any, payment?: any) => {
    try {
      const payrollData = payment ? {
        name: emp.user_name || `${t('profile.employee')} #${emp.user}`,
        position: emp.position,
        base_salary: parseFloat(payment.base_salary),
        bonus: parseFloat(payment.bonus),
        deduction: parseFloat(payment.deduction),
        amount_paid: parseFloat(payment.amount_paid),
        month: payment.month
      } : {
        name: emp.user_name || `${t('profile.employee')} #${emp.user}`,
        position: emp.position,
        base_salary: parseFloat(emp.salary),
        bonus: 0,
        deduction: 0,
        amount_paid: parseFloat(emp.salary),
        month: getCurrentPeriod(emp.payment_frequency || 'MENSUEL')
      };

      await generatePayrollPDF(payrollData);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.bulletinError'));
    }
  };

  const handleExportAll = async () => {
    try {
      const data = employees.map(emp => {
        const { payment } = getEmpStatus(emp);
        return {
          employee: emp.user_name || `${t('profile.employee')} #${emp.user}`,
          period: getCurrentPeriod(emp.payment_frequency || 'MENSUEL'),
          salary: parseFloat(payment ? payment.amount_paid : emp.salary),
          status: payment ? t('profile.paidStatus') : t('profile.pendingStatus')
        };
      });
      await generateGroupPayrollPDF(data, currentMonth);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.groupReportError'));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payroll.mgtTitle')}</Text>
        <TouchableOpacity style={styles.settingsButton} onPress={fetchData}>
           <MaterialIcons name="refresh" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIconBox}>
               <MaterialIcons name="account-balance" size={24} color="#000000" />
            </View>
            <Text style={styles.summaryLabel}>{t('reports.salaryMasse')} - {currentMonth}</Text>
          </View>
          <Text style={styles.summaryValue}>{formatCurrency(calculateTotalPayroll())}</Text>
          <View style={styles.summaryFooter}>
             <View style={styles.footerItem}>
                <MaterialIcons name="people" size={14} color="#000000" style={{opacity: 0.6}} />
                <Text style={styles.footerText}>{employees.length} {t('farms.employees')}</Text>
             </View>
             <View style={styles.footerItem}>
                <MaterialIcons name="check-circle" size={14} color="#000000" style={{opacity: 0.6}} />
                <Text style={styles.footerText}>
                  {employees.filter(e => getEmpStatus(e).isPaid).length} {t('profile.paidStatus').toLowerCase()}
                </Text>
             </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>{t('reports.payrollReportTitle')}</Text>
        </View>

        {employees.map(emp => {
          const { isPaid, period, payment } = getEmpStatus(emp);
          return (
            <Card key={emp.id} style={styles.payCard}>
              <View style={styles.payMain}>
                <View style={styles.avatarMini}>
                  <Text style={styles.avatarText}>{(emp.user_name || 'E').charAt(0)}</Text>
                </View>
                <View style={styles.payInfo}>
                  <Text style={styles.payName}>{emp.user_name || `${t('profile.employee')} #${emp.user}`}</Text>
                  <Text style={styles.payPos}>{emp.position} • {emp.payment_frequency?.toLowerCase()}</Text>
                  {isPaid && (
                    <Text style={styles.lastPaidText}>
                      {t('profile.paidOn')} {new Date(payment.date).toLocaleDateString(currentLocale)}
                    </Text>
                  )}
                </View>
                <View style={styles.payAmountSection}>
                  <Text style={styles.payAmount}>{formatCurrency(isPaid ? payment.amount_paid : emp.salary)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: isPaid ? theme.colors.success + '20' : theme.colors.warning + '20' }]}>
                     <Text style={[styles.statusText, { color: isPaid ? theme.colors.success : theme.colors.warning }]}>
                       {isPaid ? t('profile.paidStatus') : t('profile.pendingStatus')}
                     </Text>
                  </View>
                </View>
              </View>

              <View style={styles.payActions}>
                 <TouchableOpacity
                   style={styles.actionBtn}
                   onPress={() => navigation.navigate('EmployeeDetail', { employeeId: emp.id, farms: [] })}
                 >
                    <MaterialIcons name="visibility" size={18} color={theme.colors.textSecondary} />
                    <Text style={styles.actionBtnText}>{t('common.info')}</Text>
                 </TouchableOpacity>

                 {!isPaid ? (
                   <TouchableOpacity style={[styles.actionBtn, styles.payBtnHighlight]} onPress={() => handlePay(emp)}>
                      <MaterialIcons name="payments" size={18} color={theme.colors.text} />
                      <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>{t('payroll.pay')} {period.split(' ')[0]}</Text>
                   </TouchableOpacity>
                 ) : (
                   <TouchableOpacity style={styles.actionBtn} onPress={() => handleGenerateBulletin(emp, payment)}>
                      <MaterialIcons name="description" size={18} color={theme.colors.textSecondary} />
                      <Text style={styles.actionBtnText}>{t('reports.payrollTitle')}</Text>
                   </TouchableOpacity>
                 )}
              </View>
            </Card>
          );
        })}

        <Button
          title={t('payroll.exportAll')}
          variant="secondary"
          style={styles.generateAllBtn}
          onPress={handleExportAll}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  settingsButton: { padding: 8 },
  content: { padding: theme.spacing.m },
  summaryCard: {
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
    marginBottom: theme.spacing.l
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  summaryLabel: { fontSize: 13, color: '#000000', opacity: 0.8, fontWeight: '600' },
  summaryValue: { fontSize: 28, fontWeight: '900', color: '#000000' },
  summaryFooter: {
    flexDirection: 'row',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)'
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  footerText: { fontSize: 12, color: '#000000', fontWeight: '600', marginLeft: 4 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  filterText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  payCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  payMain: { flexDirection: 'row', alignItems: 'center' },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.textSecondary },
  payInfo: { flex: 1 },
  payName: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  payPos: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  payAmountSection: { alignItems: 'flex-end' },
  payAmount: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  currency: { fontSize: 10, fontWeight: '600' },
  lastPaidText: { fontSize: 11, color: theme.colors.success, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4
  },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  payActions: {
    flexDirection: 'row',
    marginTop: theme.spacing.m,
    paddingTop: theme.spacing.s,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border + '30'
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  payBtnHighlight: {
    backgroundColor: theme.colors.primary,
    marginLeft: 10,
    ...theme.shadows.light
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginLeft: 6
  },
  generateAllBtn: {
    marginTop: 10,
    height: 56,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent'
  }
});
