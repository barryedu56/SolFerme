import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { toast } from '../../utils/toast';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Switch } from 'react-native';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { SalePaymentsModal } from '../../components/SalePaymentsModal';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import { generateReceiptPDF } from '../../utils/reportGenerator';
import { calculateAvailableStock } from '../../utils/inventory';
import { getErrorMessage } from '../../utils/errors';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export const ActionVenteScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth() as any;
  const { isDesktop } = useBreakpoint();
  const { lotId, lotName, lotPurchaseDate, item } = route.params || {};

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      toast.error(t('common.error'), t('common.actionImpossible'));
      navigation.goBack();
    }
  }, [userRole]);

  const PRODUCT_TYPES_MAPPING = useMemo(() => [
    { label: t('sales.typeNormal'), value: 'NORMAL' },
    { label: t('sales.typeBroken'), value: 'BROKEN' }
  ], [t]);

  const [customer, setCustomer] = useState(item?.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(item?.customer_phone || '');  // Correction: champ customer_phone ajouté
  const [product, setProduct] = useState(item?.product_type || 'NORMAL');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || ''); // nombre de casiers
  const [unitPrice, setUnitPrice] = useState(item?.unit_price?.toString() || ''); // prix par casier en GNF
  const [isCredit, setIsCredit] = useState(item ? (parseFloat(item.amount_paid) < parseFloat(item.total_amount)) : false);
  const [amountPaid, setAmountPaid] = useState(item?.amount_paid?.toString() || '');
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [fetchingStock, setFetchingStock] = useState(false);
  const [stockAvailable, setStockAvailable] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(!!item);
  const [paymentsModalVisible, setPaymentsModalVisible] = useState(false);

  const cleanQuantity = quantity.toString().replace(/\s/g, '');
  const cleanUnitPrice = unitPrice.toString().replace(/\s/g, '');
  const cleanAmountPaid = amountPaid.toString().replace(/\s/g, '');

  const totalAmount = (parseFloat(cleanQuantity) || 0) * (parseFloat(cleanUnitPrice) || 0);
  const effectiveAmountPaid = isCredit ? (cleanAmountPaid !== '' ? (parseFloat(cleanAmountPaid) || 0) : 0) : totalAmount;
  const resteAPayer = totalAmount - effectiveAmountPaid;

  const parsedQuantity = parseFloat(cleanQuantity) || 0;
  const isStockInsufficient = stockAvailable !== null && parsedQuantity > stockAvailable;
  const remainingAfterSale = stockAvailable !== null ? stockAvailable - parsedQuantity : null;

  useEffect(() => {
    fetchAvailableStock();
  }, [lotId, product]);

  const fetchAvailableStock = async () => {
    if (!lotId) return;
    setFetchingStock(true);
    try {
      const [prodRes, salesRes, convRes] = await Promise.all([
        repositoryProvider.api.get(`/productions/?lot=${lotId}`),
        repositoryProvider.api.get(`/sales/?lot=${lotId}`),
        repositoryProvider.api.get(`/egg-conversions/?lot=${lotId}`).catch(() => ({ data: [] })),
      ]);

      // On gère le cas où l'API renvoie une liste paginée (objet avec results) ou une liste simple
      const productions = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.results || []);
      const sales = Array.isArray(salesRes.data) ? salesRes.data : (salesRes.data?.results || []);
      const conversions = Array.isArray(convRes.data) ? convRes.data : (convRes.data?.results || []);

      // on inclut les conversions (EN_ATTENTE → VENDABLE) dans le stock vendable disponible
      const available = calculateAvailableStock({
        productions,
        sales,
        conversions,
        lotId: lotId
      }, product, isEdit ? item.id : undefined);

      setStockAvailable(available);
    } catch (error) {
      console.log('Erreur récupération stock:', error);
      setStockAvailable(0);
    } finally {
      setFetchingStock(false);
    }
  };

  const handleGenerateReceipt = async () => {
    if (!customer || !quantity || !unitPrice) {
      toast.info(t('common.info'), t('sales.fillRequired'));
      return;
    }
    const saleData = {
      customer_name: customer, product_type: product,
      quantity: parseFloat(cleanQuantity), unit_price: parseFloat(cleanUnitPrice),
      total_amount: totalAmount,
      amount_paid: effectiveAmountPaid,
      date,
    };
    try {
      await generateReceiptPDF(saleData, t);
    } catch (error) {
      toast.error(t('common.error'), t('sales.pdfError'));
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!customer || !quantity || !unitPrice) {
      toast.error(t('common.error'), t('sales.messages.fillRequired'));
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      toast.error(t('common.error'), t('sales.messages.dateBeforeLotError'));
      return;
    }

    if (isStockInsufficient) {
      toast.error(
        t('sales.errorStock'),
        t('sales.messages.insufficientStock', { available: stockAvailable, unit: t('production.trays') })
      );
      return;
    }

    setLoading(true);
    const payload: Record<string, any> = {
      lot: lotId,
      customer_name: customer,
      customer_phone: customerPhone || undefined,  // Correction: champ ajouté
      product_type: product,
      date,
      quantity: parseFloat(cleanQuantity),
      unit_price: parseFloat(cleanUnitPrice),
      total_amount: totalAmount,
    };
    // 🔒 En édition, on N'ENVOIE PAS amount_paid : c'est un champ DÉRIVÉ de la
    // somme des SalePayment actifs (recalculé par le signal Django / la synchro).
    // L'envoyer (valeur souvent obsolète) écraserait le "déjà payé" et fausserait
    // la créance restante. On ne l'envoie que lors de la CRÉATION pour le
    // paiement initial.
    if (!isEdit) {
      payload.amount_paid = effectiveAmountPaid;
    }
    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/sales/${item.id}/`, payload);
        toast.success(t('common.success'), t('sales.messages.updateSuccess'));
      } else {
        await repositoryProvider.api.post('/sales/', payload);
        toast.success(t('common.success'), t('sales.messages.saveSuccess'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(
        t('common.actionImpossible'),
        getErrorMessage(e, t('sales.messages.saveError'))
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentAdded = () => {
    // Optionally refetch sale data if needed, or update effective amount paid.
    // For local state, let's just trigger a re-fetch of the form or goBack.
    // We will just let the modal update its own state.
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? t('sales.edit') : t('sales.title')}
          </Text>
          <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('TransactionsHistory')}>
            <MaterialIcons name="history" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          {/* Carte récap financier */}
          <Card style={[styles.totalCard, { backgroundColor: theme.colors.primary }]}>
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>{t('sales.totalSale')}</Text>
                <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
              <View style={styles.totalIconCircle}>
                <MaterialIcons name="payments" size={32} color="#000000" />
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalSubLabel}>{t('sales.amountPaid')}</Text>
                <Text style={styles.totalSubValue}>{formatCurrency(effectiveAmountPaid)}</Text>
              </View>
              <View>
                <Text style={[styles.totalSubLabel, { textAlign: 'right' }]}>{t('sales.remaining')}</Text>
                <Text style={[styles.totalSubValue, { color: resteAPayer > 0 ? '#BF360C' : '#1B5E20' }]}>
                  {resteAPayer > 0 ? formatCurrency(resteAPayer) : formatCurrency(0)}
                </Text>
              </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('sales.clientProduct')}</Text>
          <Card style={styles.formCard}>
            {/* Résumé du stock disponible */}
            <View style={styles.stockSummary}>
              <View style={styles.stockInfo}>
                <MaterialCommunityIcons name="egg-outline" size={24} color="#000000" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.stockLabel}>
                    {product === 'BROKEN' ? t('sales.brokenTraysAvailable') : t('sales.traysAvailable')}
                  </Text>
                  {fetchingStock ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <Text style={styles.stockValue}>
                      {stockAvailable !== null ? formatNumber(stockAvailable) : '--'} {t('production.trays')}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="person" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('sales.clientName')}</Text>
              </View>
              <Input placeholder={t('sales.placeholderClient')} value={customer} onChangeText={setCustomer} style={styles.fieldInput} />
            </View>

            {/* Correction: champ téléphone client ajouté (existe dans le modèle Sale backend) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="phone" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('sales.clientPhone') || 'Téléphone client'} ({t('common.unknown').toLowerCase()})</Text>
              </View>
              <Input placeholder="+224 XXX XX XX" value={customerPhone} onChangeText={setCustomerPhone} isPhone maxLength={9} style={styles.fieldInput} />
            </View>

            <Text style={styles.label}>{t('sales.productType')}</Text>
            <View style={styles.productSelector}>
              {PRODUCT_TYPES_MAPPING.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.productButton, product === p.value && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setProduct(p.value)}
                >
                  <Text style={[styles.productButtonText, product === p.value && { color: theme.colors.text, fontWeight: 'bold' }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('sales.priceQuantity')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="view-module" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('sales.nbTrays')} ({t('production.trays')})</Text>
                </View>
                <Input
                  placeholder="0.0"
                  value={quantity}
                  onChangeText={setQuantity}
                  isNumeric
                  style={[
                    styles.fieldInput,
                    { textAlign: 'center', fontSize: 22, fontWeight: 'bold' },
                    isStockInsufficient && { borderColor: theme.colors.danger, borderWidth: 0.8 }
                  ]}
                />
                <View style={styles.quickActions}>
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => setQuantity('0.5')}
                  >
                    <Text style={styles.quickActionText}>½ {t('production.tray')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => {
                      const current = parseFloat(quantity) || 0;
                      setQuantity((current + 0.5).toString());
                    }}
                  >
                    <Text style={styles.quickActionText}>+ 0.5</Text>
                  </TouchableOpacity>
                </View>
                {stockAvailable !== null && (
                  <View style={styles.stockFeedback}>
                    <Text style={[styles.stockFeedbackText, isStockInsufficient && { color: theme.colors.danger }]}>
                      {isStockInsufficient
                        ? `${t('sales.missing')}: ${formatNumber(parsedQuantity - stockAvailable)}`
                        : `${t('sales.remaining')}: ${formatNumber(remainingAfterSale || 0)}`
                      }
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="sell" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('sales.pricePerTray')}</Text>
                </View>
                <Input
                  placeholder="0"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                  isNumeric
                  style={[styles.fieldInput, { textAlign: 'center', fontSize: 18 }]}
                />
              </View>
            </View>

            {!isEdit ? (
              <>
                <View style={styles.creditToggleRow}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="credit-score" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>Vente à Crédit (Paiement Partiel / Ultérieur)</Text>
                  </View>
                  <Switch
                    value={isCredit}
                    onValueChange={setIsCredit}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    thumbColor={isCredit ? theme.colors.surface : theme.colors.textSecondary}
                  />
                </View>

                {isCredit && (
                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <MaterialIcons name="account-balance-wallet" size={18} color={theme.colors.primary} />
                      <Text style={styles.label}>{t('sales.amountPaid')}</Text>
                    </View>
                    <Input
                      placeholder="Montant payé (0 si non payé)"
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      isNumeric
                      style={styles.fieldInput}
                    />
                  </View>
                )}
              </>
            ) : (
              <View style={{ marginTop: 15, marginBottom: 15 }}>
                <Button 
                  title="Gérer les paiements" 
                  onPress={() => setPaymentsModalVisible(true)} 
                  style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.primary, borderWidth: 1 }}
                  textStyle={{ color: theme.colors.primary }}
                />
              </View>
            )}

            <View style={{ marginBottom: theme.spacing.m }}>
              <DatePicker
                label={t('sales.saleDate')}
                value={date}
                onChange={setDate}
              />
            </View>
          </Card>

          <View style={styles.actionButtons}>
            <Button
              title={isEdit ? t('common.update') : t('sales.confirm')}
              onPress={handleSubmit}
              loading={loading}
              style={styles.submitBtn}
            />
            <TouchableOpacity style={styles.printButton} onPress={handleGenerateReceipt}>
              <MaterialIcons name="print" size={20} color={theme.colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.printButtonText}>{t('sales.generateReceipt')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {isEdit && item && (
        <SalePaymentsModal
          visible={paymentsModalVisible}
          onClose={() => setPaymentsModalVisible(false)}
          saleId={item.id}
          lotId={lotId || item.lot}
          farmId={item.farm}
          totalAmount={totalAmount}
          onPaymentAdded={handlePaymentAdded}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: theme.colors.surface, ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  historyButton: { padding: 8 },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  totalCard: {
    padding: theme.spacing.l, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l, ...theme.shadows.medium,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  separator: { height: 0.8, backgroundColor: theme.colors.border, marginVertical: theme.spacing.m },
  totalLabel: { fontSize: 12, color: '#000000', opacity: 0.8, fontWeight: '900', textTransform: 'uppercase' },
  totalValue: { fontSize: 30, fontWeight: '900', color: '#000000', marginTop: 4 },
  totalSubLabel: { fontSize: 11, color: '#000000', opacity: 0.8, textTransform: 'uppercase', fontWeight: '900' },
  totalSubValue: { fontSize: 16, fontWeight: '900', color: '#000000', marginTop: 2 },
  totalIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginBottom: theme.spacing.m, marginTop: theme.spacing.s, textTransform: 'uppercase' },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '900', marginLeft: 8, textTransform: 'uppercase' },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  stockSummary: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  stockInfo: { flexDirection: 'row', alignItems: 'center' },
  stockLabel: { fontSize: 12, color: '#000000', fontWeight: '900', textTransform: 'uppercase' },
  stockValue: { fontSize: 20, fontWeight: '900', color: '#000000' },
  stockFeedback: { marginTop: 4 },
  stockFeedbackText: { fontSize: 13, fontWeight: '900', color: theme.colors.textSecondary },
  creditToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 8 },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  quickActionBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  quickActionText: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '900',
  },
  productSelector: { flexDirection: 'row', marginTop: 8, gap: 8 },
  productButton: {
    flex: 1, paddingVertical: 12, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surface, alignItems: 'center', borderWidth: 0.8, borderColor: theme.colors.border,
  },
  productButtonText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center' },
  actionButtons: { marginTop: theme.spacing.m },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
    backgroundColor: theme.colors.primary,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.medium
  },
  printButton: {
    flexDirection: 'row', height: 50, borderRadius: theme.borderRadius.xl, borderWidth: 0.8,
    borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  printButtonText: { color: theme.colors.text, fontWeight: '900', fontSize: 15, textTransform: 'uppercase' },
});