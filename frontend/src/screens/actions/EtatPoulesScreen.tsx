import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../context/ThemeContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
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
    if (loading) return;
    if (parseInt(deadCount) <= 0 && parseInt(sickCount) <= 0) {
      Alert.alert(t('common.info'), t('movement.fillRequired'));
      return;
    }

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
        await repositoryProvider.api.post('/movements/', payload);
      }
      // If we had a sickness endpoint or movement type, we'd add it here too.
      // For now, mirroring the existing logic but with better validation.
      Alert.alert(t('common.success'), t('movement.success'));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('common.error'), t('common.errorSave'));
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
              <Text style={styles.infoSubtitle}>{lotName} • {new Date().toLocaleDateString(t('common.dateLocale'))}</Text>
            </View>
            <View style={styles.iconCircle}>
              <MaterialIcons name="assignment-turned-in" size={24} color="#000000" />
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>{t('movement.details')}</Text>

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
                style={[styles.fieldInput, { fontSize: 22, color: theme.colors.danger, fontWeight: 'bold', textAlign: 'center' }]}
              />
           </View>

           <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MaterialIcons name="medical-information" size={18} color="#E65100" />
                <Text style={styles.label}>{t('movement.types.malade')}</Text>
              </View>
              <Input
                value={sickCount}
                onChangeText={setSickCount}
                keyboardType="numeric"
                placeholder="0"
                style={[styles.fieldInput, { fontSize: 22, color: '#E65100', fontWeight: 'bold', textAlign: 'center' }]}
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
          <MaterialIcons name="warning-amber" size={24} color="#856404" />
          <Text style={styles.warningText}>
            {t('movement.mortalityWarning')}
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
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoTexts: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: '900', color: '#000000', textTransform: 'uppercase' },
  infoSubtitle: { fontSize: 13, color: '#000000', marginTop: 2, opacity: 0.7, fontWeight: '700' },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
    textTransform: 'uppercase'
  },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
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
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF9C4',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: '#FBC02D',
  },
  warningText: {
    fontSize: 12,
    color: '#000000',
    marginLeft: 10,
    flex: 1,
    fontWeight: '700',
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