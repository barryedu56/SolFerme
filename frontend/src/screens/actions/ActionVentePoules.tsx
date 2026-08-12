import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Switch } from 'react-native';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { SalePaymentsModal } from '../../components/SalePaymentsModal';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/formatters';
import { getErrorMessage } from '../../utils/errors';

export const ActionVentePoulesScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth() as any;
  const { item, lotId: routeLotId, lotName: routeLotName, lotPurchaseDate, currentQuantity: routeCurrentQuantity } = route.params || {};

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      Alert.alert(t('common.error'), t('common.actionForbidden'));
      navigation.goBack();
    }
  }, [userRole]);

  const isEditing = !!item;
  const lotId = isEditing ? item.lot : routeLotId;
  const lotName = isEditing ? item.lot_name : routeLotName;
  const currentQuantity = isEditing ? (routeCurrentQuantity || item.quantity) : routeCurrentQuantity;

  const [customer, setCustomer] = useState(isEditing ? item.customer_name : '');
  const [customerPhone, setCustomerPhone] = useState(isEditing ? item.customer_phone : '');  // Correction: champ customer_phone ajouté
  const [quantity, setQuantity] = useState(isEditing ? item.quantity.toString() : '');
  const [unitPrice, setUnitPrice] = useState(isEditing ? item.unit_price.toString() : '');
  const [isCredit, setIsCredit] = useState(isEditing ? (parseFloat(item.amount_paid) < parseFloat(item.total_amount)) : false);
  const [amountPaid, setAmountPaid] = useState(isEditing ? item.amount_paid.toString() : '');
  const [date, setDate] = useState(isEditing ? item.date : new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState(isEditing ? item.note : '');
  const [loading, setLoading] = useState(false);
  const [paymentsModalVisible, setPaymentsModalVisible] = useState(false);

  const totalAmount = (parseInt(quantity) || 0) * (parseFloat(unitPrice) || 0);
  const effectiveAmountPaid = isCredit ? (amountPaid !== '' ? (parseFloat(amountPaid) || 0) : 0) : totalAmount;
  const resteAPayer = totalAmount - effectiveAmountPaid;
  const parsedQuantity = parseInt(quantity) || 0;

  // En mode édition, le stock disponible réel est currentQuantity + l'ancienne quantité vendue
  const effectiveAvailable = isEditing ? (currentQuantity + item.quantity) : (currentQuantity || 0);
  const isStockInsufficient = parsedQuantity > effectiveAvailable;

  const handleSubmit = async () => {
    if (loading) return;
    if (!customer || !quantity || !unitPrice) {
      Alert.alert(t('common.error'), t('sales.messages.fillRequired'));
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      Alert.alert(t('common.error'), t('sales.messages.dateBeforeLotError'));
      return;
    }

    if (isStockInsufficient) {
      Alert.alert(
        t('sales.errorStock'),
        `${t('movement.mortalityWarning')} (Max: ${effectiveAvailable})`
      );
      return;
    }

    setLoading(true);
    try {
      const salePayload = {
        lot: lotId,
        customer_name: customer,
        customer_phone: customerPhone || undefined,  // Correction: champ ajouté
        product_type: 'CHICKEN',
        date,
        quantity: parsedQuantity,
        unit_price: parseFloat(unitPrice),
        total_amount: totalAmount,
        amount_paid: effectiveAmountPaid,
        note: note
      };

      if (isEditing) {
        await repositoryProvider.api.put(`/sales/${item.id}/`, salePayload);
      } else {
        await repositoryProvider.api.post('/sales/', salePayload);
      }

      Alert.alert(t('common.success'), isEditing ? t('common.updateSuccess') : t('sales.messages.saveSuccess'));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('common.actionImpossible'), getErrorMessage(e, t('sales.messages.saveError')));
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentAdded = () => {
    // Optionally trigger refresh
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? "Modifier la Vente" : "Vente de Poules"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={[styles.totalCard, { backgroundColor: theme.colors.primary }]}>
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>{t('sales.totalSale')}</Text>
                <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
              <MaterialCommunityIcons name="scale-balance" size={32} color="#000000" />
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
                  {formatCurrency(Math.max(0, resteAPayer))}
                </Text>
              </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('sales.clientProduct')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.stockSummary}>
              <View style={styles.stockInfo}>
                <MaterialCommunityIcons name="bird" size={24} color="#000000" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.stockLabel}>Poules disponibles</Text>
                  <Text style={styles.stockValue}>{effectiveAvailable} têtes</Text>
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

            {/* Correction: champ téléphone client ajouté */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="phone" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>Téléphone client (optionnel)</Text>
              </View>
              <Input placeholder="+224 XXX XX XX" value={customerPhone} onChangeText={setCustomerPhone} isPhone maxLength={9} style={styles.fieldInput} />
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('sales.priceQuantity')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <View style={styles.labelRow}>
                  <MaterialCommunityIcons name="numeric" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Quantité (Têtes)</Text>
                </View>
                <Input
                  placeholder="0"
                  value={quantity}
                  onChangeText={setQuantity}
                  isNumeric
                  style={[
                    styles.fieldInput,
                    { textAlign: 'center', fontSize: 22, fontWeight: 'bold' },
                    isStockInsufficient && { borderColor: theme.colors.danger, borderWidth: 1 }
                  ]}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="sell" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Prix / Poule</Text>
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

            {!isEditing ? (
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

            <DatePicker label={t('sales.saleDate')} value={date} onChange={setDate} />

            <View style={[styles.inputGroup, { marginTop: 15 }]}>
              <Text style={styles.label}>{t('common.notes')}</Text>
              <Input
                placeholder="..."
                value={note}
                onChangeText={setNote}
                multiline
                style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]}
              />
            </View>
          </Card>

          <Button
            title={t('sales.confirm')}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {isEditing && item && (
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
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  totalCard: {
    padding: theme.spacing.l, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l, ...theme.shadows.medium,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  separator: { height: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: theme.spacing.m },
  totalLabel: { fontSize: 12, color: '#000000', opacity: 0.8, fontWeight: 'bold' },
  totalValue: { fontSize: 28, fontWeight: 'bold', color: '#000000', marginTop: 4 },
  totalSubLabel: { fontSize: 11, color: '#000000', opacity: 0.8, fontWeight: 'bold' },
  totalSubValue: { fontSize: 16, fontWeight: 'bold', color: '#000000', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m, marginTop: theme.spacing.s },
  formCard: {
    padding: theme.spacing.m, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m, backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: 'bold', marginLeft: 8 },
  fieldInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  stockSummary: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.m, borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.m,
  },
  stockInfo: { flexDirection: 'row', alignItems: 'center' },
  stockLabel: { fontSize: 12, color: '#000000', fontWeight: 'bold' },
  stockValue: { fontSize: 20, fontWeight: 'bold', color: '#000000' },
  row: { flexDirection: 'row' },
  creditToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 8 },
  submitBtn: {
    height: 56, borderRadius: theme.borderRadius.xl,
    marginTop: theme.spacing.m, backgroundColor: theme.colors.primary,
    ...theme.shadows.medium
  },
});