import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export const CreateTaskScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialEmployeeId = route.params?.employeeId?.toString() || '';
  const [employees, setEmployees] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId);
  const [selectedLot, setSelectedLot] = useState('');

  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, lotsRes] = await Promise.all([
          apiClient.get('/employees/'),
          apiClient.get('/lots/')
        ]);
        setEmployees(empRes.data);
        setLots(lotsRes.data);

        // Si on a un employeId initial, on cherche son lot par défaut
        if (initialEmployeeId) {
          const emp = empRes.data.find((e: any) => e.id.toString() === initialEmployeeId);
          if (emp) {
            if (emp.lot) {
              setSelectedLot(emp.lot.toString());
            } else if (emp.lots_detail && emp.lots_detail.length > 0) {
              setSelectedLot(emp.lots_detail[0].id.toString());
            }
          }
        }
      } catch (error) {
        console.error('Erreur fetch data:', error);
      }
    };
    fetchData();
  }, [initialEmployeeId]);

  const handleCreate = async () => {
    if (!title || !selectedEmployee || !dueDate) {
      Alert.alert(t('common.error'), t('tasks.fillRequired'));
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/tasks/', {
        title,
        description,
        due_date: dueDate,
        employee: parseInt(selectedEmployee),
        lot: selectedLot ? parseInt(selectedLot) : null,
        status: 'A_FAIRE'
      });

      Alert.alert(t('common.success'), t('tasks.success'));
      navigation.goBack();
    } catch (error: any) {
      console.error(error);
      Alert.alert(t('common.error'), t('tasks.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeName = () => {
    const emp = employees.find(e => e.id.toString() === selectedEmployee);
    return emp ? emp.user_name : t('tasks.form.selectEmployee');
  };

  const getLotName = () => {
    const lot = lots.find(l => l.id.toString() === selectedLot);
    return lot ? lot.name : t('tasks.form.noLot');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('tasks.addTask')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('tasks.form.title')}</Text>
              <Input
                placeholder={t('tasks.form.titlePlaceholder')}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('tasks.form.description')}</Text>
              <Input
                placeholder={t('tasks.form.descPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                style={{ height: 80 }}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('tasks.form.assignedTo')}</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowEmployeePicker(!showEmployeePicker)}
              >
                <Text style={styles.pickerButtonText}>{getEmployeeName()}</Text>
                <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {showEmployeePicker && (
                <View style={styles.pickerOptions}>
                  {employees.map(emp => (
                    <TouchableOpacity
                      key={emp.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setSelectedEmployee(emp.id.toString());
                        setShowEmployeePicker(false);
                        // Sélection automatique du lot de l'employé si disponible
                        if (emp.lot) {
                          setSelectedLot(emp.lot.toString());
                        } else if (emp.lots_detail && emp.lots_detail.length > 0) {
                          setSelectedLot(emp.lots_detail[0].id.toString());
                        }
                      }}
                    >
                      <Text style={[styles.pickerOptionText, selectedEmployee === emp.id.toString() && styles.selectedOptionText]}>
                        {emp.user_name} ({emp.position})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('tasks.form.lot')}</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowLotPicker(!showLotPicker)}
              >
                <Text style={styles.pickerButtonText}>{getLotName()}</Text>
                <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {showLotPicker && (
                <View style={styles.pickerOptions}>
                  <TouchableOpacity
                    style={styles.pickerOption}
                    onPress={() => { setSelectedLot(''); setShowLotPicker(false); }}
                  >
                    <Text style={styles.pickerOptionText}>{t('tasks.form.noLot')}</Text>
                  </TouchableOpacity>
                  {lots.map(lot => (
                    <TouchableOpacity
                      key={lot.id}
                      style={styles.pickerOption}
                      onPress={() => { setSelectedLot(lot.id.toString()); setShowLotPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, selectedLot === lot.id.toString() && styles.selectedOptionText]}>
                        {lot.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <DatePicker
              label={t('tasks.form.dueDate')}
              value={dueDate}
              onChange={setDueDate}
            />
          </Card>

          <Button
            title={t('common.save')}
            onPress={handleCreate}
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background + '40',
    padding: 12,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border + '20',
  },
  pickerButtonText: { fontSize: 14, color: theme.colors.text },
  pickerOptions: {
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border + '20',
    ...theme.shadows.light,
    maxHeight: 200,
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '10',
  },
  pickerOptionText: { fontSize: 14, color: theme.colors.textSecondary },
  selectedOptionText: { color: theme.colors.primary, fontWeight: 'bold' },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  }
});
