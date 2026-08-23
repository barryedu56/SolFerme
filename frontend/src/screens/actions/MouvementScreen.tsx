import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { toast } from '../../utils/toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { getErrorMessage } from '../../utils/errors';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export const ActionMouvementScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lotId, lotName, lotPurchaseDate, item } = route.params || {};
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0]);
  const [type, setType] = useState(item?.type || 'MORT'); // MORT, MALADE, GUERI
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '');
  const [reason, setReason] = useState(item?.reason || '');
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(!!item);

  const handleSubmit = async () => {
    if (loading) return;
    if (!date || !type || !quantity) {
      toast.error(
        t('common.error'),
        t('movement.fillRequired') || 'Veuillez remplir les champs obligatoires (Date, Type, Quantité).'
      );
      return;
    }

    if (lotPurchaseDate && date < lotPurchaseDate) {
      toast.error(t('common.error'), t('movement.dateBeforeLotError'));
      return;
    }
    
    const uppercaseType = type.toUpperCase();
    if (!['MORT', 'MALADE', 'GUERI', 'AJOUT'].includes(uppercaseType)) {
      toast.error(t('common.error'), t('movement.errorType'));
      return;
    }

    setLoading(true);
    const payload = {
      lot: lotId,
      date,
      type: uppercaseType,
      quantity: parseInt(quantity),
      reason,
    };

    try {
      if (isEdit) {
        await repositoryProvider.api.put(`/movements/${item.id}/`, payload);
        toast.success(t('common.success'), t('movement.updated'));
      } else {
        await repositoryProvider.api.post('/movements/', payload);
        toast.success(t('common.success'), t('movement.success'));
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(
        t('common.actionImpossible'),
        getErrorMessage(e, t('common.errorSave'))
      );
    } finally {
      setLoading(false);
    }
  };

  const types = useMemo(() => [
    { id: 'MORT', label: t('movement.types.mort'), icon: 'sentiment-very-dissatisfied', color: '#D32F2F' },
    { id: 'MALADE', label: t('movement.types.malade'), icon: 'sick', color: '#F57C00' },
    { id: 'GUERI', label: t('movement.types.gueri'), icon: 'health-and-safety', color: '#388E3C' },
    { id: 'AJOUT', label: t('movement.types.ajout'), icon: 'add-circle', color: '#1565C0' },
  ], [t]);

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
            {isEdit ? t('movement.edit') : t('movement.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          <Card style={styles.lotInfoCard}>
            <View style={styles.lotInfoContent}>
              <View style={[styles.lotIconContainer, { backgroundColor: '#F8BBD0' }]}>
                <MaterialIcons name="sync-alt" size={24} color="#C2185B" />
              </View>
              <View style={styles.lotTexts}>
                <Text style={styles.lotNameText}>{t('farms.batches')}: {lotName}</Text>
                <Text style={styles.lotDetailText}>{t('movement.updateEffectives')}</Text>
              </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('movement.type')}</Text>
          <View style={styles.typeSelector}>
            {types.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.typeButton,
                  type === t.id && { borderColor: t.color, backgroundColor: t.color + '15', borderWidth: 1 }
                ]}
                onPress={() => setType(t.id)}
              >
                <MaterialIcons name={t.icon as any} size={24} color={type === t.id ? t.color : theme.colors.textSecondary} />
                <Text style={[
                  styles.typeLabel,
                  type === t.id && { color: t.color, fontWeight: 'bold' }
                ]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Card style={styles.formCard}>
             <DatePicker
               label={t('movement.date')}
               value={date}
               onChange={setDate}
             />

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="reorder" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('movement.quantity')}</Text>
                </View>
                <Input
                  placeholder="0"
                  value={quantity}
                  onChangeText={setQuantity}
                  isNumeric
                  style={[styles.fieldInput, { fontSize: 20, fontWeight: 'bold', textAlign: 'center' }]}
                />
             </View>

             <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="description" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('movement.reason')}</Text>
                </View>
                <Input
                  placeholder={t('movement.placeholderReason')}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                  style={[styles.fieldInput, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
                />
             </View>
          </Card>

          <Button
            title={isEdit ? t('common.update') : t('movement.save')}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: { maxWidth: 680, width: '100%', alignSelf: 'center' },
  lotInfoCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  lotInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lotIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  lotTexts: {
    flex: 1,
  },
  lotNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  lotDetailText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
    textTransform: 'uppercase'
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.l,
  },
  typeButton: {
    flex: 1,
    height: 80,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  typeLabel: {
    fontSize: 12,
    marginTop: 6,
    color: theme.colors.textSecondary,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '900',
    marginLeft: 8,
    textTransform: 'uppercase'
  },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    ...theme.shadows.medium,
  }
});