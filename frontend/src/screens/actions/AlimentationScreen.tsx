import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { addToSyncQueue } from '../../utils/offlineStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ActionAlimentationScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { lotId, lotName, farmId, lotPurchaseDate, item, activeTab: initialTab } = route.params || {};
  const [date, setDate] = useState(item?.date || item?.purchase_date || new Date().toISOString().split('T')[0]);
  const [feedType, setFeedType] = useState(item?.feed_type || '');
  const [quantity, setQuantity] = useState(item?.quantity_kg?.toString() || '');
  const [bags, setBags] = useState(item?.bags_count?.toString() || '');
  const [cost, setCost] = useState(item?.total_price?.toString() || item?.cost?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'distribution' | 'purchase'>(initialTab || 'distribution');

  useEffect(() => {
    AsyncStorage.getItem('user_role').then(role => {
      setUserRole(role);
      // Si c'est un employé, il ne peut faire que de la distribution
      if (role === 'EMPLOYE') {
        setActiveTab('distribution');
      }
    });
  }, []);

  const handleSubmit = async () => {
    if (activeTab === 'distribution') {
      await handleDistribution();
    } else {
      await handlePurchase();
    }
  };

  const handleDistribution = async () => {
    if (!date || !quantity || !feedType) {
      Alert.alert(t('common.error'), t('feed.fillRequired') || 'Veuillez remplir les champs obligatoires (Type, Quantité).');
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
      feed_type: feedType,
      quantity_kg: parseFloat(quantity),
      bags_count: bags ? parseInt(bags) : 0,
      cost: 0,
    };

    try {
      if (isEdit) {
        await apiClient.put(`/feeds/${item.id}/`, payload);
        Alert.alert(t('common.success'), t('feed.updated') || 'Distribution mise à jour !');
      } else {
        await apiClient.post('/feeds/', payload);
        Alert.alert(t('common.success'), t('feed.success') || 'Distribution enregistrée !');
      }
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        await addToSyncQueue('POST', '/feeds/', payload);
        Alert.alert(t('common.offline'), t('feed.offlineSaved') || 'Enregistré localement.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert(t('common.error'), "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!date || !quantity || !feedType || !cost) {
      Alert.alert(t('common.error'), 'Veuillez remplir tous les champs (Type, Quantité, Prix total).');
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
    };

    try {
      if (isEdit) {
        await apiClient.put(`/feed-purchases/${item.id}/`, payload);
        Alert.alert(t('common.success'), 'Achat aliment mis à jour');
      } else {
        await apiClient.post('/feed-purchases/', payload);
        Alert.alert(t('common.success'), 'Achat aliment enregistré (Stock + Finance mis à jour)');
      }
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        await addToSyncQueue('POST', '/feed-purchases/', payload);
        Alert.alert(t('common.offline'), 'Achat enregistré localement.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
            {isEdit ? 'Modifier' : t('feed.title') || 'Alimentation'}
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
                <Text style={styles.lotNameText}>{t('farms.batches')}: {lotName}</Text>
                <DatePicker value={date} onChange={setDate} />
              </View>
            </View>
          </Card>

          {userRole !== 'EMPLOYE' && !isEdit && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'distribution' && styles.activeTab]}
                onPress={() => setActiveTab('distribution')}
              >
                <Text style={[styles.tabText, activeTab === 'distribution' && styles.activeTabText]}>DISTRIBUTION</Text>
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
            {activeTab === 'distribution' ? (t('feed.composition') || 'Distribution') : 'Détails de l\'achat'}
          </Text>

          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="restaurant" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('feed.type')}</Text>
                </View>
                <Input
                  placeholder="Ex: Ponte 1, Croissance..."
                  value={feedType}
                  onChangeText={setFeedType}
                  style={styles.fieldInput}
                />
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
                      <Text style={styles.label}>Prix Total (GNF)</Text>
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
          </Card>

          {activeTab === 'distribution' && (
            <View style={styles.infoBox}>
              <MaterialIcons name="info-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.infoBoxText}>{t('feed.waterInfo')}</Text>
            </View>
          )}

          <Button
            title={isEdit ? (t('common.update') || 'Mettre à jour') : (activeTab === 'distribution' ? "Valider la distribution" : "Confirmer l'achat")}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  infoBoxText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 10, flex: 1 },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.primary, ...theme.shadows.medium }
});

