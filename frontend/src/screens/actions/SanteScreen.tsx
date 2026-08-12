import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { toast } from '../../utils/toast';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { repositoryProvider } from '../../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { getErrorMessage } from '../../utils/errors';
import { formatNumber } from '../../utils/formatters';

export const ActionSanteScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lotId, lotName, farmId, lotPurchaseDate, item, activeTab: initialTab } = route.params || {};

  const [date, setDate] = useState(item?.date || item?.purchase_date || new Date().toISOString().split('T')[0]);
  const [type, setType] = useState(item?.type || item?.product_type || '');
  const [productName, setProductName] = useState(item?.product_name || '');

  // Quantité utilisée (soin) ou achetée (achat)
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '');
  const [unit, setUnit] = useState(item?.unit || 'Flacon');

  const [cost, setCost] = useState(item?.total_price?.toString() || item?.cost?.toString() || '');
  const [veterinaire, setVeterinaire] = useState(item?.veterinarian || '');
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'treatment' | 'purchase'>(initialTab || 'treatment');

  const [inventory, setInventory] = useState<any[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const units = ['Flacon', 'Litre', 'Sachet', 'Boîte', 'Dose', 'sac', 'Autre'];

  // Camera & Scanning State
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      setActiveTab('treatment');
    }
    fetchInventory();
  }, [userRole]);

  const fetchInventory = async () => {
    try {
      const response = await repositoryProvider.api.get('/health-inventory/', { params: { lot: lotId } });
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching health inventory:', error);
    }
  };

  const handleSelectProduct = (product: any) => {
    setProductName(product.product_name);
    setType(product.product_type);
    setUnit(product.unit);
    setShowProductPicker(false);
  };

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        toast.error(t('common.error'), t('health.cameraPermission'));
        return;
      }
    }
    setScanning(true);
    setScanned(false);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    setScanning(false);
    setProductName(data);

    // Check if product exists in inventory
    const existing = inventory.find(p => p.product_name === data);
    if (existing) {
      setType(existing.product_type);
      setUnit(existing.unit);
    }

    Alert.alert(t('health.codeDetected'), `${t('health.productIdentified')} : ${data}`);
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (activeTab === 'treatment') {
      await handleTreatment();
    } else {
      await handlePurchase();
    }
  };

  const handleTreatment = async () => {
    if (!date || !type || !productName || !quantity) {
      toast.error(t('common.error'), t('health.fillRequired'));
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      toast.error(t('common.error'), t('health.dateBeforeLotError'));
      return;
    }

    setLoading(true);
    const payload = {
      lot: lotId,
      date,
      type,
      product_name: productName,
      quantity: parseFloat(quantity),
      unit: unit,
      cost: 0,
      veterinarian: veterinaire,
    };

    // Validation du stock côté client
    const selectedProd = inventory.find(p => p.product_name === productName);
    if (!selectedProd) {
      toast.error(t('common.error'), t('health.productNotFound'));
      setLoading(false);
      return;
    }

    if (parseFloat(quantity) > parseFloat(selectedProd.quantity)) {
      toast.error(t('common.error'), `${t('health.insufficientStock')} (${selectedProd.quantity} ${selectedProd.unit} disponibles)`);
      setLoading(false);
      return;
    }

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/health-records/${item.id}/`, payload);
        toast.success(t('common.success'), t('health.updated'));
      } else {
        await repositoryProvider.api.post('/health-records/', payload);
        toast.success(t('common.success'), t('health.success'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.actionImpossible'), getErrorMessage(e, t('health.saveError')));
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!date || !productName || !cost || !quantity) {
      toast.error(t('common.error'), t('health.fillRequiredPurchase'));
      return;
    }

    setLoading(true);
    const payload = {
      product_name: productName,
      product_type: type,
      quantity: parseFloat(quantity),
      unit: unit,
      total_price: parseFloat(cost),
      date,
      lot: lotId,
      farm: farmId,
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/health-purchases/${item.id}/`, payload);
        toast.success(t('common.success'), t('health.purchaseUpdated'));
      } else {
        await repositoryProvider.api.post('/health-purchases/', payload);
        toast.success(t('common.success'), t('health.purchaseSuccess'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.actionImpossible'), getErrorMessage(e, t('health.purchaseError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? t('common.edit') : t('health.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.lotInfoCard}>
            <View style={styles.lotInfoContent}>
              <View style={[styles.lotIconContainer, { backgroundColor: '#E3F2FD' }]}>
                <MaterialIcons name="medical-services" size={24} color="#1976D2" />
              </View>
              <View style={styles.lotTexts}>
                <Text style={styles.lotNameText}>{t('lots.lot')}: {lotName}</Text>
                <DatePicker
                  value={date}
                  onChange={setDate}
                  label={t('health.interventionDate')}
                />
              </View>
            </View>
          </Card>

          {userRole !== 'EMPLOYE' && !isEdit && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'treatment' && styles.activeTab]}
                onPress={() => setActiveTab('treatment')}
              >
                <Text style={[styles.tabText, activeTab === 'treatment' && styles.activeTabText]}>{t('health.tabTreatment')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'purchase' && styles.activeTab]}
                onPress={() => setActiveTab('purchase')}
              >
                <Text style={[styles.tabText, activeTab === 'purchase' && styles.activeTabText]}>{t('health.tabPurchase')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionTitle}>
            {activeTab === 'treatment' ? t('health.treatmentDetails') : t('health.purchaseDetails')}
          </Text>

          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="inventory-2" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('health.productName')}</Text>
                </View>
                <View style={styles.row}>
                  {activeTab === 'treatment' || (isEdit && activeTab === 'purchase') ? (
                    <>
                    <TouchableOpacity
                      style={[styles.fieldInput, { flex: 1, height: 50, justifyContent: 'center', paddingHorizontal: 12 }]}
                      onPress={() => setShowProductPicker(true)}
                    >
                      <Text
                        style={{ color: productName ? theme.colors.text : theme.colors.textSecondary }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {productName || t('health.placeholderProductName')}
                      </Text>
                    </TouchableOpacity>
                    {productName && activeTab === 'treatment' && (
                      <View style={styles.stockInfo}>
                        <MaterialIcons name="inventory-2" size={16} color={theme.colors.success} />
                        <Text style={styles.stockText}>
                          Stock: {inventory.find((p: any) => p.product_name === productName)?.quantity || 0} {inventory.find((p: any) => p.product_name === productName)?.unit || ''}
                        </Text>
                      </View>
                    )}
                    </>
                  ) : (
                    <Input
                      placeholder={t('health.placeholderProductName')}
                      value={productName}
                      onChangeText={(text) => {
                        setProductName(text);
                        const existing = inventory.find(p => p.product_name.toLowerCase() === text.toLowerCase());
                        if (existing) {
                          setType(existing.product_type);
                          setUnit(existing.unit);
                        }
                      }}
                      style={[styles.fieldInput, { flex: 1 }]}
                    />
                  )}
                  {activeTab === 'purchase' && (
                    <TouchableOpacity style={styles.scanButton} onPress={handleScanPress}>
                       <MaterialIcons name="qr-code-scanner" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                  )}
                </View>
             </View>

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="category" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('health.interventionType')}</Text>
                </View>
                <Input
                  placeholder={t('health.placeholderType')}
                  value={type}
                  onChangeText={setType}
                  editable={!inventory.find(p => p.product_name === productName)}
                  style={[styles.fieldInput, inventory.find(p => p.product_name === productName) && { backgroundColor: theme.colors.border + '40' }]}
                />
             </View>

             <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                   <View style={styles.labelRow}>
                     <MaterialIcons name="straighten" size={18} color={theme.colors.primary} />
                     <Text style={styles.label}>{activeTab === 'treatment' ? t('health.quantityUsed') || 'Quantité Utilisée' : t('health.quantityPurchased') || 'Quantité Achetée'}</Text>
                   </View>
                   <Input
                     placeholder="0"
                     value={quantity}
                     onChangeText={setQuantity}
                     style={styles.fieldInput}
                     isNumeric
                   />
                </View>
                <View style={[styles.inputGroup, { width: 120, marginLeft: 10 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>{t('common.unit')}</Text>
                  </View>
                  {activeTab === 'purchase' && !inventory.find(p => p.product_name === productName) ? (
                    <TouchableOpacity
                      style={[styles.fieldInput, { height: 50, justifyContent: 'center', paddingHorizontal: 12 }]}
                      onPress={() => setShowUnitPicker(true)}
                    >
                      <Text style={{ color: theme.colors.text }}>{unit}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Input
                      value={unit}
                      style={styles.fieldInput}
                      editable={false}
                    />
                  )}
                </View>
             </View>

             {activeTab === 'purchase' && (
               <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="payments" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('health.totalPrice')}</Text>
                  </View>
                  <Input
                    placeholder="0"
                    value={cost}
                    onChangeText={setCost}
                    isNumeric
                    style={styles.fieldInput}
                  />
                </View>
             )}

             {activeTab === 'treatment' && (
               <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="person-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('health.veterinary')}</Text>
                  </View>
                  <Input
                    placeholder={t('health.placeholderPraticien')}
                    value={veterinaire}
                    onChangeText={setVeterinaire}
                    style={styles.fieldInput}
                  />
               </View>
             )}
          </Card>

          <Button
            title={isEdit ? t('common.update') : (activeTab === 'treatment' ? t('health.submitTreatment') : t('health.submitPurchase'))}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128'] }}
          />
          <View style={styles.overlay}>
             <View style={styles.unfocusedContainer}></View>
             <View style={styles.focusedRow}>
                <View style={styles.unfocusedContainer}></View>
                <View style={styles.focusedContainer}></View>
                <View style={styles.unfocusedContainer}></View>
             </View>
             <View style={styles.unfocusedContainer}>
                <Text style={styles.scanText}>{t('health.scanGuide')}</Text>
                <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setScanning(false)}>
                   <Text style={styles.cancelScanText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
             </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showProductPicker} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('health.selectProduct')}</Text>
              <TouchableOpacity onPress={() => setShowProductPicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {inventory.filter((item: any) => item.quantity > 0).map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.productItem}
                  onPress={() => handleSelectProduct(item)}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.productItemName} numberOfLines={1} ellipsizeMode="tail">{item.product_name}</Text>
                    <Text style={styles.productItemType} numberOfLines={1} ellipsizeMode="tail">{item.product_type}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', minWidth: 100 }}>
                    <Text style={[styles.productItemStock, parseFloat(item.quantity) <= 0 && { color: theme.colors.danger }]}>
                      {formatNumber(item.quantity)} {item.unit}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {inventory.length === 0 && (
                <Text style={styles.noDataText}>{t('health.noProductInStock')}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showUnitPicker} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.selectUnit') || 'Sélectionner l\'unité'}</Text>
              <TouchableOpacity onPress={() => setShowUnitPicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {units.map((u, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.productItem}
                  onPress={() => {
                    setUnit(u);
                    setShowUnitPicker(false);
                  }}
                >
                  <Text style={styles.productItemName}>{u}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingTop: theme.spacing.l,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  lotInfoCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  lotInfoContent: { flexDirection: 'row', alignItems: 'center' },
  lotIconContainer: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m },
  lotTexts: { flex: 1 },
  lotNameText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m, marginTop: theme.spacing.s },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: 4,
    marginBottom: theme.spacing.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.borderRadius.m },
  activeTab: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: 'bold', color: theme.colors.textSecondary },
  activeTabText: { color: '#000000', fontWeight: 'bold' },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '700', marginLeft: 8, textTransform: 'uppercase' },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40', borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  scanButton: {
    backgroundColor: theme.colors.surface,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.primary, ...theme.shadows.medium, borderWidth: 1, borderColor: theme.colors.border },
  scannerContainer: { flex: 1, backgroundColor: 'black' },
  overlay: { flex: 1 },
  unfocusedContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  focusedRow: { flexDirection: 'row', height: 250 },
  focusedContainer: { width: 250, borderWidth: 1.2, borderColor: '#FFFFFF', backgroundColor: 'transparent', borderRadius: 20 },
  scanText: { color: 'white', fontSize: 16, marginBottom: 20, textAlign: 'center', paddingHorizontal: 20 },
  cancelScanBtn: { backgroundColor: 'rgba(255,255,255,0.3)', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
  cancelScanText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  productItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  productItemName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  productItemType: { fontSize: 12, color: theme.colors.textSecondary },
  productItemStock: { fontSize: 14, fontWeight: 'bold', color: theme.colors.primary },
  noDataText: { textAlign: 'center', marginTop: 20, color: theme.colors.textSecondary },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.colors.success + '15',
    borderRadius: 8,
  },
  stockText: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: 'bold',
    marginLeft: 6,
  }
});