import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { repositoryProvider } from '../../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { scheduleReminderNotification, cancelNotification, notifyReminderScheduled, getNotificationDiagnostics } from '../../utils/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

export const ActionReminderScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t, language } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop } = useBreakpoint();
  const { lotId, lotName, farmId: pFarmId, reminderId } = route.params || {};

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5)); // HH:MM format
  const [title, setTitle] = useState('');
  const [type, setType] = useState(t('reminders.types.vaccine'));
  const [repetition, setRepetition] = useState('ONCE');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState(pFarmId || '');
  const [lots, setLots] = useState<any[]>([]);
  const [selectedLot, setSelectedLot] = useState(lotId || '');
  const [status, setStatus] = useState('PENDING');

  const [currentLotName, setCurrentLotName] = useState(lotName || '');

  const formatTimeInput = (text: string) => {
    // Remove all non-digit characters
    const cleanText = text.replace(/\D/g, '');
    if (cleanText.length === 0) return '';
    if (cleanText.length <= 2) return cleanText;
    // Format as HH:MM
    const hours = cleanText.slice(0, 2);
    const minutes = cleanText.slice(2, 4);
    return `${hours}:${minutes}`;
  };

  const validateReminderDateTime = (reminderDate: string, reminderTime: string | null): boolean => {
    const now = new Date();
    const reminderDateTime = new Date(reminderDate);

    if (reminderTime) {
      const [hours, minutes] = reminderTime.split(':').map(Number);
      reminderDateTime.setHours(hours, minutes, 0, 0);
    } else {
      // If no time specified, use end of day
      reminderDateTime.setHours(23, 59, 59, 999);
    }

    return reminderDateTime > now;
  };

  const reminderTypes = useMemo(() => [
    t('reminders.types.vaccine'),
    t('reminders.types.treatment'),
    t('reminders.types.feeding'),
    t('reminders.types.cleaning'),
    t('reminders.types.sale'),
    t('reminders.types.maintenance'),
    t('reminders.types.other')
  ], [t]);

  const repetitionOptions = useMemo(() => [
    { label: t('reminders.once'), value: 'ONCE' },
    { label: t('reminders.daily'), value: 'DAILY' },
    { label: t('reminders.weekly'), value: 'WEEKLY' },
    { label: t('reminders.monthly'), value: 'MONTHLY' },
  ], [t]);

  useEffect(() => {
    if (userRole !== 'PROPRIETAIRE') {
      Alert.alert(t('common.error'), t('reminders.ownerOnly'));
      navigation.goBack();
      return;
    }
    fetchFarms();
    if (reminderId) {
      fetchReminderDetails();
    }
  }, []);

  useEffect(() => {
    if (selectedFarm) {
      fetchLots(selectedFarm);
    }
  }, [selectedFarm]);

  const fetchReminderDetails = async () => {
    try {
      const res = await repositoryProvider.api.get<any>(`/reminders/${reminderId}/`);
      const r = res.data as any;
      setTitle(r.title);
      setType(r.type);
      setDate(r.date);
      setTime(r.time ? r.time.slice(0, 5) : ''); // Ensure HH:MM format
      setRepetition(r.repetition);
      setDescription(r.description || '');
      setSelectedFarm(r.farm);
      setSelectedLot(r.lot);
      setCurrentLotName(r.lot_name || '');
      setStatus(r.status);
    } catch (e) {
      Alert.alert(t('common.error'), t('reminders.loadError'));
    }
  };

  const fetchFarms = async () => {
    try {
      const res = await repositoryProvider.api.get('/farms/');
      setFarms(res.data);
      if (!selectedFarm && !reminderId && res.data.length > 0) {
        setSelectedFarm(res.data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLots = async (fId: any) => {
    try {
      const res = await repositoryProvider.api.get(`/lots/?farm=${fId}`);
      setLots(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const showReminderMessage = (title: string, message: string, isError = false) => {
    if (Platform.OS === 'web') {
      if (isError) toast.error(title, message);
      else toast.success(title, message);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!title || !date || !selectedFarm) {
      showReminderMessage(t('common.error'), t('reminders.fillRequired'), true);
      return;
    }

    // Validate that reminder date/time is in the future
    if (!validateReminderDateTime(date, time)) {
      showReminderMessage(t('common.error'), "Impossible de créer ce rappel : la date et l'heure doivent être dans le futur.", true);
      return;
    }

    if (selectedLot) {
      const lot = lots.find(l => l.id === selectedLot);
      if (lot && date < lot.purchase_date) {
        showReminderMessage(t('common.error'), t('reminders.dateErrorBeforeLot'), true);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        farm: selectedFarm,
        lot: selectedLot || null,
        title,
        type,
        date,
        time: time || null, // Send null if time is empty
        repetition,
        description,
        status
      };

      let response;
      if (reminderId) {
        response = await repositoryProvider.api.put(`/reminders/${reminderId}/`, payload);

        // Handle old notification cancellation if stored
        const oldNotifId = await AsyncStorage.getItem(`notif_reminder_${reminderId}`);
        if (oldNotifId) {
          await cancelNotification(oldNotifId);
        }
      } else {
        response = await repositoryProvider.api.post('/reminders/', payload);
      }

      const savedReminder = response.data;

      // Planification de la notification locale + confirmation immédiate.
      let notifWarning: string | undefined;
      if (status === 'PENDING') {
        try {
          const diag = await getNotificationDiagnostics();
          if (!diag.ok) {
            notifWarning = diag.reason;
          } else {
            const notifId = await scheduleReminderNotification(savedReminder);
            if (notifId) {
              await AsyncStorage.setItem(`notif_reminder_${savedReminder.id}`, notifId);
            }
            // Confirmation visible uniquement à la création (pas à l'édition).
            if (!reminderId) await notifyReminderScheduled(savedReminder);
          }
        } catch (notifError) {
          console.error("Erreur lors de la planification de la notification:", notifError);
        }
      }

      showReminderMessage(
        t('common.success'),
        notifWarning ? `${t('reminders.saved')}\n\n⚠️ ${notifWarning}` : t('reminders.saved'),
      );
      navigation.goBack();
    } catch (e: any) {
      console.error("Erreur handleSubmit Rappel:", e);
      const errorMessage = getErrorMessage(e, t('common.error'));
      showReminderMessage(t('common.actionImpossible'), errorMessage, true);
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: theme.colors.surface }]}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {reminderId ? t('reminders.editReminder') : t('reminders.addReminder')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.title')}</Text>
              <Input
                placeholder={t('reminders.form.titlePlaceholder')}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.type')}</Text>
              <View style={styles.typeRow}>
                {reminderTypes.map((tItem) => (
                  <TouchableOpacity
                    key={tItem}
                    style={[
                      styles.typeChip,
                      type === tItem && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setType(tItem)}
                  >
                    <Text style={[styles.typeText, type === tItem && { color: '#000', fontWeight: 'bold' }]}>{tItem}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>{t('farms.title')} *</Text>
                <View style={styles.pickerContainer}>
                  {farms.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setSelectedFarm(f.id)}
                      style={[styles.smallChip, selectedFarm === f.id && { backgroundColor: theme.colors.primary }]}
                    >
                      <Text style={[styles.smallChipText, selectedFarm === f.id && { color: '#000' }]}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('farms.batches')}</Text>
                <View style={styles.pickerContainer}>
                  {lots.map(l => (
                    <TouchableOpacity
                      key={l.id}
                      onPress={() => setSelectedLot(l.id)}
                      style={[styles.smallChip, selectedLot === l.id && { backgroundColor: theme.colors.primary }]}
                    >
                      <Text style={[styles.smallChipText, selectedLot === l.id && { color: '#000' }]}>{l.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <DatePicker
                  label={t('reminders.form.date')}
                  value={date}
                  onChange={setDate}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('reminders.form.time')}</Text>
                <Input
                  value={time}
                  onChangeText={(text) => setTime(formatTimeInput(text))}
                  placeholder="HH:MM"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.repetition')}</Text>
              <View style={styles.typeRow}>
                {repetitionOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      repetition === opt.value && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setRepetition(opt.value)}
                  >
                    <Text style={[styles.typeText, repetition === opt.value && { color: '#000', fontWeight: 'bold' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.description')}</Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="..."
                multiline
                numberOfLines={4}
                style={{ height: 80, textAlignVertical: 'top' }}
              />
            </View>
          </Card>

          <Button
            title={t('common.save')}
            onPress={handleSubmit}
            loading={loading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
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
  scroll: { padding: 16 },
  scrollDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  formCard: {
    padding: 16,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, color: theme.colors.text },
  row: { flexDirection: 'row' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  typeText: { fontSize: 12, color: theme.colors.textSecondary },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  smallChip: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    marginRight: 4,
    marginBottom: 4,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  smallChipText: { fontSize: 11, color: theme.colors.textSecondary },
});