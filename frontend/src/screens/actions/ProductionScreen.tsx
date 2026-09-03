import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { toast } from '../../utils/toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { repositoryProvider } from '../../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatNumber } from '../../utils/formatters';
import { getErrorMessage } from '../../utils/errors';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const OEUFS_PAR_CASIER = 30;

export const ActionProductionScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lotId, lotName, lotPurchaseDate, item } = route.params || {};
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [casiersProdu, setCasiersProdu] = useState(item?.casiers_produits?.toString() || '');
  const [oeufssCasses, setOeufsCasses] = useState(item?.oeufs_casses?.toString() || '0');
  const [casiersVendables, setCasiersVendables] = useState(item?.casiers_vendables?.toString() || '');
  const [note, setNote] = useState(item?.note || '');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);

  useEffect(() => {
    AsyncStorage.getItem('user_name').then(name => {
      if (name) setUserName(name);
    });
  }, []);

  const totalOeufs = (parseInt(casiersProdu.toString().replace(/\s/g, '')) || 0) * OEUFS_PAR_CASIER;

  const handleSubmit = async () => {
    if (loading) return;
    if (!date || !casiersProdu) {
      toast.error(t('common.error'), t('production.fillRequired'));
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      toast.error(t('common.error'), t('production.dateBeforeLotError'));
      return;
    }

    const cleanCasiersProdu = casiersProdu.toString().replace(/\s/g, '');
    const cleanCasiersVendables = casiersVendables.toString().replace(/\s/g, '');
    const cleanOeufsCasses = oeufssCasses.toString().replace(/\s/g, '');

    const cp = parseInt(cleanCasiersProdu) || 0;
    const cv = cleanCasiersVendables ? (parseInt(cleanCasiersVendables) || 0) : cp;
    if (cv > cp) {
      toast.error(t('common.error'), t('production.errorVendables'));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        lot: lotId,
        date,
        casiers_produits: cp,
        oeufs_casses: parseInt(cleanOeufsCasses) || 0,
        casiers_vendables: cv,
        note,
      };

      if (isEdit) {
        await repositoryProvider.api.put(`/productions/${item.id}/`, payload);
        toast.success(t('common.success'), t('production.updated'));
      } else {
        await repositoryProvider.api.post('/productions/', payload);
        toast.success(t('common.success'), t('production.saved'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(t('common.actionImpossible'), getErrorMessage(e, t('production.saveError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? t('production.edit') : t('production.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          <Card style={styles.lotInfoCard}>
            <View style={styles.lotInfoContent}>
              <View style={styles.lotIconContainer}>
                <MaterialIcons name="inventory-2" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.lotTexts}>
                <Text style={styles.lotNameText}>{t('lots.lot')}: {lotName}</Text>
                <Text style={styles.lotDetailText}>1 {t('production.tray')} = {OEUFS_PAR_CASIER} {t('production.eggs')}</Text>
              </View>
            </View>
          </Card>

          {/* Total en temps réel */}
          <Card style={[styles.totalCard, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.totalCardLabel}>{t('production.totalProduced')}</Text>
            <Text style={styles.totalCardValue}>{formatNumber(parseInt(casiersProdu.toString().replace(/\s/g, '')) || 0)} {t('production.trays')}</Text>
            <Text style={styles.totalCardSub}>= {formatNumber(totalOeufs)} {t('production.eggs')}</Text>
          </Card>

          <Text style={styles.sectionTitle}>{t('production.collectDate')}</Text>
          <Card style={styles.formCard}>
            <DatePicker
              label={t('common.date')}
              value={date}
              onChange={setDate}
            />
          </Card>

          <Text style={styles.sectionTitle}>{t('production.quantities')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={theme.colors.success} />
                <Text style={styles.label}>{t('production.traysProduced')} *</Text>
              </View>
              <Input
                value={casiersProdu}
                onChangeText={(val) => {
                  setCasiersProdu(val);
                }}
                isNumeric
                placeholder="0"
                style={[styles.fieldInput, { fontSize: 20, fontWeight: 'bold', textAlign: 'center' }]}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="storefront" size={18} color={theme.colors.info || '#2196F3'} />
                  <Text style={styles.label}>{t('production.traysVendables')}</Text>
                </View>
                <Input
                  value={casiersVendables}
                  onChangeText={setCasiersVendables}
                  isNumeric
                  placeholder={casiersProdu || "0"}
                  style={[styles.fieldInput, { textAlign: 'center' }]}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="block" size={18} color={theme.colors.danger} />
                  <Text style={styles.label}>{t('production.traysNonVendables')}</Text>
                </View>
                <View style={[styles.fieldInput, styles.readOnlyInput]}>
                   <Text style={styles.readOnlyText}>
                     {formatNumber(Math.max(0, (parseInt(casiersProdu.toString().replace(/\s/g, '')) || 0) - (parseInt(casiersVendables.toString().replace(/\s/g, '')) || (parseInt(casiersProdu.toString().replace(/\s/g, '')) || 0))))}
                   </Text>
                </View>
              </View>
            </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="error-outline" size={18} color={theme.colors.danger} />
                  <Text style={styles.label}>{t('production.brokenEggs')}</Text>
                </View>
                <Input
                  value={oeufssCasses}
                  onChangeText={setOeufsCasses}
                  isNumeric
                  placeholder="0"
                  style={[styles.fieldInput, { textAlign: 'center' }]}
                />
                <Text style={{ fontSize: 10, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                  ≈ {formatNumber((parseInt(oeufssCasses.toString().replace(/\s/g, '')) || 0) / 30)} {t('production.trays')}
                </Text>
              </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('production.note')}</Text>
          <Card style={styles.formCard}>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t('production.observation')}
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: 'top' }}
            />
          </Card>

          {userName ? (
            <Text style={styles.responsable}>{t('production.responsible')} : {userName}</Text>
          ) : null}

          <Button
            title={isEdit ? t('common.update') : t('production.save')}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: theme.colors.surface, ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  lotInfoCard: {
    padding: theme.spacing.m, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m, borderWidth: 0.8, borderColor: theme.colors.border,
  },
  lotInfoContent: { flexDirection: 'row', alignItems: 'center' },
  lotIconContainer: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: theme.colors.background,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m,
  },
  lotTexts: { flex: 1 },
  lotNameText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  lotDetailText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  totalCard: {
    padding: theme.spacing.l, borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l, alignItems: 'center', ...theme.shadows.medium,
  },
  totalCardLabel: { fontSize: 12, color: '#000000', opacity: 0.8, textTransform: 'uppercase', fontWeight: '700' },
  totalCardValue: { fontSize: 36, fontWeight: '900', color: '#000000', marginTop: 4 },
  totalCardSub: { fontSize: 14, color: '#000000', opacity: 0.7, marginTop: 4 },
  sectionTitle: {
    fontSize: 16, fontWeight: 'bold', color: theme.colors.text,
    marginBottom: theme.spacing.m, marginTop: theme.spacing.s,
  },
  formCard: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.l },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600', marginLeft: 8 },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40' },
  row: { flexDirection: 'row', alignItems: 'center' },
  readOnlyInput: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 50,
    borderRadius: theme.borderRadius.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background + '10'
  },
  readOnlyText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.textSecondary },
  responsable: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.m },
  submitBtn: {
    height: 56, borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary, ...theme.shadows.medium,
  },
});