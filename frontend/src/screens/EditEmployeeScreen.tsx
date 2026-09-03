import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const EditEmployeeScreen = ({ route, navigation }: any) => {
  const routeEmployee = route?.params?.employee;
  const routeEmployeeId = route?.params?.employeeId ?? routeEmployee?.id;
  const initialFarms = route?.params?.farms || [];
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop), [theme, isDesktop]);

  const [employee, setEmployee] = useState<any>(routeEmployee || null);
  const [name, setName] = useState(routeEmployee?.user_name || '');
  const [email, setEmail] = useState(routeEmployee?.user_email || '');
  const [phone, setPhone] = useState(routeEmployee?.user_phone || '');
  const [address, setAddress] = useState(routeEmployee?.address || '');
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState(routeEmployee?.position || 'Ouvrier');
  const [salary, setSalary] = useState(routeEmployee?.salary?.toString() || '');
  const [paymentFrequency, setPaymentFrequency] = useState(routeEmployee?.payment_frequency || 'MENSUEL');
  const [status, setStatus] = useState(routeEmployee?.status || 'ACTIF');
  const [selectedFarm, setSelectedFarm] = useState(routeEmployee?.farm?.toString() || '');
  const [farms, setFarms] = useState<any[]>(initialFarms || []);
  const [selectedLots, setSelectedLots] = useState<number[]>(routeEmployee?.lots || routeEmployee?.lots_detail?.map((lot: any) => lot.id) || []);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fonction consolidée pour initialiser les données de l'employé
  const initializeEmployeeData = (data: any) => {
    setEmployee(data);
    setName(data.user_name || '');
    setEmail(data.user_email || '');
    setPhone(data.user_phone || '');
    setAddress(data.address || '');
    setPosition(data.position || 'Ouvrier');
    setSalary(data.salary?.toString() || '');
    setPaymentFrequency(data.payment_frequency || 'MENSUEL');
    setStatus(data.status || 'ACTIF');

    const farmId = data.farm ? String(data.farm) : '';
    setSelectedFarm(farmId);

    const rawLots = Array.isArray(data.lots)
      ? data.lots
      : (data.lots_detail?.map((lot: any) => lot.id) || []);
    const normalizedLots = rawLots
      .map((lotId: any) => Number(lotId))
      .filter((lotId: number) => !Number.isNaN(lotId));
    setSelectedLots(normalizedLots);

    if (farmId) {
      console.log('Chargement lots pour ferme:', farmId);
      fetchLots(farmId, true);
    } else {
      setAvailableLots([]);
    }
  };

  // useEffect pour initialiser les données de l'employé
  useEffect(() => {
    if (routeEmployee) {
      console.log('Initialisation avec employé du route:', routeEmployee);
      initializeEmployeeData(routeEmployee);
    } else if (routeEmployeeId) {
      console.log('Récupération employé avec ID:', routeEmployeeId);
      repositoryProvider.api.get(`/employees/${routeEmployeeId}/`)
        .then((res: any) => {
          console.log('Employé récupéré:', res.data);
          initializeEmployeeData(res.data);
        })
        .catch((error: any) => {
          console.error('Erreur récupération employé:', error);
          Alert.alert(t('common.error'), 'Impossible de charger l\'employé');
        });
    }
  }, [routeEmployee, routeEmployeeId, t]);

  const [showFarmPicker, setShowFarmPicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);

  const positions = useMemo(() => [
    { label: t('employees.form.positions.manager'), value: 'Chef de lot' },
    { label: t('employees.form.positions.worker'), value: 'Ouvrier' },
    { label: t('employees.form.positions.technician'), value: 'Technicien' },
    { label: t('employees.form.positions.vet'), value: 'Vétérinaire' },
    { label: t('employees.form.positions.guard'), value: 'Gardien' },
  ], [t]);

  const statuses = useMemo(() => [
    { label: t('profile.active'), value: 'ACTIF' },
    { label: t('profile.inactive'), value: 'INACTIF' },
  ], [t]);

  const frequencies = useMemo(() => [
    { label: t('employees.form.frequencies.monthly'), value: 'MENSUEL' },
    { label: t('employees.form.frequencies.semiAnnually'), value: 'SEMESTRIEL' },
    { label: t('employees.form.frequencies.annually'), value: 'ANNUEL' },
  ], [t]);

  useEffect(() => {
    if (!initialFarms || initialFarms.length === 0) {
      fetchFarms();
    }
  }, []);

  useEffect(() => {
    if (!selectedFarm) {
      setAvailableLots([]);
      return;
    }

    fetchLots(selectedFarm);
  }, [selectedFarm]);

  const fetchFarms = async () => {
    try {
      const data = await repositoryProvider.farm.list();
      setFarms(data);
    } catch (error) {
      console.error("Erreur fetch farms:", error);
    }
  };

  const fetchLots = async (farmId: string, preserveExistingSelection = false) => {
    try {
      console.log('fetchLots appelé avec farmId:', farmId, 'preserveExistingSelection=', preserveExistingSelection);
      if (!farmId) {
        console.warn('farmId vide, pas de lots à charger');
        setAvailableLots([]);
        setSelectedLots([]);
        return;
      }

      const data = await repositoryProvider.lot.list({ farm: farmId });
      const farmLots = (data || []).filter((lot: any) => String(lot.farm ?? lot.farm_id ?? lot.farmId) === String(farmId));
      console.log('Lots chargés pour ferme', farmId, ':', farmLots);
      setAvailableLots(farmLots);

      setSelectedLots((prev) => {
        const currentSelection = Array.isArray(prev) ? prev : [];
        const validSelection = currentSelection.filter((lotId) => farmLots.some((lot: any) => lot.id === lotId));
        if (preserveExistingSelection && validSelection.length > 0) {
          return validSelection;
        }
        return validSelection;
      });
    } catch (error: any) {
      console.error("Erreur fetch lots pour ferme", farmId, ":", error);
      console.error('Détails erreur:', {
        message: error?.message,
        response: error?.response?.data,
      });
      setAvailableLots([]);
      setSelectedLots([]);
    }
  };

  const toggleLot = (lotId: number) => {
    setSelectedLots((prev) => {
      if (prev.includes(lotId)) {
        return prev.filter(id => id !== lotId);
      }
      return [...prev, lotId];
    });
  };

  const handleUpdate = async () => {
    if (!name) {
      Alert.alert(t('common.error'), 'Le nom est requis');
      return;
    }

    if (!selectedFarm) {
      Alert.alert(t('common.error'), 'Une ferme doit être sélectionnée');
      return;
    }

    if (!employee || !employee.id || !employee.user) {
      console.error('Données employé incomplètes:', { employee, selectedFarm, selectedLots });
      Alert.alert(t('common.error'), 'Les données de l\'employé sont incomplètes. Veuillez actualiser.');
      return;
    }

    const cleanedLots = Array.from(new Set((selectedLots || []).map((lotId) => Number(lotId)).filter((lotId) => !Number.isNaN(lotId))));
    const normalizedFarm = Number(selectedFarm);

    if (!Number.isFinite(normalizedFarm) || normalizedFarm <= 0) {
      Alert.alert(t('common.error'), 'La ferme sélectionnée est invalide.');
      return;
    }

    console.log('Début mise à jour employé:', {
      employeeId: employee.id,
      userId: employee.user,
      selectedFarm: normalizedFarm,
      selectedLots: cleanedLots,
      name,
      position,
      salary,
    });

    setLoading(true);
    try {
      const userData: any = {
        name,
        phone,
        email,
      };
      if (password) {
        userData.password = password;
      }

      console.log('Mise à jour user avec:', userData);
      await repositoryProvider.user.patch(employee.user, userData);

      const employeeData = {
        farm: normalizedFarm,
        lots: cleanedLots,
        position,
        salary: Number.parseFloat(String(salary)) || 0,
        payment_frequency: paymentFrequency,
        address,
        status,
      };

      console.log('Mise à jour employee avec:', employeeData);
      await repositoryProvider.employee.patch(employee.id, employeeData as any);

      Alert.alert(t('common.success'), t('employees.messages.updateSuccess'));
      navigation.goBack();
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      console.error('Détails erreur:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      const backendMessage = error?.response?.data?.detail || error?.response?.data?.message || error?.response?.data?.error;
      Alert.alert(t('common.error'), backendMessage || t('employees.messages.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const getSelectedFarmName = () => {
    const farm = farms.find((f: any) => f.id.toString() === selectedFarm);
    return farm ? farm.name : t('payroll.selectEmployee');
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
          <Text style={styles.headerTitle}>{t('employees.editTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>{t('employees.form.userAccount')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="person" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('employees.form.fullName')}</Text>
                </View>
                <Input
                  placeholder={t('employees.form.fullNamePlaceholder')}
                  value={name}
                  onChangeText={setName}
                  style={styles.fieldInput}
                />
            </View>

            <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="phone" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.phone')}</Text>
                  </View>
                  <Input
                    placeholder={t('employees.form.phonePlaceholder')}
                    value={phone}
                    onChangeText={setPhone}
                    isPhone
                    maxLength={9}
                    style={styles.fieldInput}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="place" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.address')}</Text>
                  </View>
                  <Input
                    placeholder={t('employees.form.addressPlaceholder')}
                    value={address}
                    onChangeText={setAddress}
                    style={styles.fieldInput}
                  />
                </View>
            </View>

            <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="email" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.email')}</Text>
                  </View>
                  <Input
                    placeholder={t('employees.form.emailPlaceholder')}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    style={styles.fieldInput}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="lock" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.password')}</Text>
                  </View>
                  <Input
                    placeholder={t('employees.form.passwordEditPlaceholder')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={styles.fieldInput}
                  />
                </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('employees.form.jobAssignment')}</Text>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="work" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('employees.form.position')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowPositionPicker(!showPositionPicker)}
                >
                  <Text style={styles.pickerButtonText}>
                    {positions.find(p => p.value === position)?.label || position}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                {showPositionPicker && (
                  <View style={styles.pickerOptions}>
                    {positions.map((p) => (
                      <TouchableOpacity
                        key={p.value}
                        style={styles.pickerOption}
                        onPress={() => { setPosition(p.value); setShowPositionPicker(false); }}
                      >
                        <Text style={[styles.pickerOptionText, position === p.value && styles.selectedOptionText]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>

            <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="payments" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.salary')}</Text>
                  </View>
                  <Input
                    placeholder="0"
                    value={salary}
                    onChangeText={setSalary}
                    keyboardType="numeric"
                    style={styles.fieldInput}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="repeat" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('employees.form.frequency')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowFrequencyPicker(!showFrequencyPicker)}
                  >
                    <Text style={styles.pickerButtonText}>
                      {frequencies.find(f => f.value === paymentFrequency)?.label}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                  </TouchableOpacity>

                  {showFrequencyPicker && (
                    <View style={styles.pickerOptions}>
                      {frequencies.map((f) => (
                        <TouchableOpacity
                          key={f.value}
                          style={styles.pickerOption}
                          onPress={() => { setPaymentFrequency(f.value); setShowFrequencyPicker(false); }}
                        >
                          <Text style={[styles.pickerOptionText, paymentFrequency === f.value && styles.selectedOptionText]}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
            </View>

            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="info" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('employees.form.status')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowStatusPicker(!showStatusPicker)}
                >
                  <Text style={styles.pickerButtonText}>
                    {statuses.find(s => s.value === status)?.label || status}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                {showStatusPicker && (
                  <View style={styles.pickerOptions}>
                    {statuses.map((s) => (
                      <TouchableOpacity
                        key={s.value}
                        style={styles.pickerOption}
                        onPress={() => { setStatus(s.value); setShowStatusPicker(false); }}
                      >
                        <Text style={[styles.pickerOptionText, status === s.value && styles.selectedOptionText]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>

            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="business" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('employees.form.assignedFarm')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowFarmPicker(!showFarmPicker)}
                >
                  <Text style={styles.pickerButtonText} numberOfLines={1}>{getSelectedFarmName()}</Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                {showFarmPicker && (
                  <View style={styles.pickerOptions}>
                    {farms.map((f: any) => (
                      <TouchableOpacity
                        key={f.id}
                        style={styles.pickerOption}
                        onPress={() => {
                          setSelectedFarm(f.id.toString());
                          setSelectedLots([]);
                          setShowFarmPicker(false);
                        }}
                      >
                        <Text style={[styles.pickerOptionText, selectedFarm === f.id.toString() && styles.selectedOptionText]}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>

            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="layers" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('employees.form.assignedLots')}</Text>
                </View>
                <View style={styles.lotsContainer}>
                  {availableLots.length > 0 ? (
                    availableLots.map((lot: any) => (
                      <TouchableOpacity
                        key={lot.id}
                        style={[
                          styles.lotChip,
                          selectedLots.includes(lot.id) && styles.lotChipSelected
                        ]}
                        onPress={() => toggleLot(lot.id)}
                      >
                        <MaterialIcons
                          name={selectedLots.includes(lot.id) ? "check-box" : "check-box-outline-blank"}
                          size={18}
                          color={selectedLots.includes(lot.id) ? theme.colors.primary : theme.colors.textSecondary}
                        />
                        <Text style={[
                          styles.lotChipText,
                          selectedLots.includes(lot.id) && styles.lotChipTextSelected
                        ]}>
                          {lot.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.noLotsText}>{t('employees.form.noLots')}</Text>
                  )}
                </View>
            </View>
          </Card>

          <Button
            title={t('employees.form.submitEdit')}
            onPress={handleUpdate}
            loading={loading}
            style={styles.submitBtn}
          />
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
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
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
    marginLeft: 4,
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
  row: { flexDirection: 'row' },
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
  pickerButtonText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  pickerOptions: {
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border,
  },
  pickerOptionText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  selectedOptionText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.m,
    ...theme.shadows.medium,
  },
  lotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  lotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  lotChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  lotChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  lotChipTextSelected: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  noLotsText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  }
});