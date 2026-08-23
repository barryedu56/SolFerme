import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, Alert, Modal, ScrollView, Platform } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { isNormalEgg, isBrokenEgg } from '../utils/inventory';
import { SalePaymentsModal } from '../components/SalePaymentsModal';

import { useBreakpoint } from '../hooks/useBreakpoint';

export const TransactionsHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop, isTablet } = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [paymentsModalVisible, setPaymentsModalVisible] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const [salesRes, salePaymentsRes, feedPurchasesRes, healthPurchasesRes, payrollsRes, expensesRes, farmsRes, lotsRes] = await Promise.all([
        repositoryProvider.api.get('/sales/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/sale-payments/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/feed-purchases/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/health-purchases/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/payrolls/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/expenses/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/farms/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/lots/').catch(() => ({ data: [] })),
      ]);

      const farmList = (farmsRes?.data?.results || farmsRes?.data || []);
      const lotList = (lotsRes?.data?.results || lotsRes?.data || []);
      setFarms(Array.isArray(farmList) ? farmList : []);
      setLots(Array.isArray(lotList) ? lotList : []);

      const lotToFarmMap = Object.fromEntries(lotList.map((l: any) => [l.id, l.farm]));
      const lotNameMap = Object.fromEntries(lotList.map((l: any) => [l.id, l.name]));

      const salesData = Array.isArray(salesRes?.data) ? salesRes.data : (salesRes?.data?.results || []);
      const saleMap = Object.fromEntries(salesData.map((s: any) => [s.id, s]));

      const getSaleProductLabel = (sale: any) => {
        if (!sale) return '';
        if (sale.product_type === 'CHICKEN') return t('sales.typeChicken');
        if (sale.product_type === 'BROKEN') return t('sales.typeBroken');
        return t('sales.typeNormal');
      };

      const getSaleDisplayLabel = (sale: any) => {
        if (!sale) return '';
        return `${sale.quantity} ${getSaleProductLabel(sale)}`;
      };

      const getSaleTitle = (sale: any) => {
        const customer = sale.customer_name?.trim();
        if (customer) {
          return `${t('finance.salePrefix')}${customer}`;
        }
        return `${t('finance.salePrefix')}${getSaleDisplayLabel(sale)}`;
      };

      const getSaleSubtitle = (sale: any) => {
        if (!sale) return undefined;
        const lotName = lotNameMap[sale.lot];
        const desc = getSaleDisplayLabel(sale);
        return lotName ? `${desc} • ${lotName}` : desc;
      };

      const isTechnicalPaymentReference = (reference?: string) => {
        if (!reference) return false;
        return /^pay-[0-9a-z]{4,}(?:-[0-9a-z]{4,})+$/i.test(reference);
      };

      const getPaymentDisplay = (payment: any) => {
        const sale = saleMap[payment.sale];
        let title = t('finance.salePayment');
        let subtitle: string | undefined;

        if (payment.reference === 'INITIAL') {
          title = t('finance.paymentInitial');
          subtitle = sale ? `${t('finance.paymentForSale')} ${sale.customer_name?.trim() || getSaleDisplayLabel(sale)}` : undefined;
        } else if (sale) {
          const saleLabel = sale.customer_name?.trim() || getSaleDisplayLabel(sale);
          title = `${t('finance.paymentPrefix')}Vente ${saleLabel}`;
          subtitle = getSaleSubtitle(sale);
        } else if (payment.reference && !isTechnicalPaymentReference(payment.reference)) {
          title = `${t('finance.paymentPrefix')}${payment.reference}`;
        }

        // If the payment reference is a technical UUID-like string, do not expose it to the user.
        if (payment.reference && isTechnicalPaymentReference(payment.reference) && !sale) {
          title = t('finance.salePayment');
          subtitle = undefined;
        }

        return { title, subtitle };
      };

      const salesTrans = salesData.map((s: any) => ({
        id: `s-${s.id}`,
        title: getSaleTitle(s),
        subtitle: getSaleSubtitle(s),
        amount: parseFloat(s.amount_paid),
        date: s.date,
        type: 'income',
        status: s.status,
        original: s,
        module: 'sales',
        lotId: s.lot,
        farmId: lotToFarmMap[s.lot]
      }));

      const salePaymentsData = Array.isArray(salePaymentsRes?.data) ? salePaymentsRes.data : (salePaymentsRes?.data?.results || []);
      const salePaymentTrans = salePaymentsData.map((p: any) => {
        const paymentDisplay = getPaymentDisplay(p);
        return {
          id: `sp-${p.id}`,
          title: paymentDisplay.title,
          subtitle: paymentDisplay.subtitle,
          amount: parseFloat(p.amount),
          date: p.payment_date,
          type: 'income',
          status: p.status,
          original: p,
          module: 'sale-payments',
          lotId: p.lot,
          farmId: p.farm
        };
      });

      const feedData = Array.isArray(feedPurchasesRes?.data) ? feedPurchasesRes.data : (feedPurchasesRes?.data?.results || []);
      const feedTrans = feedData.map((p: any) => ({
        id: `fp-${p.id}`,
        title: `${t('finance.feedPrefix')}${p.feed_type}`,
        amount: -parseFloat(p.total_price),
        date: p.date,
        type: 'expense',
        status: p.status,
        original: p,
        module: 'feed-purchases',
        farmId: p.farm
      }));

      const healthData = Array.isArray(healthPurchasesRes?.data) ? healthPurchasesRes.data : (healthPurchasesRes?.data?.results || []);
      const healthTrans = healthData.map((p: any) => ({
        id: `hp-${p.id}`,
        title: `${t('finance.healthPrefix')}${p.product_name}`,
        amount: -parseFloat(p.total_price),
        date: p.date,
        type: 'expense',
        status: p.status,
        original: p,
        module: 'health-purchases',
        farmId: p.farm
      }));

      const payrollData = Array.isArray(payrollsRes?.data) ? payrollsRes.data : (payrollsRes?.data?.results || []);
      const payrollTrans = payrollData.map((p: any) => ({
        id: `py-${p.id}`,
        title: `${t('finance.salaryPrefix')}${p.employee_name || p.employee_details?.user?.name || t('common.anonymous')}`,
        amount: -parseFloat(p.amount_paid),
        date: p.date,
        type: 'expense',
        status: p.status === 'PAID' ? 'ACTIF' : p.status,
        original: p,
        module: 'payrolls',
        farmId: p.farm
      }));

      const expenseData = Array.isArray(expensesRes?.data) ? expensesRes.data : (expensesRes?.data?.results || []);
      const expenseTrans = expenseData.filter((e: any) => !e.description.includes('Achat') && !e.category.includes('SALAIRE')).map((e: any) => ({
        id: `e-${e.id}`,
        title: e.description || t('finance.miscExpense'),
        amount: -parseFloat(e.amount),
        date: e.date,
        type: 'expense',
        status: e.status,
        original: e,
        module: 'expenses',
        farmId: e.farm
      }));

      const allTransactions = [...salesTrans, ...salePaymentTrans, ...feedTrans, ...healthTrans, ...payrollTrans, ...expenseTrans]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(allTransactions);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (selectedFarm) {
      result = result.filter(t => t.farmId === selectedFarm);
    }
    if (selectedLot) {
      result = result.filter(t => t.lotId === selectedLot);
    }

    if (filterPeriod !== 'all') {
      const now = new Date();
      result = result.filter(t => {
        const d = new Date(t.date);
        if (filterPeriod === 'day') return d.toDateString() === now.toDateString();
        if (filterPeriod === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return d >= weekAgo;
        }
        if (filterPeriod === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (filterPeriod === 'year') return d.getFullYear() === now.getFullYear();
        return true;
      });
    }

    return result;
  }, [transactions, selectedFarm, selectedLot, filterPeriod]);

  const handleCancel = (item: any) => {
    const executeCancel = async () => {
      try {
        setLoading(true);
        await repositoryProvider.api.delete(`/${item.module}/${item.original.id}/`);
        setModalVisible(false);
        fetchTransactions();
        Alert.alert(t('common.success'), t('finance.cancelSuccess'));
      } catch (error: any) {
        Alert.alert(t('common.error'), error.response?.data?.detail || t('finance.cancelError'));
      } finally {
        setLoading(false);
      }
    };

    // Sur web, utiliser window.confirm() pour confirmation
    if (Platform.OS === 'web') {
      if (window.confirm(t('finance.confirmCancelMsg'))) {
        executeCancel();
      }
      return;
    }

    // Sur native, utiliser Alert.alert pour confirmation
    Alert.alert(
      t('finance.confirmCancelTitle'),
      t('finance.confirmCancelMsg'),
      [
        { text: t('common.no'), style: "cancel" },
        {
          text: t('finance.yesCancel'),
          style: "destructive",
          onPress: executeCancel
        }
      ]
    );
  };

  const showDetails = (item: any) => {
    setSelectedTransaction(item);
    setModalVisible(true);
  };

  const openPayments = (sale: any) => {
    setPaymentTarget(sale);
    setPaymentsModalVisible(true);
  };

  const renderDetailItem = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') return null;
    return (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}:</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  };

  const renderTransactionDetails = () => {
    if (!selectedTransaction) return null;
    const { original, module } = selectedTransaction;

    return (
      <ScrollView>
        <Text style={styles.modalSubtitle}>{t('finance.generalInfo')}</Text>
        {renderDetailItem("ID", original.id)}
        {renderDetailItem(t('common.date'), new Date(original.date).toLocaleDateString(t('common.dateLocale')))}
        {renderDetailItem(t('common.status'), original.status)}

        <Text style={[styles.modalSubtitle, { marginTop: 15 }]}>{t('finance.specificDetails')}</Text>

        {module === 'sales' && (
          <>
            {renderDetailItem(t('sales.productType'), isNormalEgg(original.product_type) ? t('sales.typeNormal') : (isBrokenEgg(original.product_type) ? t('sales.typeBroken') : original.product_type))}
            {renderDetailItem(t('sales.nbTrays'), `${original.quantity} ${t('sales.trays')}`)}
            {renderDetailItem(t('sales.pricePerTray'), formatCurrency(original.unit_price))}
            {renderDetailItem(t('common.total'), formatCurrency(original.total_amount))}
            {renderDetailItem(t('finance.amountVersed'), formatCurrency(original.amount_paid))}
            {renderDetailItem(t('sales.clientName'), original.customer_name)}
            {renderDetailItem(t('profile.phone'), original.customer_phone)}
          </>
        )}

        {module === 'feed-purchases' && (
          <>
            {renderDetailItem(t('feed.type'), original.feed_type)}
            {renderDetailItem(t('feed.quantity'), `${original.quantity_kg} kg`)}
            {renderDetailItem(t('feed.totalPrice'), formatCurrency(original.total_price))}
            {renderDetailItem(t('farms.supplier'), original.supplier)}
          </>
        )}

        {module === 'health-purchases' && (
          <>
            {renderDetailItem(t('health.productName'), original.product_name)}
            {renderDetailItem(t('health.quantity'), original.quantity)}
            {renderDetailItem(t('health.totalPrice'), formatCurrency(original.total_price))}
            {renderDetailItem(t('farms.supplier'), original.supplier)}
          </>
        )}

        {module === 'payrolls' && (
          <>
            {renderDetailItem(t('payroll.employee'), original.employee_name || original.employee_details?.user?.name)}
            {renderDetailItem(t('payroll.period'), original.month)}
            {renderDetailItem(t('payroll.baseSalary'), formatCurrency(original.base_salary))}
            {renderDetailItem(t('payroll.bonus'), formatCurrency(original.bonus))}
            {renderDetailItem(t('payroll.deduction'), formatCurrency(original.deduction))}
            {renderDetailItem(t('finance.amountVersed'), formatCurrency(original.amount_paid))}
            {renderDetailItem(t('payroll.paymentMethod'), original.payment_method)}
          </>
        )}

        {module === 'expenses' && (
          <>
            {renderDetailItem(t('expense.category'), original.category)}
            {renderDetailItem(t('expense.description'), original.description)}
            {renderDetailItem(t('expense.amount'), formatCurrency(original.amount))}
          </>
        )}

        {original.note && (
           <>
             <Text style={[styles.modalSubtitle, { marginTop: 15 }]}>{t('common.notes')}</Text>
             <Text style={styles.detailValue}>{original.note}</Text>
           </>
        )}

        {selectedTransaction.status === 'ACTIF' && (
          <TouchableOpacity
            style={styles.cancelButtonLarge}
            onPress={() => handleCancel(selectedTransaction)}
          >
            <MaterialIcons name="cancel" size={20} color="#fff" />
            <Text style={styles.cancelButtonLargeText}>{t('finance.cancelTransactionBtn')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  const styles = useMemo(() => createStyles(theme, isDesktop), [theme, isDesktop]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('finance.historyTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { label: t('common.all'), value: 'all' },
            { label: t('common.day'), value: 'day' },
            { label: t('common.week'), value: 'week' },
            { label: t('common.month'), value: 'month' },
            { label: t('common.year'), value: 'year' },
          ].map((period) => (
            <TouchableOpacity
              key={period.value}
              style={[styles.filterChip, filterPeriod === period.value && styles.activeChip]}
              onPress={() => setFilterPeriod(period.value as any)}
            >
              <Text style={[styles.filterChipText, filterPeriod === period.value && styles.activeChipText]}>{period.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: 8 }]}>
          {farms.map((f: any) => (
            <TouchableOpacity
              key={`farm-${f.id}`}
              style={[styles.filterChip, selectedFarm === f.id && styles.activeChip]}
              onPress={() => {
                setSelectedFarm(selectedFarm === f.id ? null : f.id);
                setSelectedLot(null);
              }}
            >
              <Text style={[styles.filterChipText, selectedFarm === f.id && styles.activeChipText]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {selectedFarm && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: 8 }]}>
            {lots.filter(l => l.farm === selectedFarm).map((l: any) => (
              <TouchableOpacity
                key={`lot-${l.id}`}
                style={[styles.filterChip, selectedLot === l.id && styles.activeChip]}
                onPress={() => setSelectedLot(selectedLot === l.id ? null : l.id)}
              >
                <Text style={[styles.filterChipText, selectedLot === l.id && styles.activeChipText]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {loading && transactions.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        isDesktop ? (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: 40 }]}>#</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>{t('common.title')}</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>{t('common.date')}</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>{t('common.amount')}</Text>
                <Text style={[styles.tableHeaderCell, { width: 120, textAlign: 'right' }]}>Actions</Text>
              </View>
              {filteredTransactions.map((item: any) => {
                const isCancelled = item.status === 'ANNULEE';
                return (
                  <TouchableOpacity key={item.id} onPress={() => showDetails(item)} style={[styles.tableRow, isCancelled && { opacity: 0.6, backgroundColor: theme.colors.background }]}>
                    <View style={{ width: 40 }}>
                      <MaterialIcons
                        name={item.type === 'income' ? 'add-shopping-cart' : 'payments'}
                        size={18}
                        color={isCancelled ? theme.colors.textSecondary : (item.type === 'income' ? '#2E7D32' : theme.colors.danger)}
                      />
                    </View>
                    <View style={{ flex: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.tableCellText, { fontWeight: '700' }, isCancelled && { textDecorationLine: 'line-through' }]}>{item.title}</Text>
                        {isCancelled && (
                          <View style={styles.cancelledBadge}>
                            <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                          </View>
                        )}
                      </View>
                      {item.subtitle && <Text style={[styles.tableCellText, { fontSize: 11, color: theme.colors.textSecondary }]}>{item.subtitle}</Text>}
                    </View>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      {new Date(item.date).toLocaleDateString(t('common.dateLocale'))}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: '800', color: isCancelled ? theme.colors.textSecondary : (item.type === 'income' ? '#2E7D32' : theme.colors.danger) }]}>
                      {item.type === 'income' ? '+' : ''}{formatCurrency(item.amount)}
                    </Text>
                    <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end' }}>
                      {item.module === 'sales' && !isCancelled && (
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); openPayments(item.original); }} style={styles.actionIconBtn}>
                          <MaterialIcons name="point-of-sale" size={20} color={theme.colors.success} />
                        </TouchableOpacity>
                      )}
                      {!isCancelled && (
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleCancel(item); }} style={styles.actionIconBtn}>
                          <MaterialIcons name="cancel" size={20} color={theme.colors.danger} />
                        </TouchableOpacity>
                      )}
                      <MaterialIcons name="chevron-right" size={18} color={theme.colors.border} style={{ marginLeft: 4 }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={filteredTransactions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshing={loading}
            onRefresh={fetchTransactions}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => showDetails(item)}>
                <Card style={[styles.transactionCard, item.status === 'ANNULEE' && { opacity: 0.6, backgroundColor: theme.colors.background }]}>
                  <View style={styles.transactionIconCircle}>
                      <MaterialIcons
                        name={item.type === 'income' ? 'add-shopping-cart' : 'payments'}
                        size={20}
                        color={item.status === 'ANNULEE' ? theme.colors.textSecondary : (item.type === 'income' ? '#2E7D32' : theme.colors.danger)}
                      />
                  </View>
                  <View style={styles.transactionInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.transactionTitle, item.status === 'ANNULEE' && { textDecorationLine: 'line-through' }]}>{item.title}</Text>
                        {item.status === 'ANNULEE' && (
                          <View style={styles.cancelledBadge}>
                            <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                          </View>
                        )}
                      </View>
                      {item.subtitle ? (
                        <Text style={styles.transactionSubtitle}>{item.subtitle}</Text>
                      ) : null}
                      <Text style={styles.transactionDate}>{new Date(item.date).toLocaleDateString(t('common.dateLocale'))}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.transactionAmount, { color: item.status === 'ANNULEE' ? theme.colors.textSecondary : (item.type === 'income' ? '#2E7D32' : theme.colors.danger) }]}>
                        {item.type === 'income' ? '+' : ''}{formatCurrency(item.amount)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                        {item.module === 'sales' && item.status !== 'ANNULEE' && (
                          <TouchableOpacity
                            onPress={() => openPayments(item.original)}
                            style={{ marginRight: 10, padding: 5 }}
                          >
                            <MaterialIcons name="point-of-sale" size={20} color={theme.colors.success} />
                          </TouchableOpacity>
                        )}
                        {item.status !== 'ANNULEE' && (
                          <TouchableOpacity
                            onPress={() => handleCancel(item)}
                            style={{ marginRight: 10, padding: 5 }}
                          >
                            <MaterialIcons name="cancel" size={20} color={theme.colors.danger} />
                          </TouchableOpacity>
                        )}
                        <MaterialIcons name="chevron-right" size={18} color={theme.colors.border} />
                      </View>
                  </View>
                </Card>
              </TouchableOpacity>
            )}
          />
        )
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('finance.transactionDetails')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {renderTransactionDetails()}
          </View>
        </View>
      </Modal>

      {paymentTarget && (
        <SalePaymentsModal
          visible={paymentsModalVisible}
          onClose={() => setPaymentsModalVisible(false)}
          saleId={paymentTarget.id}
          lotId={paymentTarget.lot}
          farmId={paymentTarget.farm}
          totalAmount={parseFloat(paymentTarget.total_amount)}
          onPaymentAdded={() => fetchTransactions()}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  filterContainer: { paddingVertical: 12, backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  filterScroll: { 
    paddingHorizontal: theme.spacing.m,
    ...(isDesktop ? { flexDirection: 'row', flexWrap: 'wrap' } : {})
  },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: theme.colors.surface, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border,
  },
  activeChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: { fontSize: 13, color: theme.colors.textSecondary },
  activeChipText: { color: '#fff', fontWeight: 'bold' },
  list: { padding: theme.spacing.m, paddingBottom: 40, maxWidth: 1000, alignSelf: 'center', width: '100%' },
  transactionCard: {
    flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m,
    marginBottom: theme.spacing.s, borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  tableContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    overflow: 'hidden',
    marginBottom: theme.spacing.m,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary + '15',
    padding: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: theme.spacing.m,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 14,
    color: theme.colors.text,
  },
  tableCellText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  actionIconBtn: {
    padding: 8,
    marginLeft: 4,
  },
  transactionIconCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.background,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  transactionInfo: { flex: 1 },
  transactionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  transactionSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  transactionDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  transactionAmount: { fontSize: 15, fontWeight: 'bold' },
  cancelledBadge: {
    backgroundColor: '#ffcdd2',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6
  },
  cancelledText: {
    color: '#c62828',
    fontSize: 8,
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: isDesktop ? 'center' : 'flex-end',
    alignItems: isDesktop ? 'center' : 'stretch',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: isDesktop ? 30 : 0,
    borderBottomRightRadius: isDesktop ? 30 : 0,
    padding: theme.spacing.l,
    maxHeight: '80%',
    width: isDesktop ? '100%' : 'auto',
    maxWidth: isDesktop ? 600 : '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.m,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  cancelButtonLarge: {
    backgroundColor: theme.colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    marginTop: 30,
    marginBottom: 20,
  },
  cancelButtonLargeText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 10,
  }
});