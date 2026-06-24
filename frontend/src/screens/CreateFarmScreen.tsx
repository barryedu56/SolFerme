import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';

export const CreateFarmScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
      Alert.alert(t('common.error'), t('farms.fillRequired'));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        location,
        phone,
        description,
        capacity: capacity ? parseInt(capacity) : 0,
      };

      if (isEditing) {
        await apiClient.put(`/farms/${editFarm.id}/`, payload);
        Alert.alert(t('common.success'), t('farms.saveSuccess'));
      } else {
        await apiClient.post('/farms/', payload);
        Alert.alert(t('common.success'), t('farms.saveSuccess'));
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('common.error'), t('farms.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('common.delete'),
      t('farms.deleteFarmConfirm'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              await apiClient.delete(`/farms/${editFarm.id}/`);
              Alert.alert(t('common.success'), t('farms.deleteSuccess'));
              navigation.navigate('Farms');
            } catch (e) {
              Alert.alert(t('common.error'), t('farms.deleteError'));
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
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <MaterialIcons name="delete-outline" size={24} color={theme.colors.danger} />
            </TouchableOpacity>
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
                  keyboardType="phone-pad"
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

const createStyles = (theme: any) => StyleSheet.create({
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
    backgroundColor: theme.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
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
