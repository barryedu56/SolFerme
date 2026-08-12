import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, FlatList } from 'react-native';
import { toast } from '../../utils/toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { getErrorMessage } from '../../utils/errors';

export const ActionAlimentationScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lotId, lotName, farmId, lotPurchaseDate, item, activeTab: initialTab } = route.params || {};
  const [date, setDate] = useState(item?.date || item?.purchase_date || new Date().toISOString().split('T')[0]);
  const [feedType, setFeedType] = useState(item?.feed_type || '');
  const [quantity, setQuantity] = useState(item?.quantity_kg?.toString() || '');
  const [bags, setBags] = useState(item?.bags_count?.toString() || '');
  const [cost, setCost] = useState(item?.total_price?.toString() || item?.cost?.toString() || '');
  const [supplier, setSupplier] = useState(item?.supplier || '');  // Correction: champ supplier ajouté pour achat
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'distribution' | 'purchase' | 'preparation'>(
    initialTab === 'purchase' ? 'purchase' : 'distribution'
  );
  const [preparedFeeds, setPreparedFeeds] = useState<any[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    // Les employés n'ont accès qu'à la distribution et la préparation.
    // Les achats sont réservés aux propriétaires (backend IsProprietaire).
    if (userRole === 'EMPLOYE' && activeTab === 'purchase') {
      setActiveTab('distribution');
    }
    fetchPreparedFeeds();
  }, [userRole]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchPreparedFeeds();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchPreparedFeeds = async () => {
    try {
      const [invRes, prepRes] = await Promise.all([
        repositoryProvider.api.get<any>('/prepared-feed-inventory/', { params: { lot: lotId } }).catch(() => ({ data: [] })),
        repositoryProvider.api.get<any>('/feed-preparations/', { params: { lot: lotId } }).catch(() => ({ data: [] })),
      ]);
      const invData: any[] = Array.isArray(invRes.data) ? invRes.data : (invRes.data?.results || []);
      const prepData: any[] = Array.isArray(prepRes.data) ? prepRes.data : (prepRes.data?.results || []);

      // Fusionner : les entrées d'inventaire priment (elles ont quantity_kg),
      // les préparations servent de fallback (avec quantity_kg = 0 si absentes de l'inventaire)
      const invNames = new Set(invData.map((f: any) => f.feed_name));
      const fallbackFromPreps = prepData
        .filter((p: any) => p.feed_name && !invNames.has(p.feed_name))
        .map((p: any) => ({ feed_name: p.feed_name, quantity_kg: 0, id: p.id }));

      setPreparedFeeds([...invData, ...fallbackFromPreps]);
    } catch (e) {
      console.error("Error fetching prepared feeds", e);
    }
  };

  const selectPreparedFeed = (name: string) => {
    setFeedType(name);
    setIsModalVisible(false);
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (activeTab === 'distribution') {
      await handleDistribution();
    } else {
      if (userRole === 'EMPLOYE') {
        toast.error(t('common.error'), t('common.actionForbidden'));
        return;
      }
      await handlePurchase();
    }
  };

  const handleDistribution = async () => {
    if (!date || !quantity || !feedType) {
      toast.error(t('common.error'), t('feed.fillRequired'));
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      toast.error(t('common.error'), t('feed.dateBeforeLotError'));
      return;
    }

    // Validation: vérifier que le stock d'aliment préparé est suffisant
    // Ne bloquer que si le stock est connu et positif mais insuffisant.
    // Si stock = 0 (inventaire pas encore recalculé en mode offline), on laisse
    // le backend valider lors de la synchronisation.
    const selectedFeed = preparedFeeds.find((f: any) => f.feed_name === feedType);
    let availableStock = selectedFeed?.quantity_kg || 0;
    
    if (isEdit && item?.feed_type === feedType) {
      availableStock += parseFloat(item?.quantity_kg || '0');
    }

    const requestedQty = parseFloat(quantity);
    if (selectedFeed && availableStock > 0 && availableStock < requestedQty) {
      toast.error(
        t('common.error'),
        `Stock de "${feedType}" insuffisant. Disponible: ${availableStock} kg, requis: ${requestedQty} kg.`
      );
      return;
    }

    setLoading(true);
    const payload = {
      lot: lotId,
      date,
      feed_type: feedType,
      quantity_kg: parseFloat(quantity),
      bags_count: bags ? parseInt(bags) : 0,
      cost: 0,
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/feeds/${item.id}/`, payload);
        toast.success(t('common.success'), t('feed.updated'));
      } else {
        await repositoryProvider.api.post('/feeds/', payload);
        toast.success(t('common.success'), t('feed.success'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.actionImpossible'), getErrorMessage(e, t('feed.saveError')));
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!date || !quantity || !feedType || !cost) {
      toast.error(t('common.error'), t('feed.fillRequiredPurchase'));
      return;
    }

    setLoading(true);
    const payload = {
      feed_type: feedType,
      quantity_kg: parseFloat(quantity),
      total_price: parseFloat(cost),
      date,
      lot: lotId,
      farm: farmId,
      supplier: supplier || undefined,  // Correction: champ supplier ajouté
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/feed-purchases/${item.id}/`, payload);
        toast.success(t('common.success'), t('feed.purchaseUpdated'));
      } else {
        await repositoryProvider.api.post('/feed-purchases/', payload);
        toast.success(t('common.success'), t('feed.purchaseSuccess'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.actionImpossible'), getErrorMessage(e, t('feed.purchaseError')));
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
            {isEdit ? t('common.edit') : t('feed.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.lotInfoCard}>
            <View style={styles.lotInfoContent}>
              <View style={[styles.lotIconContainer, { backgroundColor: '#FFF3E0' }]}>
                <MaterialIcons name="grass" size={24} color="#E65100" />
              </View>
              <View style={styles.lotTexts}>
                <Text style={styles.lotNameText}>{t('lots.lot')}: {lotName}</Text>
                <DatePicker value={date} onChange={setDate} />
              </View>
            </View>
          </Card>

          {!isEdit && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'distribution' && styles.activeTab]}
                onPress={() => setActiveTab('distribution')}
              >
                <Text style={[styles.tabText, activeTab === 'distribution' && styles.activeTabText]}>{t('feed.tabDistribution')}</Text>
              </TouchableOpacity>
              {userRole !== 'EMPLOYE' && (
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'purchase' && styles.activeTab]}
                  onPress={() => setActiveTab('purchase')}
                >
                  <Text style={[styles.tabText, activeTab === 'purchase' && styles.activeTabText]}>{t('feed.tabPurchase')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.tab, activeTab === 'preparation' && styles.activeTab]}
                onPress={() => {
                   navigation.navigate('ActionPreparation', { farmId, lotId });
                }}
              >
                <Text style={[styles.tabText, activeTab === 'preparation' && styles.activeTabText]}>{t('feed.tabPreparation')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionTitle}>
            {t(activeTab === 'distribution' ? 'feed.distributionDetails' : 'feed.purchaseDetails')}
          </Text>

          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="restaurant" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('feed.type')}</Text>
                </View>
                {activeTab === 'distribution' ? (
                  <>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => setIsModalVisible(true)}
                  >
                    <Text style={[styles.selectorText, !feedType && { color: theme.colors.textSecondary }]}>
                      {feedType || t('feed.selectPrepared')}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  {feedType && (
                    <View style={styles.stockInfo}>
                      <MaterialIcons name="inventory-2" size={16} color={theme.colors.success} />
                      <Text style={styles.stockText}>
                        Stock: {(preparedFeeds.find((f: any) => f.feed_name === feedType)?.quantity_kg || 0) + (isEdit && item?.feed_type === feedType ? parseFloat(item?.quantity_kg || '0') : 0)} kg
                      </Text>
                    </View>
                  )}
                  </>
                ) : (
                  <Input
                    placeholder={t('feed.placeholderType')}
                    value={feedType}
                    onChangeText={setFeedType}
                    style={styles.fieldInput}
                  />
                )}
             </View>

             <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                   <View style={styles.labelRow}>
                     <MaterialIcons name="scale" size={18} color={theme.colors.primary} />
                     <Text style={styles.label}>{t('feed.quantity')}</Text>
                   </View>
                   <Input
                     placeholder="0"
                     value={quantity}
                     onChangeText={setQuantity}
                     isNumeric
                     style={[styles.fieldInput, { textAlign: 'center', fontSize: 18 }]}
                   />
                </View>
                {activeTab === 'distribution' ? (
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <View style={styles.labelRow}>
                      <MaterialIcons name="inventory-2" size={18} color={theme.colors.primary} />
                      <Text style={styles.label}>{t('feed.bags')}</Text>
                    </View>
                    <Input
                      placeholder="0"
                      value={bags}
                      onChangeText={setBags}
                      isNumeric
                      style={[styles.fieldInput, { textAlign: 'center', fontSize: 18 }]}
                    />
                  </View>
                ) : (
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                    <View style={styles.labelRow}>
                      <MaterialIcons name="payments" size={18} color={theme.colors.primary} />
                      <Text style={styles.label}>{t('feed.totalPrice')}</Text>
                    </View>
                    <Input
                      placeholder="0"
                      value={cost}
                      onChangeText={setCost}
                      isNumeric
                      style={[styles.fieldInput, { textAlign: 'center', fontSize: 18 }]}
                    />
                  </View>
                )}
             </View>

             {/* Correction: champ fournisseur ajouté pour l'onglet achat */}
             {activeTab === 'purchase' && (
               <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="local-shipping" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('feed.supplier') || 'Fournisseur'} ({t('common.unknown').toLowerCase()})</Text>
                  </View>
                  <Input
                    placeholder={t('feed.supplierPlaceholder') || 'Nom du fournisseur'}
                    value={supplier}
                    onChangeText={setSupplier}
                    style={styles.fieldInput}
                  />
               </View>
             )}
          </Card>

          {activeTab === 'distribution' && (
            <View style={styles.infoBox}>
              <MaterialIcons name="info-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.infoBoxText}>{t('feed.waterInfo')}</Text>
            </View>
          )}

          <Button
            title={isEdit ? t('common.update') : (activeTab === 'distribution' ? t('feed.submitDistribution') : t('feed.submitPurchase'))}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>

        <Modal visible={isModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('feed.selectPrepared')}</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={preparedFeeds}
                keyExtractor={(item, index) => (item.id ?? index).toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.itemRow}
                    onPress={() => selectPreparedFeed(item.feed_name)}
                  >
                    <Text style={styles.itemName}>{item.feed_name}</Text>
                    <Text style={[styles.itemStock, { color: item.quantity_kg > 0 ? theme.colors.success : theme.colors.warning }]}>
                      {item.quantity_kg} kg
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>{t('common.noData')}</Text>}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
  label: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '900', marginLeft: 8, textTransform: 'uppercase' },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40', borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoBoxText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 10, flex: 1 },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.primary, ...theme.shadows.medium, borderWidth: 1, borderColor: theme.colors.border },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.m,
    padding: 12,
    backgroundColor: theme.colors.background + '40',
    height: 50,
  },
  selectorText: { fontSize: 16, color: theme.colors.text },
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
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  itemStock: { fontSize: 14, color: theme.colors.textSecondary },
  emptyText: { textAlign: 'center', marginTop: 20, color: theme.colors.textSecondary }
});