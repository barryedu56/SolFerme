import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { toast } from '../utils/toast';
import { BrandLogo } from '../components/BrandLogo';
import { Screen, ScreenHeader, Card, space, radius } from '../components/ui';

export const CreateFarmScreen = ({ navigation, route }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { userId } = useAuth();
  const styles = useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);

  const editFarm = route.params?.farm;
  const isEditing = !!editFarm;

  const [name, setName] = useState(editFarm?.name || '');
  const [location, setLocation] = useState(editFarm?.location || '');
  const [phone, setPhone] = useState(editFarm?.phone || '');
  const [description, setDescription] = useState(editFarm?.description || '');
  const [capacity, setCapacity] = useState(editFarm?.capacity?.toString() || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name || !location) {
      toast.error(t('common.error'), t('farms.fillRequired'));
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        name, location, description,
        capacity: capacity ? Number(capacity) : 0,
      };
      if (userId) payload.owner = userId;

      if (isEditing) {
        await repositoryProvider.farm.update(editFarm.id, payload);
        toast.success(t('common.success'), t('farms.saveSuccess'));
      } else {
        await repositoryProvider.farm.create(payload);
        toast.success(t('common.success'), t('farms.saveSuccess'));
      }
      navigation.goBack();
    } catch (error) {
      toast.error(t('common.error'), t('farms.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = () => {
    Alert.alert(t('common.reactivate'), t('farms.reactivateFarmConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.reactivate'),
        onPress: async () => {
          try {
            await repositoryProvider.farm.reactivate(editFarm.id);
            toast.success(t('common.success'), t('farms.reactivateSuccess'));
            navigation.navigate('Farms');
          } catch (e: any) {
            const errorMsg = e.response?.data?.error || t('farms.reactivateError');
            toast.error(t('common.error'), errorMsg);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    console.log('[TEST SOLFERME] FARM DELETE/ARCHIVE CLICK', editFarm);
    const isAlreadyArchived = editFarm?.status === 'ARCHIVE';
    const canDeleteDefinitively = !editFarm?.has_data;

    const actionTitle = canDeleteDefinitively
      ? (isAlreadyArchived ? t('common.delete') : t('common.delete'))
      : t('common.archive');
    const actionMessage = canDeleteDefinitively
      ? t('common.deleteConfirm')
      : t('farms.archiveFarmConfirm');

    const executeAction = async () => {
      console.log('[TEST SOLFERME] FARM DELETE/ARCHIVE CONFIRMED', { canDeleteDefinitively, isAlreadyArchived });
      try {
        if (canDeleteDefinitively) {
          await repositoryProvider.farm.delete(editFarm.id);
          toast.success(t('common.success'), t('farms.deleteSuccess'));
        } else {
          await repositoryProvider.farm.archive(editFarm.id);
          toast.success(t('common.success'), t('farms.archiveSuccess'));
        }
        navigation.navigate('Farms');
      } catch (e: any) {
        console.error('[TEST SOLFERME] FARM DELETE/ARCHIVE ERROR:', e);
        const errorMsg = e.response?.data?.error || (canDeleteDefinitively ? t('farms.deleteError') : t('farms.archiveError'));
        toast.error(t('common.error'), errorMsg);
      }
    };

    if (Platform.OS === 'web') {
      console.log('[TEST SOLFERME] FARM DELETE/ARCHIVE: web path - executing directly');
      executeAction();
      return;
    }
    Alert.alert(actionTitle, actionMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: actionTitle, style: 'destructive', onPress: executeAction },
    ]);
  };

  const Field = ({ icon, label, ...inputProps }: any) => (
    <View style={styles.inputGroup}>
      <View style={styles.labelRow}>
        <MaterialIcons name={icon} size={18} color={theme.colors.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Input {...inputProps} style={[styles.fieldInput, inputProps.style]} />
    </View>
  );

  const headerActions: any[] = isEditing
    ? [
        ...(editFarm.status === 'ARCHIVE' ? [{ icon: 'unarchive', onPress: handleReactivate, tint: '#2E7D32' }] : []),
        { icon: editFarm?.has_data ? 'archive' : 'delete-forever', onPress: handleDelete, tint: theme.colors.danger },
      ]
    : [];

  return (
    <Screen scroll width="narrow" edges={['top', 'bottom']}
      header={<ScreenHeader title={isEditing ? t('farms.editFarm') : t('farms.newFarm')} onBack={() => navigation.goBack()} actions={headerActions} />}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {!isEditing && (
          <View style={styles.illustration}>
            <BrandLogo size={76} shape="squircle" />
            <Text style={styles.illustrationText}>{t('farms.illustrationText')}</Text>
          </View>
        )}

        <Card style={styles.formCard}>
          <Field icon="business" label={t('farms.nameLabel')} placeholder={t('farms.namePlaceholder')} value={name} onChangeText={setName} />
          <Field icon="place" label={t('farms.locationLabel')} placeholder={t('farms.locationPlaceholder')} value={location} onChangeText={setLocation} />
          <View style={{ marginBottom: 0 }}>
            <Field icon="phone" label={t('farms.phoneLabel')} placeholder={t('farms.phonePlaceholder')} value={phone} onChangeText={setPhone} isPhone maxLength={9} />
          </View>
        </Card>

        <Card style={styles.formCard}>
          <Field icon="straighten" label={t('farms.capacityLabel')} placeholder={t('farms.capacityPlaceholder')} value={capacity} onChangeText={setCapacity} isNumeric />
          <View style={{ marginBottom: 0 }}>
            <Field icon="notes" label={t('farms.descriptionLabel')} placeholder={t('farms.descriptionPlaceholder')} value={description} onChangeText={setDescription} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
          </View>
        </Card>

        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.infoText}>{isEditing ? t('farms.editInfoBox') : t('farms.newInfoBox')}</Text>
        </View>

        <Button title={isEditing ? t('farms.updateButton') : t('farms.createButton')} onPress={handleSave} loading={loading} style={styles.submitBtn} />
        {isEditing && <View style={{ height: 40 }} />}
      </KeyboardAvoidingView>
    </Screen>
  );
};

const createStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  illustration: { alignItems: 'center', marginVertical: space.lg, gap: space.sm },
  illustrationText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: space.xl },
  formCard: { padding: space.lg, borderRadius: radius.lg, marginBottom: space.md },
  inputGroup: { marginBottom: space.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 13.5, color: theme.colors.textSecondary, fontWeight: '700' },
  fieldInput: { marginBottom: 0, backgroundColor: theme.colors.background + '40', borderRadius: radius.sm },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: space.md, borderRadius: radius.md, marginBottom: space.lg },
  infoText: { fontSize: 12, color: theme.colors.textSecondary, flex: 1 },
  submitBtn: { height: 54, borderRadius: radius.lg, backgroundColor: theme.colors.primary },
});
