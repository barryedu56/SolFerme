import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../context/ThemeContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { addToSyncQueue } from '../../utils/offlineStorage';
import { useTranslation } from '../../context/LanguageContext';

export const ActionEtatPoulesScreen = ({ route, navigation }: any) => {
  const { lotId, lotName } = route.params || { lotId: 1, lotName: 'Lot (B)' };
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [deadCount, setDeadCount] = useState('0');
  const [sickCount, setSickCount] = useState('0');
  const [suspectedCause, setSuspectedCause] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const payload = {
      lot: lotId,
      type: 'MORT',
      quantity: parseInt(deadCount),
      description: suspectedCause || t('movement.placeholderReason'),
      date: new Date().toISOString().split('T')[0],
    };

    setLoading(true);
    try {
      if (parseInt(deadCount) > 0) {
        await apiClient.post('/movements/', payload);
      }
      Alert.alert(t('common.success'), t('movement.success'));
      navigation.goBack();
    } catch (e: any) {
      if (!e.response) {
        if (parseInt(deadCount) > 0) {
          await addToSyncQueue('POST', '/movements/', payload);
        }
        Alert.alert(t('common.offline'), t('movement.offlineSaved'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert(t('common.error'), t('movement.fillRequired')); // Using generic for now
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('movement.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoTexts}>
              <Text style={styles.infoTitle}>{t('movement.updateEffectives')}</Text>
              <Text style={styles.infoSubtitle}>{lotName} • {t('common.date')}</Text>
            </View>
            <View style={styles.iconCircle}>
              <MaterialIcons name="assignment-turned-in" size={24} color={theme.colors.primary} />
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>{t('movement.reason')}</Text>

        <Card style={styles.formCard}>
           <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="person-off" size={18} color={theme.colors.danger} />
                <Text style={styles.label}>{t('movement.types.mort')}</Text>
              </View>
              <Input
                value={deadCount}
                onChangeText={setDeadCount}
                keyboardType="numeric"
                placeholder="0"
                style={[styles.fieldInput, { fontSize: 20, color: theme.colors.danger, fontWeight: 'bold', textAlign: 'center' }]}
              />
           </View>

           <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="medical-information" size={18} color={theme.colors.warning} />
                <Text style={styles.label}>{t('movement.types.malade')}</Text>
              </View>
              <Input
                value={sickCount}
                onChangeText={setSickCount}
                keyboardType="numeric"
                placeholder="0"
                style={[styles.fieldInput, { fontSize: 20, color: theme.colors.warning, fontWeight: 'bold', textAlign: 'center' }]}
              />
           </View>

           <View style={[styles.inputGroup, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <MaterialIcons name="chat-bubble-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.label}>{t('movement.reason')}</Text>
              </View>
              <Input
                value={suspectedCause}
                onChangeText={setSuspectedCause}
                placeholder={t('movement.placeholderReason')}
                multiline
                numberOfLines={4}
                style={[styles.fieldInput, { height: 120, textAlignVertical: 'top', paddingTop: 10 }]}
              />
           </View>
        </Card>

        <View style={styles.warningBox}>
          <MaterialIcons name="warning-amber" size={20} color="#856404" />
          <Text style={styles.warningText}>
            Toute mortalité anormale ({'>'}1%) doit être signalée immédiatement au vétérinaire conseil.
          </Text>
        </View>

        <Button
          title={t('movement.save')}
          onPress={handleSubmit}
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>
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
  infoCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    backgroundColor: theme.colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoTexts: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  infoSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
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
    fontWeight: '600',
    marginLeft: 8,
  },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background + '40',
    borderRadius: theme.borderRadius.m,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: '#FFEEBA',
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    marginLeft: 10,
    flex: 1,
    fontWeight: '500',
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  }
});
