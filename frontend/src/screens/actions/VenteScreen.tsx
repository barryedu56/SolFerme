import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import { generateReceiptPDF } from '../../utils/reportGenerator';

const PRODUCT_TYPES = ['Œufs Normaux', 'Œufs Cassés'];

export const ActionVenteScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { lotId, lotName, lotPurchaseDate, item } = route.params || {};
  const [customer, setCustomer] = useState(item?.customer_name || '');
  const [product, setProduct] = useState(item?.product_type || 'Œufs Normaux');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || ''); // nombre de casiers
  const [unitPrice, setUnitPrice] = useState(item?.unit_price?.toString() || ''); // prix par casier en GNF
  const [amountPaid, setAmountPaid] = useState(item?.amount_paid?.toString() || '');
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [fetchingStock, setFetchingStock] = useState(false);
  const [stockAvailable, setStockAvailable] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(!!item);

  const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
  const resteAPayer = totalAmount - (parseFloat(amountPaid) || 0);

  const parsedQuantity = parseFloat(quantity) || 0;
  const isStockInsufficient = stockAvailable !== null && parsedQuantity > stockAvailable;
  const remainingAfterSale = stockAvailable !== null ? stockAvailable - parsedQuantity : null;

  useEffect(() => {
    fetchAvailableStock();
  }, [lotId, product]);

  const fetchAvailableStock = async () => {
    if (!lotId) return;
    setFetchingStock(true);
    try {
      // Calcul du stock : Somme des productions - Somme des ventes pour ce lot et ce type de produit
      const [prodRes, salesRes] = await Promise.all([
        apiClient.get('/productions/'),
        apiClient.get('/sales/'),
      ]);

      const totalProduced = prodRes.data
        .filter((p: any) => p.lot === lotId)
        .reduce((sum: number, p: any) => {
          if (product === 'Œufs Normaux' || product === 'Oeufs') return sum + (p.casiers_vendables || 0);
          if (product === 'Œufs Cassés') return sum + ((p.oeufs_casses || 0) / 30);
          return sum;
        }, 0);

      const totalSold = salesRes.data
        .filter((s: any) => s.lot === lotId && (s.product_type === product || (product === 'Œufs Normaux' && s.product_type === 'Oeufs')) && (isEdit ? s.id !== item.id : true))
        .reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);

      setStockAvailable(totalProduced - totalSold);
    } catch (error) {
      console.log('Erreur récupération stock:', error);
    } finally {
      setFetchingStock(false);
    }
  };

  const handleGenerateReceipt = async () => {
    if (!customer || !quantity || !unitPrice) {
      Alert.alert(t('common.info'), t('sales.fillRequired') || 'Veuillez remplir les informations de vente avant de générer le reçu.');
      return;
    }
    const saleData = {
      customer_name: customer, product_type: product,
      quantity: parseFloat(quantity), unit_price: parseFloat(unitPrice),
      total_amount: totalAmount,
      amount_paid: amountPaid ? parseFloat(amountPaid) : totalAmount,
      date,
    };
    try {
      await generateReceiptPDF(saleData, t);
    } catch (error) {
      Alert.alert(t('common.error'), 'Impossible de générer le PDF.');
    }
  };

  const handleSubmit = async () => {
    if (!customer || !quantity || !unitPrice) {
      Alert.alert(t('common.error'), t('sales.fillRequired') || 'Veuillez remplir : client, nombre de casiers et prix par casier.');
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      Alert.alert(t('common.error'), "La date de cette action ne peut pas être antérieure à la date de création du lot.");
      return;
    }

    if (isStockInsufficient) {
      Alert.alert(
        t('sales.errorStock') || 'Stock insuffisant',
        `${t('sales.insufficientStockMsg') || 'Stock insuffisant. Vous avez actuellement'} ${stockAvailable} ${t('sales.availableTraysMsg') || 'casiers vendables disponibles.'}`
      );
      return;
    }

    setLoading(true);
    const payload = {
      lot: lotId,
      customer_name: customer,
      product_type: product,
      date,
      quantity: parseFloat(quantity),
      unit_price: parseFloat(unitPrice),
      total_amount: totalAmount,
      amount_paid: amountPaid ? parseFloat(amountPaid) : totalAmount,
    };
    try {
      if (isEdit) {
        await apiClient.put(`/sales/${item.id}/`, payload);
        Alert.alert(t('common.success'), t('sales.updated') || 'Vente mise à jour avec succès !');
      } else {
        await apiClient.post('/sales/', payload);
        Alert.alert(t('common.success'), t('sales.saved') || 'Vente enregistrée avec succès !');
      }
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        // Network error, queue for sync
        await addToSyncQueue('POST', '/sales/', payload);
        Alert.alert(t('common.offline'), t('sales.offlineSaved') || 'Connexion impossible. La vente a été enregistrée localement et sera synchronisée plus tard.');
        navigation.goBack();
      } else {
        const errorMsg = e.response?.data?.quantity?.[0] || t('sales.errorSave') || "Impossible d'enregistrer la vente.";
        Alert.alert(t('sales.errorStock'), errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

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
            {isEdit ? (t('sales.edit') || 'Modifier Vente') : (t('sales.title'))}
          </Text>
          <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('TransactionsHistory')}>
            <MaterialIcons name="history" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Carte récap financier */}
          <Card style={[styles.totalCard, { backgroundColor: theme.colors.primary }]}>
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>{t('sales.totalSale')}</Text>
                <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
              <View style={styles.totalIconCircle}>
                <MaterialIcons name="payments" size={32} color={theme.colors.text} />
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalSubLabel}>{t('sales.amountPaid')}</Text>
                <Text style={styles.totalSubValue}>{formatCurrency(parseFloat(amountPaid) || totalAmount)}</Text>
              </View>
              <View>
                <Text style={[styles.totalSubLabel, { textAlign: 'right' }]}>{t('sales.remaining')}</Text>
                <Text style={[styles.totalSubValue, { color: resteAPayer > 0 ? '#FFEB3B' : '#A5D6A7' }]}>
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
                <MaterialCommunityIcons name="egg-outline" size={24} color={theme.colors.primary} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.stockLabel}>
                    {product === 'Œufs Cassés' ? 'Casiers cassés disponibles :' : 'Casiers vendables disponibles :'}
                  </Text>
                  {fetchingStock ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Text style={styles.stockValue}>
                      {stockAvailable !== null ? formatNumber(stockAvailable) : '--'} casiers
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
              <Input placeholder="Ex: Marché Madina" value={customer} onChangeText={setCustomer} style={styles.fieldInput} />
            </View>

            <Text style={styles.label}>{t('sales.productType')}</Text>
            <View style={styles.productSelector}>
              {PRODUCT_TYPES.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.productButton, product === p && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setProduct(p)}
                >
                  <Text style={[styles.productButtonText, product === p && { color: theme.colors.text, fontWeight: 'bold' }]}>{p}</Text>
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
                  <Text style={styles.label}>{t('sales.nbTrays')} (Casiers)</Text>
                </View>
                <Input
                  placeholder="0.0"
                  value={quantity}
                  onChangeText={setQuantity}
                  isNumeric
                  style={[
                    styles.fieldInput,
                    { textAlign: 'center', fontSize: 22, fontWeight: 'bold' },
                    isStockInsufficient && { borderColor: theme.colors.danger, borderWidth: 1.5 }
                  ]}
                />
                <View style={styles.quickActions}>
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => setQuantity('0.5')}
                  >
                    <Text style={styles.quickActionText}>½ Casier</Text>
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
                        ? `Manque: ${formatNumber(parsedQuantity - stockAvailable)}`
                        : `Reste: ${formatNumber(remainingAfterSale || 0)}`
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

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="account-balance-wallet" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('sales.amountPaidLabel')}</Text>
              </View>
              <Input
                placeholder={t('sales.leaveEmpty') || 'Laisser vide si payé intégralement'}
                value={amountPaid}
                onChangeText={setAmountPaid}
                isNumeric
                style={styles.fieldInput}
              />
            </View>

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
              title={isEdit ? (t('common.update') || 'Mettre à jour') : (t('sales.confirm'))}
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
  totalCard: {
    padding: theme.spacing.l, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l, ...theme.shadows.medium,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: theme.spacing.m },
  totalLabel: { fontSize: 12, color: theme.colors.text, opacity: 0.7, fontWeight: '700', textTransform: 'uppercase' },
  totalValue: { fontSize: 30, fontWeight: '900', color: theme.colors.text, marginTop: 4 },
  totalSubLabel: { fontSize: 11, color: theme.colors.text, opacity: 0.7, textTransform: 'uppercase' },
  totalSubValue: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginTop: 2 },
  totalIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m, marginTop: theme.spacing.s },
  formCard: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.m, borderWidth: 1, borderColor: theme.colors.border + '40' },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600', marginLeft: 8 },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40', borderRadius: theme.borderRadius.m },
  stockSummary: {
    backgroundColor: theme.colors.primary + '10',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  stockInfo: { flexDirection: 'row', alignItems: 'center' },
  stockLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  stockValue: { fontSize: 20, fontWeight: '900', color: theme.colors.primary },
  stockFeedback: { marginTop: 4 },
  stockFeedbackText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  quickActionBtn: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  quickActionText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  productSelector: { flexDirection: 'row', marginTop: 8, gap: 8 },
  productButton: {
    flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surface, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border + '40',
  },
  productButtonText: { fontSize: 13, color: theme.colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center' },
  actionButtons: { marginTop: theme.spacing.m },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.m, backgroundColor: theme.colors.primary, ...theme.shadows.medium },
  printButton: {
    flexDirection: 'row', height: 50, borderRadius: theme.borderRadius.xl, borderWidth: 1.5,
    borderColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  printButtonText: { color: theme.colors.text, fontWeight: '700', fontSize: 15 },
});
