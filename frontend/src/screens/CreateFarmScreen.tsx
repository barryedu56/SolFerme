import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';
import { toast } from '../utils/toast';

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
      // owner requis pour la création offline (contrainte NOT NULL sur owner_id dans SQLite)
      const payload: Record<string, any> = {
        name,
        location,
        description,
        capacity: capacity ? Number(capacity) : 0,
      };
      if (userId) {
        payload.owner = userId;
      }

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
    Alert.alert(
      t('common.reactivate'),
      t('farms.reactivateFarmConfirm'),
      [
        { text: t('common.cancel'), style: "cancel" },
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
          }
        }
      ]
    );
  };

  const handleDelete = () => {
    const isAlreadyArchived = editFarm?.status === 'ARCHIVE';
    const canDeleteDefinitively = !editFarm?.has_data;

    const actionTitle = canDeleteDefinitively
      ? (isAlreadyArchived ? t('common.delete') : t('common.delete'))
      : t('common.archive');

    const actionMessage = canDeleteDefinitively
      ? t('common.deleteConfirm')
      : t('farms.archiveFarmConfirm');

    Alert.alert(
      actionTitle,
      actionMessage,
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: actionTitle,
          style: "destructive",
          onPress: async () => {
            try {
                      if (canDeleteDefinitively) {
                // Suppression définitive si pas de données
                await repositoryProvider.farm.delete(editFarm.id);
                toast.success(t('common.success'), t('farms.deleteSuccess'));
              } else {
                // Archivage obligatoire si historique existe
                await repositoryProvider.farm.archive(editFarm.id);
                toast.success(t('common.success'), t('farms.archiveSuccess'));
              }
              navigation.navigate('Farms');
            } catch (e: any) {
              const errorMsg = e.response?.data?.error || (canDeleteDefinitively ? t('farms.deleteError') : t('farms.archiveError'));
              toast.error(t('common.error'), errorMsg);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? t('farms.editFarm') : t('farms.newFarm')}</Text>
          {isEditing ? (
            <View style={{ flexDirection: 'row' }}>
              {editFarm.status === 'ARCHIVE' && (
                <TouchableOpacity onPress={handleReactivate} style={[styles.deleteBtn, { backgroundColor: theme.colors.success + '15', marginRight: 10 }]}>
                  <MaterialIcons name="unarchive" size={24} color={theme.colors.success} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <MaterialIcons
                  name={editFarm?.has_data ? "archive" : "delete-forever"}
                  size={24}
                  color={theme.colors.danger}
                />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!isEditing && (
            <View style={styles.illustrationContainer}>
               <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="egg" size={48} color={theme.colors.primary} />
               </View>
               <Text style={styles.illustrationText}>{t('farms.illustrationText')}</Text>
            </View>
          )}

          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="business" size={20} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('farms.nameLabel')}</Text>
                </View>
                <Input
                  placeholder={t('farms.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                  style={styles.fieldInput}
                />
             </View>

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="place" size={20} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('farms.locationLabel')}</Text>
                </View>
                <Input
                  placeholder={t('farms.locationPlaceholder')}
                  value={location}
                  onChangeText={setLocation}
                  style={styles.fieldInput}
                />
             </View>

             <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="phone" size={20} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('farms.phoneLabel')}</Text>
                </View>
                <Input
                  placeholder={t('farms.phonePlaceholder')}
                  value={phone}
                  onChangeText={setPhone}
                  isPhone
                  maxLength={9}
                  style={styles.fieldInput}
                />
             </View>
          </Card>

          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="straighten" size={20} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('farms.capacityLabel')}</Text>
                </View>
                <Input
                  placeholder={t('farms.capacityPlaceholder')}
                  value={capacity}
                  onChangeText={setCapacity}
                  isNumeric
                  style={styles.fieldInput}
                />
             </View>

             <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="notes" size={20} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('farms.descriptionLabel')}</Text>
                </View>
                <Input
                  placeholder={t('farms.descriptionPlaceholder')}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]}
                />
             </View>
          </Card>

          <View style={styles.infoBox}>
             <MaterialIcons name="info-outline" size={20} color={theme.colors.textSecondary} />
             <Text style={styles.infoText}>
               {isEditing ? t('farms.editInfoBox') : t('farms.newInfoBox')}
             </Text>
          </View>

          <Button
            title={isEditing ? t('farms.updateButton') : t('farms.createButton')}
            onPress={handleSave}
            loading={loading}
            style={styles.submitBtn}
          />
          {isEditing && <View style={{ height: 40 }} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.danger + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  illustrationContainer: {
    alignItems: 'center',
    marginVertical: theme.spacing.xl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
    ...theme.shadows.light,
  },
  illustrationText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  formCard: {
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
  },
  inputGroup: { marginBottom: theme.spacing.l },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    marginLeft: 8,
  },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background + '40',
    borderRadius: theme.borderRadius.m,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.xl,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 10,
    flex: 1,
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  }
});
