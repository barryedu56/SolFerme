import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { TASK_TYPES, TASK_TITLES_BY_TYPE } from '../constants/TaskConstants';

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

    // Priorité 1 : lots_detail (API serialiseur Django / conversion lots_json SQLite)
    if (employee.lots_detail && Array.isArray(employee.lots_detail) && employee.lots_detail.length > 0) {
      const assignedLotIds = new Set(employee.lots_detail.map((lot: any) => lot.id));
      return lots.filter((lot) => assignedLotIds.has(lot.id));
    }

    // Priorité 2 : lots_json (champ dénormalisé SQLite, si lots_detail absent)
    if (typeof employee.lots_json === 'string' && employee.lots_json.length > 0) {
      try {
        const parsedLots = JSON.parse(employee.lots_json);
        if (Array.isArray(parsedLots) && parsedLots.length > 0) {
          const assignedLotIds = new Set(parsedLots.map((lot: any) => lot.id));
          return lots.filter((lot) => assignedLotIds.has(lot.id));
        }
      } catch { /* JSON invalide, on continue */ }
    }

    // Priorité 3 : lots (M2M complet, normalisé dans le format [{id, name}])
    if (employee.lots && Array.isArray(employee.lots) && employee.lots.length > 0) {
      const assignedLotIds = new Set(employee.lots.map((lot: any) => lot.id));
      return lots.filter((lot) => assignedLotIds.has(lot.id));
    }

    // Fallback : lot_id depuis le employee (FK directe, modèle Employee)
    if (employee.lot_id) {
      return lots.filter((lot) => lot.id === employee.lot_id);
    }
    if (employee.lot) {
      return lots.filter((lot) => lot.id === employee.lot);
    }

    // Dernier recours : si aucun lot n'est affecté, reproduire le comportement Online
    // (backend renvoie farm → lots de la ferme entière)
    if (employee.farm || employee.farm_id) {
      const farmId = employee.farm || employee.farm_id;
      return lots.filter((lot) => lot.farm === farmId || lot.farm_id === farmId);
    }

    return [];
  }, [selectedEmployee, employees, lots]);

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showTitlePicker, setShowTitlePicker] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, lotsRes] = await Promise.all([
          repositoryProvider.api.get('/employees/'),
          repositoryProvider.api.get('/lots/')
        ]);
        setEmployees(empRes.data);
        setLots(lotsRes.data);

        // Si on a un employeId initial, on cherche son lot par défaut
        if (initialEmployeeId) {
          const emp = empRes.data.find((e: any) => e.id.toString() === initialEmployeeId);
          if (emp) {
            // lots_detail (API) et lots_json (SQLite) en premier
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
        status: 'PENDING'  // Correction: 'A_FAIRE' était invalide, le modèle attend PENDING
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

  const getTypeName = () => {
    const type = TASK_TYPES.find(t => t.id === selectedType);
    return type ? type.label : selectedType;
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('tasks.addTask')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="lock" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 20 }} />
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Accès Restreint</Text>
          <Text style={[styles.filterText, { textAlign: 'center', marginTop: 10 }]}>
            Cette section est réservée aux propriétaires de la ferme.
          </Text>
          <Button
            title="Retour"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 30, width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

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
              <Text style={styles.label}>Type de tâche</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowTypePicker(!showTypePicker)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons
                    name={TASK_TYPES.find(t => t.id === selectedType)?.icon as any || 'help-outline'}
                    size={20}
                    color={theme.colors.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.pickerButtonText}>{getTypeName()}</Text>
                </View>
                <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {showTypePicker && (
                <View style={styles.pickerOptions}>
                  {TASK_TYPES.map(type => (
                    <TouchableOpacity
                      key={type.id}
                      style={styles.pickerOption}
                      onPress={() => {
                        setSelectedType(type.id);
                        setShowTypePicker(false);
                        setTitle(''); // Reset title when type changes
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name={type.icon as any} size={20} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                        <Text style={[styles.pickerOptionText, selectedType === type.id && styles.selectedOptionText]}>
                          {type.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('tasks.form.title')}</Text>
              <Input
                placeholder={t('tasks.form.titlePlaceholder')}
                value={title}
                onChangeText={setTitle}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
                {TASK_TITLES_BY_TYPE[selectedType]?.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    style={styles.suggestionBadge}
                    onPress={() => setTitle(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
                  {eligibleLotsForSelectedEmployee.length === 0 && selectedEmployee && (
                    <Text style={[styles.pickerOptionText, { padding: 12, color: theme.colors.textSecondary }]}>
                      {t('tasks.form.noEligibleLots')}
                    </Text>
                  )}
                  {eligibleLotsForSelectedEmployee.map(lot => (
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
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
  sectionTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  filterText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
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
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  pickerButtonText: { fontSize: 14, color: theme.colors.text },
  pickerOptions: {
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
    maxHeight: 200,
    zIndex: 1000,
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border,
  },
  pickerOptionText: { fontSize: 14, color: theme.colors.textSecondary },
  selectedOptionText: { color: theme.colors.primary, fontWeight: 'bold' },
  suggestionsScroll: {
    marginTop: 8,
    flexDirection: 'row',
  },
  suggestionBadge: {
    backgroundColor: theme.colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  suggestionText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  }
});