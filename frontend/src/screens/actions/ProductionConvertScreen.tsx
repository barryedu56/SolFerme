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

export const ProductionConvertScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { lotId, lotName, production, pendingActual } = route.params || {};

  const [quantity, setQuantity] = useState('');
  const [conversionDate, setConversionDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const prodId = production?.id;
  const casiersProduits = Number(production?.casiers_produits) || 0;
  const casiersVendables = Number(production?.casiers_vendables) || 0;
  // En attente ACTUEL : si le lot a déjà des conversions, on doit déduire leur somme.
  // pendingActual est fourni par l'écran d'origine ; sinon on retombe sur l'en-attente initial.
  const nonVendables = typeof pendingActual === 'number'
    ? Math.max(0, pendingActual)
    : casiersProduits - casiersVendables;

  const farmId = production?.farm_id || production?.farm;

  const handleConvert = async () => {
    if (loading) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t('common.error'), t('conversion.invalidQuantity'));
      return;
    }

    if (qty > nonVendables) {
      Alert.alert(t('common.error'),
        t('conversion.stockInsufficient', { qty: String(qty), max: String(nonVendables) }));
      return;
    }

    if (!conversionDate) {
      Alert.alert(t('common.error'), t('common.chooseDate'));
      return;
    }

    setLoading(true);
    try {
      await repositoryProvider.api.post('/egg-conversions/', {
        production: prodId,
        lot: lotId,
        farm: farmId,
        quantity: qty,
        conversion_date: conversionDate,
        reason: reason || '',
        status: 'ACTIF',
      });
      Alert.alert(t('common.success'), t('conversion.success'));
      navigation.goBack();
    } catch (error: any) {
      const serverError = error?.response?.data;
      const firstError = serverError && typeof serverError === 'object'
        ? Object.values(serverError).flat()[0]
        : null;
      Alert.alert(t('common.error'), firstError || error?.message || t('conversion.error'));
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  const formattedDate = useMemo(() => {
    if (!production?.date) return '';
    return new Date(production.date + 'T00:00:00').toLocaleDateString(t('common.dateLocale'));
  }, [production?.date, t]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('conversion.newTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Carte production */}
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
        </Card>

        {/* Formulaire de conversion */}
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
            Max: {nonVendables > 0 ? `${nonVendables} ${t('production.tray', { count: nonVendables })}` : '0'}
          </Text>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('common.date')}</Text>
          <DatePicker
            label={t('common.date')}
            value={conversionDate}
            onChange={setConversionDate}
          />
        </Card>

        <Button
          title={t('conversion.submit')}
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