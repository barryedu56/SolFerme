import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { generatePayrollPDF, generateGroupPayrollPDF } from '../utils/reportGenerator';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getPeriodInfo } from '../utils/payrollUtils';

export const PayrollScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [payrollSummary, setPayrollSummary] = useState({ total_paid: 0, count_paid: 0, count_pending: 0, period: '' });

  const currentLocale = t('common.dateLocale');
  const currentMonth = new Date().toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });

  const fetchData = async () => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
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
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
             <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('payroll.mgtTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={[styles.center, { padding: 40 }]}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Accès Restreint</Text>
          <Text style={[styles.filterText, { textAlign: 'center', marginTop: 10 }]}>
            Cette section est réservée aux propriétaires de la ferme.
          </Text>
          <Button
            title="Retour"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 30, width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const getCurrentPeriodInfo = (frequency: string) => {
    return getPeriodInfo(frequency, new Date(), currentLocale.startsWith('fr') ? 'fr' : 'en');
  };

  const getEmpStatus = (emp: any) => {
    const { periodKey, periodLabel } = getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL');
    
    // Recherche par period_key (robuste à la périodicité)
    const payment = payrolls.find(p => {
      if (p.employee !== emp.id || p.status === 'ANNULEE') return false;
      // Compatibilité ascendante : on vérifie period_key si dispo, sinon on recalcule avec la date
      if (p.period_key) {
         return p.period_key === periodKey;
      } else {
         const pInfo = getPeriodInfo(emp.payment_frequency || 'MENSUEL', p.date, 'en');
         return pInfo.periodKey === periodKey;
      }
    });
    return { isPaid: !!payment, period: periodLabel, periodKey, payment };
  };

  const handlePay = (emp: any) => {
    const { periodLabel } = getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL');
    navigation.navigate('CreatePayroll', {
      employee: emp,
      initialMonth: periodLabel
    });
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
        month: payment.month
      } : {
        name: emp.user_name || `${t('profile.employee')} #${emp.user}`,
        position: emp.position,
        base_salary: parseFloat(emp.salary),
        bonus: 0,
        deduction: 0,
        amount_paid: parseFloat(emp.salary),
        month: getCurrentPeriodInfo(emp.payment_frequency || 'MENSUEL').periodLabel
      };

      await generatePayrollPDF(payrollData, t);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.bulletinError'));
    }
  };

  const handleExportAll = async () => {
    try {
      const data = employees.map(emp => {
        const { payment, period } = getEmpStatus(emp);
        return {
          employee: emp.user_name || `${t('profile.employee')} #${emp.user}`,
          period: period,
          salary: parseFloat(payment ? payment.amount_paid : emp.salary),
          status: payment ? t('profile.paidStatus') : t('profile.pendingStatus')
        };
      });
      await generateGroupPayrollPDF(data, currentMonth, t);
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
                <Text style={styles.footerText}>{payrollSummary.count_paid} {t('profile.paidStatus').toLowerCase()}</Text>
             </View>
             <View style={styles.footerItem}>
                <MaterialIcons name="pending" size={14} color="#000000" style={{opacity: 0.6}} />
                <Text style={styles.footerText}>{payrollSummary.count_pending} {t('profile.pendingStatus').toLowerCase()}</Text>
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
                       {isPaid ? t('profile.PAID') : t('profile.PENDING')}
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
                   <View style={{ flexDirection: 'row', flex: 1 }}>
                     <TouchableOpacity style={[styles.actionBtn, { flex: 1.5 }]} onPress={() => handleGenerateBulletin(emp, payment)}>
                        <MaterialIcons name="description" size={18} color={theme.colors.textSecondary} />
                        <Text style={styles.actionBtnText}>{t('reports.payrollTitle')}</Text>
                     </TouchableOpacity>

                     <TouchableOpacity
                        style={[styles.actionBtn, { flex: 1 }]}
                        onPress={() => {
                          Alert.alert(
                            t('employees.messages.cancelSalaryTitle') || "Annuler ce salaire",
                            t('employees.messages.cancelSalaryMsg') || `Voulez-vous vraiment annuler le paiement de ${emp.user_name} pour ${period} ?`,
                            [
                              { text: t('common.no') || "Non", style: "cancel" },
                              {
                                text: t('finance.yesCancel') || "Oui, Annuler",
                                style: "destructive",
                                onPress: async () => {
                                  try {
                                    setLoading(true);
                                    await repositoryProvider.api.delete(`/payrolls/${payment.id}/`);
                                    // Rafraîchir tout y compris le summary
                                    await fetchData();
                                    Alert.alert(t('common.success') || "Succès", t('employees.messages.cancelSalarySuccess') || "Paiement annulé.");
                                  } catch (error) {
                                    Alert.alert(t('common.error') || "Erreur", t('employees.messages.cancelSalaryError') || "Impossible d'annuler.");
                                  } finally {
                                    setLoading(false);
                                  }
                                }
                              }
                            ]
                          );
                        }}
                     >
                        <MaterialIcons name="cancel" size={18} color={theme.colors.danger} />
                        <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>Annuler</Text>
                     </TouchableOpacity>
                   </View>
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
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
    marginBottom: theme.spacing.l
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  summaryLabel: { fontSize: 13, color: '#000000', fontWeight: '900', textTransform: 'uppercase' },
  summaryValue: { fontSize: 28, fontWeight: '900', color: '#000000' },
  summaryFooter: {
    flexDirection: 'row',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 0.8,
    borderTopColor: 'rgba(0,0,0,0.1)'
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  footerText: { fontSize: 12, color: '#000000', fontWeight: '900', marginLeft: 4 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  filterText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  payCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  payMain: { flexDirection: 'row', alignItems: 'center' },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#000000' },
  payInfo: { flex: 1 },
  payName: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  payPos: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
  payAmountSection: { alignItems: 'flex-end' },
  payAmount: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  currency: { fontSize: 10, fontWeight: '600' },
  lastPaidText: { fontSize: 11, color: theme.colors.success, marginTop: 2, fontWeight: '700' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 0.8,
    borderColor: theme.colors.border
  },
  statusText: { fontSize: 10, fontWeight: '900' },
  payActions: {
    flexDirection: 'row',
    marginTop: theme.spacing.m,
    paddingTop: theme.spacing.s,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border
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
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
    marginLeft: 6
  },
  generateAllBtn: {
    marginTop: 10,
    height: 56,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.primary
  }
});