import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { scheduleReminderNotification, cancelNotification } from '../../utils/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ActionReminderScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { lotId, lotName, farmId: pFarmId, reminderId } = route.params || {};

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Vaccin');
  const [repetition, setRepetition] = useState('ONCE');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState(pFarmId || '');
  const [lots, setLots] = useState<any[]>([]);
  const [selectedLot, setSelectedLot] = useState(lotId || '');
  const [status, setStatus] = useState('PENDING');

  const [currentLotName, setCurrentLotName] = useState(lotName || '');

  const reminderTypes = ['Vaccin', 'Traitement', 'Alimentation', 'Nettoyage', 'Vente', 'Maintenance', 'Autre'];

  const repetitionOptions = [
    { label: t('reminders.once') || 'Une fois', value: 'ONCE' },
    { label: t('reminders.daily') || 'Quotidien', value: 'DAILY' },
    { label: t('reminders.weekly') || 'Hebdomadaire', value: 'WEEKLY' },
    { label: t('reminders.monthly') || 'Mensuel', value: 'MONTHLY' },
  ];

  useEffect(() => {
    if (userRole !== 'PROPRIETAIRE') {
      Alert.alert(t('common.error'), "Seuls les propriétaires peuvent gérer les rappels.");
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
      const res = await apiClient.get(`/reminders/${reminderId}/`);
      const r = res.data;
      setTitle(r.title);
      setType(r.type);
      setDate(r.date);
      setTime(r.time || '');
      setRepetition(r.repetition);
      setDescription(r.description || '');
      setSelectedFarm(r.farm);
      setSelectedLot(r.lot);
      setCurrentLotName(r.lot_name || '');
      setStatus(r.status);
    } catch (e) {
      Alert.alert(t('common.error'), t('reminders.loadError') || 'Impossible de charger les détails');
    }
  };

  const fetchFarms = async () => {
    try {
      const res = await apiClient.get('/farms/');
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
      const res = await apiClient.get(`/lots/?farm=${fId}`);
      setLots(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (!title || !date || !selectedFarm) {
      Alert.alert(t('common.error'), t('reminders.fillRequired') || 'Veuillez remplir les champs obligatoires.');
      return;
    }

    if (selectedLot) {
      const lot = lots.find(l => l.id === selectedLot);
      if (lot && date < lot.purchase_date) {
        Alert.alert(t('common.error'), "La date de ce rappel ne peut pas être antérieure à la date de mise en place du lot.");
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
        time,
        repetition,
        description,
        status
      };

      let response;
      if (reminderId) {
        response = await apiClient.put(`/reminders/${reminderId}/`, payload);

        // Handle old notification cancellation if stored
        const oldNotifId = await AsyncStorage.getItem(`notif_reminder_${reminderId}`);
        if (oldNotifId) {
          await cancelNotification(oldNotifId);
        }
      } else {
        response = await apiClient.post('/reminders/', payload);
      }

      const savedReminder = response.data;

      // Schedule local notification - Wrapped in try/catch to prevent blocking success
      if (status === 'PENDING') {
        try {
          const [hours, minutes] = (time || '08:00').split(':');
          const scheduledDate = new Date(date);
          scheduledDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

          if (scheduledDate > new Date()) {
            const lName = lots.find(l => l.id === selectedLot)?.name || currentLotName;
            const notifId = await scheduleReminderNotification(
              title,
              `${type}${lName ? ' - ' + lName : ''}`,
              scheduledDate
            );
            if (notifId) {
              await AsyncStorage.setItem(`notif_reminder_${savedReminder.id}`, notifId);
            }
          }
        } catch (notifError) {
          console.error("Erreur lors de la planification de la notification:", notifError);
          // On ne bloque pas l'utilisateur car le rappel est bien enregistré sur le serveur
        }
      }

      Alert.alert(t('common.success'), t('reminders.saved') || 'Rappel enregistré !');
      navigation.goBack();
    } catch (e: any) {
      console.error("Erreur handleSubmit Rappel:", e);
      const errorMessage = e.response?.data?.detail || t('common.error');
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: theme.colors.surface }]}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {reminderId ? t('reminders.editReminder') || 'Modifier le Rappel' : t('reminders.addReminder')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.title') || 'Titre du rappel *'}</Text>
              <Input
                placeholder="Ex: Vaccination Gumboro"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.type') || 'Type'}</Text>
              <View style={styles.typeRow}>
                {reminderTypes.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      type === t && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.typeText, type === t && { color: '#000', fontWeight: 'bold' }]}>{t}</Text>
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
                  label={t('reminders.form.date') || 'Date prévue *'}
                  value={date}
                  onChange={setDate}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('reminders.form.time') || 'Heure'}</Text>
                <Input
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:MM"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('reminders.form.repetition') || 'Répétition'}</Text>
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
              <Text style={styles.label}>{t('reminders.form.description') || 'Description / Note'}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
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
  formCard: {
    padding: 16,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  smallChipText: { fontSize: 11, color: theme.colors.textSecondary },
});
