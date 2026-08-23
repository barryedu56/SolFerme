import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const CreateEmployeeScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const { isDesktop } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop), [theme, isDesktop]);
  const { farms: initialFarms } = route.params || { farms: [] };
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [position, setPosition] = useState('Ouvrier');
  const [salary, setSalary] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('MENSUEL');
  const [hiredAt, setHiredAt] = useState(new Date().toISOString().split('T')[0]);
  const [farms, setFarms] = useState<any[]>(initialFarms || []);
  const [selectedFarm, setSelectedFarm] = useState('');
  const [selectedLots, setSelectedLots] = useState<number[]>([]);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFarmPicker, setShowFarmPicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);

  const positions = useMemo(() => [
    { label: t('employees.form.positions.manager'), value: 'Chef de lot' },
    { label: t('employees.form.positions.worker'), value: 'Ouvrier' },
    { label: t('employees.form.positions.technician'), value: 'Technicien' },
    { label: t('employees.form.positions.vet'), value: 'Vétérinaire' },
    { label: t('employees.form.positions.guard'), value: 'Gardien' },
  ], [t]);

  const frequencies = useMemo(() => [
    { label: t('employees.form.frequencies.monthly'), value: 'MENSUEL' },
    { label: t('employees.form.frequencies.semiAnnually'), value: 'SEMESTRIEL' },
    { label: t('employees.form.frequencies.annually'), value: 'ANNUEL' },
  ], [t]);

  useEffect(() => {
    if (!initialFarms || initialFarms.length === 0) {
      fetchFarms();
    } else if (initialFarms.length > 0) {
      setSelectedFarm(initialFarms[0].id.toString());
    }
  }, []);

  const fetchFarms = async () => {
    try {
      const data = await repositoryProvider.farm.list();
      setFarms(data);
      if (data.length > 0) {
        setSelectedFarm(data[0].id.toString());
      }
    } catch (error) {
      console.error("Erreur fetch farms:", error);
    }
  };

  useEffect(() => {
    if (selectedFarm) {
      fetchLots(selectedFarm);
    }
  }, [selectedFarm]);

  const fetchLots = async (farmId: string) => {
    try {
      const data = await repositoryProvider.lot.list({ farm: farmId });
      const farmLots = (data || []).filter((lot: any) => String(lot.farm ?? lot.farm_id ?? lot.farmId) === String(farmId));
      setAvailableLots(farmLots);
      setSelectedLots([]);
    } catch (error) {
      console.error("Erreur fetch lots:", error);
      setAvailableLots([]);
      setSelectedLots([]);
    }
  };

  const toggleLot = (lotId: number) => {
    if (selectedLots.includes(lotId)) {
      setSelectedLots(selectedLots.filter(id => id !== lotId));
    } else {
      setSelectedLots([...selectedLots, lotId]);
    }
  };

  const handleCreate = async () => {
    if (!name || !email || !password || !confirmPassword || !selectedFarm) {
      Alert.alert(t('common.error'), t('employees.messages.fillRequired'));
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert(
        t('common.error'),
        t('auth.passwordComplexity', {
          defaultValue: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.'
        })
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordMismatch', { defaultValue: 'Les mots de passe ne correspondent pas.' }));
      return;
    }

    setLoading(true);
    try {
      const createdUser = await repositoryProvider.user.create({
        name,
        email,
        phone,
        password,
        role: 'EMPLOYE'
      } as any);

      const userId = createdUser.id;

      const cleanSalary = salary.toString().replace(/\s/g, '');
      await repositoryProvider.employee.create({
        user: userId,
        farm: parseInt(selectedFarm),
        lots: selectedLots,
        position: position,
        salary: parseFloat(cleanSalary) || 0,
        payment_frequency: paymentFrequency,
        address: address,
        hired_at: hiredAt,
        status: 'ACTIF'
      } as any);

      Alert.alert(t('common.success'), t('employees.messages.createSuccess'));
      navigation.goBack();
    } catch (error: any) {
      console.error(error);
      if (error.response && error.response.data) {
        const firstErrorKey = Object.keys(error.response.data)[0];
        const errorMessage = error.response.data[firstErrorKey];
        Alert.alert(t('common.error'), `${firstErrorKey}: ${errorMessage}`);
      } else {
        Alert.alert(t('common.error'), t('employees.messages.errorEmailUsed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const getSelectedFarmName = () => {
    const farm = farms.find((f: any) => f.id.toString() === selectedFarm);
    return farm ? farm.name : t('payroll.selectEmployee');
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('employees.createTitle')}</Text>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('employees.createTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]} keyboardShouldPersistTaps="handled">
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

            <View style={styles.inputGroup}>
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


            <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <View style={styles.labelRow}>
                    <MaterialIcons name="email" size={18} color={theme.colors.primary} />
                    <Text style={styles.label}>{t('common.email')}</Text>
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
                    placeholder={t('employees.form.passwordPlaceholder')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={styles.fieldInput}
                  />
                </View>
            </View>

            <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="lock-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>{t('auth.confirmPassword', { defaultValue: 'Confirmer le mot de passe' })}</Text>
                </View>
                <Input
                  placeholder="********"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={styles.fieldInput}
                />
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
                    isNumeric
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
                <DatePicker
                  label={t('employees.form.hiringDate')}
                  value={hiredAt}
                  onChange={setHiredAt}
                />
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
                        onPress={() => { setSelectedFarm(f.id.toString()); setShowFarmPicker(false); }}
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
            title={t('employees.form.submitCreate')}
            onPress={handleCreate}
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
  filterText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  scrollDesktop: {
    maxWidth: 800,
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
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.m,
    ...theme.shadows.medium,
  }
});