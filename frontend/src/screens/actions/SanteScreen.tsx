import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { addToSyncQueue } from '../../utils/offlineStorage';

export const ActionSanteScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { lotId, lotName, farmId, lotPurchaseDate, item, activeTab: initialTab } = route.params || {};
  const [date, setDate] = useState(item?.date || item?.purchase_date || new Date().toISOString().split('T')[0]);
  const [type, setType] = useState(item?.type || '');
  const [productName, setProductName] = useState(item?.product_name || '');
  const [dose, setDose] = useState(item?.dose || item?.quantity?.toString() || '');
  const [cost, setCost] = useState(item?.total_price?.toString() || item?.cost?.toString() || '');
  const [veterinaire, setVeterinaire] = useState(item?.veterinarian || '');
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'treatment' | 'purchase'>(initialTab || 'treatment');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user_role').then(role => {
      setUserRole(role);
      if (role === 'EMPLOYE') {
        setActiveTab('treatment');
      }
    });
  }, []);

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(t('common.error'), "L'accès à la caméra est nécessaire pour scanner.");
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
    Alert.alert("Code détecté", `Produit identifié : ${data}`);
  };

  const handleSubmit = async () => {
    if (activeTab === 'treatment') {
      await handleTreatment();
    } else {
      await handlePurchase();
    }
  };

  const handleTreatment = async () => {
    if (!date || !type || !productName) {
      Alert.alert(t('common.error'), t('health.fillRequired') || 'Veuillez remplir les champs obligatoires (Type, Nom du produit).');
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      Alert.alert(t('common.error'), "La date de cette action ne peut pas être antérieure à la date de création du lot.");
      return;
    }

    setLoading(true);
    const payload = {
      lot: lotId,
      date,
      type,
      product_name: productName,
      dose,
      cost: 0,
      veterinarian: veterinaire,
    };
    try {
      if (isEdit) {
        await apiClient.put(`/health-records/${item.id}/`, payload);
        Alert.alert(t('common.success'), t('health.updated') || 'Soin mis à jour avec succès !');
      } else {
        await apiClient.post('/health-records/', payload);
        Alert.alert(t('common.success'), t('health.success') || 'Soin enregistré avec succès !');
      }
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        await addToSyncQueue('POST', '/health-records/', payload);
        Alert.alert(t('common.offline'), 'Enregistré localement.');
        navigation.goBack();
      } else {
        Alert.alert(t('common.error'), "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!date || !productName || !cost) {
      Alert.alert(t('common.error'), 'Veuillez remplir tous les champs (Produit, Quantité/Dose, Prix total).');
      return;
    }

    setLoading(true);
    const payload = {
      product_name: productName,
      quantity: parseFloat(dose),
      total_price: parseFloat(cost),
      date,
      lot: lotId,
      farm: farmId,
    };

    try {
      if (isEdit) {
        await apiClient.put(`/health-purchases/${item.id}/`, payload);
        Alert.alert(t('common.success'), 'Achat médicament mis à jour');
      } else {
        await apiClient.post('/health-purchases/', payload);
        Alert.alert(t('common.success'), 'Achat médicament enregistré (Stock + Finance mis à jour)');
      }
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        await addToSyncQueue('POST', '/health-purchases/', payload);
        Alert.alert(t('common.offline'), 'Achat enregistré localement.');
        navigation.goBack();
      } else {
        Alert.alert(t('common.error'), "Erreur lors de l'enregistrement de l'achat.");
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? 'Modifier' : t('health.title') || 'Santé'}
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
                <Text style={styles.lotNameText}>{t('farms.batches')}: {lotName}</Text>
                <DatePicker value={date} onChange={setDate} />
              </View>
            </View>
          </Card>

          {userRole !== 'EMPLOYE' && !isEdit && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'treatment' && styles.activeTab]}
                onPress={() => setActiveTab('treatment')}
              >
                <Text style={[styles.tabText, activeTab === 'treatment' && styles.activeTabText]}>TRAITEMENT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'purchase' && styles.activeTab]}
                onPress={() => setActiveTab('purchase')}
              >
                <Text style={[styles.tabText, activeTab === 'purchase' && styles.activeTabText]}>ACHETER</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionTitle}>
            {activeTab === 'treatment' ? (t('health.details') || "Détails de l'intervention") : 'Détails de l\'achat'}
          </Text>

          <Card style={styles.formCard}>
             {activeTab === 'treatment' && (
               <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="category" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('health.interventionType')}</Text>
                  </View>
                  <Input
                    placeholder="Vaccin, Médicament, Vitamines..."
                    value={type}
                    onChangeText={setType}
                    style={styles.fieldInput}
                  />
               </View>
             )}

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="inventory" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('health.productName')}</Text>
                </View>
                <View style={styles.row}>
                  <Input
                    placeholder="Ex: Gumboro, Tylosine"
                    value={productName}
                    onChangeText={setProductName}
                    style={[styles.fieldInput, { flex: 1 }]}
                  />
                  <TouchableOpacity style={styles.scanButton} onPress={handleScanPress}>
                     <MaterialIcons name="qr-code-scanner" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
             </View>

             <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: activeTab === 'purchase' ? 10 : 0 }]}>
                   <View style={styles.labelRow}>
                     <MaterialIcons name="straighten" size={18} color={theme.colors.primary} />
                     <Text style={styles.label}>{activeTab === 'treatment' ? t('health.dose') : 'Quantité'}</Text>
                   </View>
                   <Input
                     placeholder={activeTab === 'treatment' ? "Ex: 1ml/L" : "Ex: 20"}
                     value={dose}
                     onChangeText={setDose}
                     style={styles.fieldInput}
                   />
                </View>

                {activeTab === 'purchase' && (
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <View style={styles.labelRow}>
                      <MaterialIcons name="payments" size={18} color={theme.colors.primary} />
                      <Text style={styles.label}>Prix Total (GNF)</Text>
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
             </View>

             {activeTab === 'treatment' && (
               <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="person-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('health.veterinary')}</Text>
                  </View>
                  <Input
                    placeholder="Nom du praticien"
                    value={veterinaire}
                    onChangeText={setVeterinaire}
                    style={styles.fieldInput}
                  />
               </View>
             )}
          </Card>

          <Button
            title={isEdit ? (t('common.update') || 'Mettre à jour') : (activeTab === 'treatment' ? "Enregistrer l'intervention" : "Confirmer l'achat")}
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
                <Text style={styles.scanText}>Cadrez le code-barres ou QR code</Text>
                <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setScanning(false)}>
                   <Text style={styles.cancelScanText}>Annuler</Text>
                </TouchableOpacity>
             </View>
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
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.borderRadius.m },
  activeTab: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: 'bold', color: theme.colors.textSecondary },
  activeTabText: { color: '#FFFFFF' },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600', marginLeft: 8 },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40', borderRadius: theme.borderRadius.m },
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
    borderColor: theme.colors.border + '40',
    ...theme.shadows.light,
  },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.primary, ...theme.shadows.medium },
  scannerContainer: { flex: 1, backgroundColor: 'black' },
  overlay: { flex: 1 },
  unfocusedContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  focusedRow: { flexDirection: 'row', height: 250 },
  focusedContainer: { width: 250, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'transparent', borderRadius: 20 },
  scanText: { color: 'white', fontSize: 16, marginBottom: 20, textAlign: 'center', paddingHorizontal: 20 },
  cancelScanBtn: { backgroundColor: 'rgba(255,255,255,0.3)', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
  cancelScanText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
