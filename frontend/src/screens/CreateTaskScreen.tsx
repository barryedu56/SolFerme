import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DatePicker } from '../components/DatePicker';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { TASK_TYPES, TASK_TITLES_BY_TYPE } from '../constants/TaskConstants';
import { Screen, ScreenHeader, Card, space, radius } from '../components/ui';

export const CreateTaskScreen = ({ navigation, route }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialEmployeeId = route.params?.employeeId?.toString() || '';
  const [employees, setEmployees] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedType, setSelectedType] = useState('AUTRE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId);
  const [selectedLot, setSelectedLot] = useState('');

  const eligibleLotsForSelectedEmployee = React.useMemo(() => {
    if (!selectedEmployee) return [];
    const employee = employees.find((e) => e.id.toString() === selectedEmployee);
    if (!employee) return [];

    if (employee.lots_detail && Array.isArray(employee.lots_detail) && employee.lots_detail.length > 0) {
      const assignedLotIds = new Set(employee.lots_detail.map((lot: any) => lot.id));
      return lots.filter((lot) => assignedLotIds.has(lot.id));
    }
    if (typeof employee.lots_json === 'string' && employee.lots_json.length > 0) {
      try {
        const parsedLots = JSON.parse(employee.lots_json);
        if (Array.isArray(parsedLots) && parsedLots.length > 0) {
          const assignedLotIds = new Set(parsedLots.map((lot: any) => lot.id));
          return lots.filter((lot) => assignedLotIds.has(lot.id));
        }
      } catch { /* JSON invalide, on continue */ }
    }
    if (employee.lots && Array.isArray(employee.lots) && employee.lots.length > 0) {
      const assignedLotIds = new Set(employee.lots.map((lot: any) => lot.id));
      return lots.filter((lot) => assignedLotIds.has(lot.id));
    }
    if (employee.lot_id) return lots.filter((lot) => lot.id === employee.lot_id);
    if (employee.lot) return lots.filter((lot) => lot.id === employee.lot);
    if (employee.farm || employee.farm_id) {
      const farmId = employee.farm || employee.farm_id;
      return lots.filter((lot) => lot.farm === farmId || lot.farm_id === farmId);
    }
    return [];
  }, [selectedEmployee, employees, lots]);

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, lotsRes] = await Promise.all([
          repositoryProvider.api.get('/employees/'),
          repositoryProvider.api.get('/lots/'),
        ]);
        setEmployees(empRes.data);
        setLots(lotsRes.data);

        if (initialEmployeeId) {
          const emp = empRes.data.find((e: any) => e.id.toString() === initialEmployeeId);
          if (emp) {
            if (emp.lots_detail && Array.isArray(emp.lots_detail) && emp.lots_detail.length > 0) {
              setSelectedLot(emp.lots_detail[0].id.toString());
            } else if (typeof emp.lots_json === 'string' && emp.lots_json.length > 0) {
              try {
                const parsedLots = JSON.parse(emp.lots_json);
                if (Array.isArray(parsedLots) && parsedLots.length > 0) {
                  setSelectedLot(parsedLots[0].id.toString());
                }
              } catch { /* ignore */ }
            } else if (emp.lot_id) {
              setSelectedLot(emp.lot_id.toString());
            } else if (emp.lot) {
              setSelectedLot(emp.lot.toString());
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
      await repositoryProvider.api.post('/tasks/', {
        task_type: selectedType,
        title,
        description,
        due_date: dueDate,
        employee: parseInt(selectedEmployee),
        lot: selectedLot ? parseInt(selectedLot) : null,
        status: 'PENDING',
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
    const emp = employees.find((e) => e.id.toString() === selectedEmployee);
    return emp ? emp.user_name : t('tasks.form.selectEmployee');
  };
  const getLotName = () => {
    const lot = lots.find((l) => l.id.toString() === selectedLot);
    return lot ? lot.name : t('tasks.form.noLot');
  };
  const getTypeName = () => {
    const type = TASK_TYPES.find((tt) => tt.id === selectedType);
    return type ? type.label : selectedType;
  };

  if (!isOwner) {
    return (
      <Screen width="narrow" header={<ScreenHeader title={t('tasks.addTask')} onBack={() => navigation.goBack()} />}>
        <View style={styles.center}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[styles.restrictTitle, { color: theme.colors.text }]}>Accès Restreint</Text>
          <Text style={[styles.restrictText, { color: theme.colors.textSecondary }]}>Cette section est réservée aux propriétaires de la ferme.</Text>
          <Button title="Retour" onPress={() => navigation.goBack()} style={{ marginTop: 30, width: '100%' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll width="narrow" edges={['top', 'bottom']}
      header={<ScreenHeader title={t('tasks.addTask')} onBack={() => navigation.goBack()} />}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Card style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Type de tâche</Text>
            <Pressable style={styles.pickerButton} onPress={() => setShowTypePicker(!showTypePicker)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name={(TASK_TYPES.find((tt) => tt.id === selectedType)?.icon as any) || 'help-outline'} size={19} color={theme.colors.primary} />
                <Text style={[styles.pickerButtonText, { color: theme.colors.text }]}>{getTypeName()}</Text>
              </View>
              <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
            </Pressable>
            {showTypePicker && (
              <View style={styles.pickerOptions}>
                {TASK_TYPES.map((type) => (
                  <Pressable key={type.id} style={styles.pickerOption} onPress={() => { setSelectedType(type.id); setShowTypePicker(false); setTitle(''); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name={type.icon as any} size={19} color={theme.colors.textSecondary} />
                      <Text style={[styles.pickerOptionText, selectedType === type.id && styles.selectedOptionText]}>{type.label}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('tasks.form.title')}</Text>
            <Input placeholder={t('tasks.form.titlePlaceholder')} value={title} onChangeText={setTitle} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {TASK_TITLES_BY_TYPE[selectedType]?.map((suggestion) => (
                <Pressable key={suggestion} style={styles.suggestionBadge} onPress={() => setTitle(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('tasks.form.description')}</Text>
            <Input placeholder={t('tasks.form.descPlaceholder')} value={description} onChangeText={setDescription} multiline numberOfLines={3} style={{ height: 80 }} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('tasks.form.assignedTo')}</Text>
            <Pressable style={styles.pickerButton} onPress={() => setShowEmployeePicker(!showEmployeePicker)}>
              <Text style={[styles.pickerButtonText, { color: theme.colors.text }]}>{getEmployeeName()}</Text>
              <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
            </Pressable>
            {showEmployeePicker && (
              <View style={styles.pickerOptions}>
                {employees.map((emp) => (
                  <Pressable key={emp.id} style={styles.pickerOption} onPress={() => {
                    setSelectedEmployee(emp.id.toString());
                    setShowEmployeePicker(false);
                    if (emp.lots_detail && Array.isArray(emp.lots_detail) && emp.lots_detail.length > 0) {
                      setSelectedLot(emp.lots_detail[0].id.toString());
                    } else if (typeof emp.lots_json === 'string' && emp.lots_json.length > 0) {
                      try {
                        const parsedLots = JSON.parse(emp.lots_json);
                        if (Array.isArray(parsedLots) && parsedLots.length > 0) setSelectedLot(parsedLots[0].id.toString());
                      } catch { /* ignore */ }
                    } else if (emp.lot_id) {
                      setSelectedLot(emp.lot_id.toString());
                    } else if (emp.lot) {
                      setSelectedLot(emp.lot.toString());
                    }
                  }}>
                    <Text style={[styles.pickerOptionText, selectedEmployee === emp.id.toString() && styles.selectedOptionText]}>
                      {emp.user_name} ({emp.position})
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('tasks.form.lot')}</Text>
            <Pressable style={styles.pickerButton} onPress={() => setShowLotPicker(!showLotPicker)}>
              <Text style={[styles.pickerButtonText, { color: theme.colors.text }]}>{getLotName()}</Text>
              <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
            </Pressable>
            {showLotPicker && (
              <View style={styles.pickerOptions}>
                <Pressable style={styles.pickerOption} onPress={() => { setSelectedLot(''); setShowLotPicker(false); }}>
                  <Text style={styles.pickerOptionText}>{t('tasks.form.noLot')}</Text>
                </Pressable>
                {eligibleLotsForSelectedEmployee.length === 0 && selectedEmployee && (
                  <Text style={[styles.pickerOptionText, { padding: 12, color: theme.colors.textSecondary }]}>{t('tasks.form.noEligibleLots')}</Text>
                )}
                {eligibleLotsForSelectedEmployee.map((lot) => (
                  <Pressable key={lot.id} style={styles.pickerOption} onPress={() => { setSelectedLot(lot.id.toString()); setShowLotPicker(false); }}>
                    <Text style={[styles.pickerOptionText, selectedLot === lot.id.toString() && styles.selectedOptionText]}>{lot.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <DatePicker label={t('tasks.form.dueDate')} value={dueDate} onChange={setDueDate} />
        </Card>

        <Button title={t('common.save')} onPress={handleCreate} loading={loading} style={styles.submitBtn} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  restrictTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  restrictText: { fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: '600' },
  formCard: { padding: space.md, borderRadius: radius.lg, marginBottom: space.md },
  inputGroup: { marginBottom: space.md },
  label: { fontSize: 13.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, marginLeft: 2 },
  pickerButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.colors.background + '40', padding: 12, borderRadius: radius.sm,
    borderWidth: 0.8, borderColor: theme.colors.border,
  },
  pickerButtonText: { fontSize: 14 },
  pickerOptions: {
    marginTop: 4, backgroundColor: theme.colors.surface, borderRadius: radius.sm,
    borderWidth: 0.8, borderColor: theme.colors.border, maxHeight: 220, zIndex: 1000, overflow: 'hidden',
  },
  pickerOption: { padding: 12, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border },
  pickerOptionText: { fontSize: 14, color: theme.colors.textSecondary },
  selectedOptionText: { color: theme.colors.primary, fontWeight: '800' },
  suggestionBadge: { backgroundColor: theme.colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.colors.primary + '30' },
  suggestionText: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  submitBtn: { height: 54, borderRadius: radius.lg, backgroundColor: theme.colors.primary },
});
