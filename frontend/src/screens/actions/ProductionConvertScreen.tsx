import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

export const ProductionConvertScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  // item = EggConversion existante (mode edition), production = Production parente, pendingActual = en-attente calcule
  const { lotId, lotName, production, pendingActual, item } = route.params || {};

  const isEdit = !!item;

  const [quantity, setQuantity] = useState(isEdit ? String(item.quantity || '') : '');
  const [conversionDate, setConversionDate] = useState(
    isEdit ? (item.conversion_date || new Date().toISOString().split('T')[0])
           : new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState(isEdit ? (item.reason || '') : '');
  const [loading, setLoading] = useState(false);

  const productionData = production || item?.production_data;
  const prodId = productionData?.id || item?.production;
  const casiersProduits = Number(productionData?.casiers_produits) || 0;
  const casiersVendables = Number(productionData?.casiers_vendables) || 0;

  const currentItemQty = isEdit ? (Number(item.quantity) || 0) : 0;
  const baseNonVendables = typeof pendingActual === 'number'
    ? Math.max(0, pendingActual)
    : casiersProduits - casiersVendables;
  const nonVendables = isEdit ? baseNonVendables + currentItemQty : baseNonVendables;

  const farmId = productionData?.farm_id || productionData?.farm || item?.farm;

  const handleConvert = async () => {
    if (loading) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      const msg = t('conversion.invalidQuantity');
      if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
      else { Alert.alert(t('common.error'), msg); }
      return;
    }

    if (qty > nonVendables) {
      const msg = `Stock insuffisant. Max disponible : ${nonVendables} casier(s).`;
      if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
      else { Alert.alert(t('common.error'), msg); }
      return;
    }

    if (!conversionDate) {
      const msg = t('common.chooseDate');
      if (Platform.OS === 'web') { toast.error(t('common.error'), msg); }
      else { Alert.alert(t('common.error'), msg); }
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/egg-conversions/${item.id}/`, {
          production: prodId,
          lot: lotId || item.lot,
          farm: farmId,
          quantity: qty,
          conversion_date: conversionDate,
          reason: reason || '',
        });
        const successMsg = `Conversion modifiee : ${qty} casier(s) mis a jour.`;
        if (Platform.OS === 'web') { toast.success(t('common.success'), successMsg); }
        else { Alert.alert(t('common.success'), successMsg); }
      } else {
        await repositoryProvider.api.post('/egg-conversions/', {
          production: prodId,
          lot: lotId,
          farm: farmId,
          quantity: qty,
          conversion_date: conversionDate,
          reason: reason || '',
          status: 'ACTIF',
        });
        if (Platform.OS === 'web') { toast.success(t('common.success'), t('conversion.success')); }
        else { Alert.alert(t('common.success'), t('conversion.success')); }
      }
      navigation.goBack();
    } catch (error: any) {
      const errorMsg = getErrorMessage(error, t('conversion.error') || 'Erreur lors de la conversion');
      if (Platform.OS === 'web') { toast.error(t('common.error'), errorMsg); }
      else { Alert.alert(t('common.error'), errorMsg); }
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  const formattedDate = useMemo(() => {
    const d = productionData?.date;
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString(t('common.dateLocale'));
  }, [productionData?.date, t]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEdit ? 'Modifier la Conversion' : t('conversion.newTitle')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}>
        <Card style={styles.infoCard}>
          <Text style={styles.infoLabel}>
            {t('production.infoDate', { date: formattedDate })}
          </Text>
          {lotName ? (
            <Text style={[styles.infoLabel, { marginTop: -4, fontSize: 12, fontStyle: 'italic' }]}>
              Lot: {lotName}
            </Text>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{casiersProduits}</Text>
              <Text style={styles.statLabel}>{t('production.stats.produced')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>{casiersVendables}</Text>
              <Text style={styles.statLabel}>{t('production.stats.salable')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.warning }]}>{nonVendables}</Text>
              <Text style={styles.statLabel}>{t('production.stats.nonSalable')}</Text>
            </View>
          </View>
          {isEdit && (
            <Text style={[styles.infoLabel, { marginTop: 8, fontSize: 12, color: theme.colors.primary }]}>
              {`Modification — quantite actuelle : ${currentItemQty} casier(s) (inclus dans le stock disponible)`}
            </Text>
          )}
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>{t('conversion.quantity')}</Text>
          <Input
            value={quantity}
            onChangeText={setQuantity}
            isNumeric
            placeholder={t('production.trayPlaceholder')}
            style={styles.input}
          />
          <Text style={styles.hint}>
            {t('production.convertHint')}
            {'\n'}
            {`Max disponible : ${nonVendables > 0 ? nonVendables + ' ' + t('production.tray', { count: nonVendables }) : '0'}`}
          </Text>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('common.date')}</Text>
          <DatePicker
            label={t('common.date')}
            value={conversionDate}
            onChange={setConversionDate}
          />
        </Card>

        <Button
          title={isEdit ? t('common.update') : t('conversion.submit')}
          onPress={handleConvert}
          loading={loading}
          style={styles.submitBtn}
          disabled={!quantity || parseInt(quantity) <= 0 || !conversionDate}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: Platform.OS === 'ios' ? 0 : theme.spacing.l,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  infoCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l, borderWidth: 0.8, borderColor: theme.colors.border },
  infoLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.m, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
  formCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l, borderWidth: 0.8, borderColor: theme.colors.border },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.s },
  input: { fontSize: 20, textAlign: 'center', fontWeight: 'bold' },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: theme.spacing.s, textAlign: 'center' },
  submitBtn: { marginTop: theme.spacing.m },
});