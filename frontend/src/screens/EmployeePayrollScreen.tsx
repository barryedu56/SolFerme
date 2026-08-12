import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { generatePayrollPDF } from '../utils/reportGenerator';
import { formatCurrency } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export const EmployeePayrollScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userName } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  useEffect(() => {
    fetchPayrolls();
  }, []);

  const handleGeneratePDF = async (item: any) => {
    try {
      const payrollData = {
        name: userName || 'Employé',
        position: item.employee_position || '',
        base_salary: parseFloat(item.base_salary),
        bonus: parseFloat(item.bonus),
        deduction: parseFloat(item.deduction),
        amount_paid: parseFloat(item.amount_paid),
        month: item.month
      };
      await generatePayrollPDF(payrollData, t);
    } catch (error) {
      Alert.alert(t('common.error'), t('payroll.bulletinError'));
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <Card style={styles.payCard}>
      <View style={styles.cardHeader}>
        <View style={styles.monthContainer}>
          <MaterialIcons name="event-note" size={20} color={theme.colors.primary} />
          <Text style={styles.monthText}>{item.month}</Text>
        </View>
        <TouchableOpacity style={styles.downloadBtn} onPress={() => handleGeneratePDF(item)}>
          <MaterialIcons name="file-download" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('payroll.baseSalary')}</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.base_salary)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('payroll.bonus')}</Text>
          <Text style={[styles.detailValue, { color: theme.colors.success }]}>+ {formatCurrency(item.bonus)}</Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('payroll.deduction')}</Text>
          <Text style={[styles.detailValue, { color: theme.colors.danger }]}>- {formatCurrency(item.deduction)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>{t('payroll.netAmount')}</Text>
          <Text style={styles.netValue}>{formatCurrency(item.amount_paid)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <MaterialIcons name="calendar-today" size={14} color={theme.colors.textSecondary} />
        <Text style={styles.footerText}>
          {t('profile.paidOn')} {new Date(item.date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
        </Text>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('profile.paymentHistory')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={payrolls}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="payments" size={64} color={theme.colors.textSecondary + '40'} />
              <Text style={styles.emptyText}>{t('profile.noPayments')}</Text>
            </View>
          }
        />
      )}
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
    paddingTop: theme.spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  list: { padding: theme.spacing.m, maxWidth: 600, alignSelf: 'center', width: '100%' },
  payCard: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthContainer: { flexDirection: 'row', alignItems: 'center' },
  monthText: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginLeft: 8 },
  downloadBtn: {
    padding: 8,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: 12,
  },
  divider: {
    height: 0.8,
    backgroundColor: theme.colors.border,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '700', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  netValue: { fontSize: 16, fontWeight: '900', color: theme.colors.primary },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border + '40',
  },
  footerText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: theme.colors.textSecondary, marginTop: 16, fontWeight: '600' },
});