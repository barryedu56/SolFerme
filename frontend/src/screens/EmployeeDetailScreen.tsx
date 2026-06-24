import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Linking, ActivityIndicator, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { Card } from '../components/Card';
import { formatCurrency } from '../utils/formatters';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '../context/LanguageContext';

export const EmployeeDetailScreen = ({ route, navigation }: any) => {
  const { employeeId, farms } = route.params;
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [employee, setEmployee] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const currentLocale = activeLanguage === 'fr' ? 'fr-FR' : 'en-US';

  const fetchData = async () => {
    try {
      const [empRes, attRes, tasksRes, payRes] = await Promise.all([
        apiClient.get(`/employees/${employeeId}/`),
        apiClient.get(`/attendances/?employee=${employeeId}`),
        apiClient.get(`/tasks/?employee=${employeeId}`),
        apiClient.get(`/payrolls/?employee=${employeeId}`)
      ]);
      setEmployee(empRes.data);
      setAttendance(attRes.data);
      setTasks(tasksRes.data);
      setPayrolls(payRes.data);
    } catch (error) {
      console.error('Erreur fetch employee data:', error);
      Alert.alert(t('common.error'), t('employees.messages.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation, employeeId]);

  const handleCall = () => {
    if (employee?.user_phone) {
      Linking.openURL(`tel:${employee.user_phone}`);
    } else {
      Alert.alert(t('common.info'), 'Numéro de téléphone non disponible');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('common.confirm'),
      t('employees.messages.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/employees/${employeeId}/`);
              Alert.alert(t('common.success'), t('employees.messages.deleteSuccess'));
              navigation.goBack();
            } catch (error) {
              Alert.alert(t('common.error'), t('employees.messages.deleteError'));
            }
          }
        }
      ]
    );
  };

  const getFarmName = () => {
    return employee.farm_name || 'Inconnue';
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Permissions requises pour accéder aux photos.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      handleUploadImage(result.assets[0].uri);
    }
  };

  const handleUploadImage = async (uri: string) => {
    try {
      setUpdatingPhoto(true);
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename || '');
      const type = match ? `image/${match[1]}` : `image`;

      // @ts-ignore
      formData.append('profile_image', {
        uri: uri,
        name: filename || 'profile.jpg',
        type: type,
      });

      await apiClient.patch(`/users/${employee.user}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await fetchData();
      Alert.alert(t('common.success'), t('profile.updatePhotoSuccess'));
    } catch (e) {
      console.error('Upload error:', e);
      Alert.alert(t('common.error'), t('profile.updatePhotoError'));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!employee) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('employees.detailTitle')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('EditEmployee', { employee, farms })} style={styles.editBtn}>
          <MaterialIcons name="edit" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {[
          { id: 'info', label: t('employees.tabs.profile'), icon: 'person' },
          { id: 'attendance', label: t('employees.tabs.attendance'), icon: 'event-available' },
          { id: 'tasks', label: t('employees.tabs.tasks'), icon: 'assignment' },
          { id: 'payroll', label: t('employees.tabs.payroll'), icon: 'payments' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => setActiveTab(tab.id)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={20}
              color={activeTab === tab.id ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === 'info' && (
          <>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <View style={[styles.avatarLarge, { overflow: 'hidden' }]}>
                  {employee.user_image ? (
                    <Image
                      source={{ uri: employee.user_image.startsWith('http') ? employee.user_image : `${apiClient.defaults.baseURL.replace('/api', '')}${employee.user_image}` }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <Text style={styles.avatarTextLarge}>{employee.user_name?.charAt(0)}</Text>
                  )}
                  {updatingPhoto && (
                    <View style={styles.avatarLoadingOverlay}>
                      <ActivityIndicator color={theme.colors.primary} />
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.cameraBadge} onPress={pickImage} disabled={updatingPhoto}>
                  <MaterialIcons name="photo-camera" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>

              <Text style={styles.name}>{employee.user_name}</Text>
              <Text style={styles.position}>{employee.position}</Text>

              <View style={[styles.statusBadge, { backgroundColor: employee.status === 'ACTIF' ? '#E8F5E9' : '#FFEBEE' }]}>
                <Text style={[styles.statusText, { color: employee.status === 'ACTIF' ? '#2E7D32' : '#C62828' }]}>
                  {employee.status}
                </Text>
              </View>
            </View>

            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.actionCircle} onPress={handleCall}>
                <MaterialIcons name="phone" size={28} color={theme.colors.success} />
                <Text style={styles.actionLabel}>{t('employees.actions.call')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCircle} onPress={() => setActiveTab('attendance')}>
                <MaterialIcons name="history" size={28} color={theme.colors.info} />
                <Text style={styles.actionLabel}>{t('employees.actions.track')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCircle} onPress={() => Alert.alert(t('employees.actions.contract'), `Salaire: ${formatCurrency(employee.salary)}\nRecruté le: ${employee.hired_at ? new Date(employee.hired_at).toLocaleDateString(currentLocale) : 'Inconnu'}`)}>
                <MaterialIcons name="description" size={28} color={theme.colors.primary} />
                <Text style={styles.actionLabel}>{t('employees.actions.contract')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCircle} onPress={handleDelete}>
                <MaterialIcons name="delete" size={28} color={theme.colors.danger} />
                <Text style={styles.actionLabel}>{t('employees.actions.delete')}</Text>
              </TouchableOpacity>
            </View>

            <Card style={styles.infoCard}>
              <Text style={styles.cardTitle}>{t('employees.sections.personalInfo')}</Text>
              <View style={styles.infoRow}>
                <MaterialIcons name="phone" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('employees.form.phone')}</Text>
                  <Text style={styles.infoValue}>{employee.user_phone || 'Non renseigné'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="email" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('common.email')}</Text>
                  <Text style={styles.infoValue}>{employee.user_email || 'Non renseigné'}</Text>
                </View>
              </View>
            </Card>

            <Card style={styles.infoCard}>
              <Text style={styles.cardTitle}>{t('employees.sections.jobDetails')}</Text>
              <View style={styles.infoRow}>
                <MaterialIcons name="business" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('employees.form.assignedFarm')}</Text>
                  <Text style={styles.infoValue}>{getFarmName()}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="layers" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('employees.form.assignedLots')}</Text>
                  <Text style={styles.infoValue}>
                    {employee.lots_detail && employee.lots_detail.length > 0
                      ? employee.lots_detail.map((l: any) => l.name).join(', ')
                      : 'Aucun lot affecté'}
                  </Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="payments" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('employees.form.salary')}</Text>
                  <Text style={styles.infoValue}>{formatCurrency(employee.salary)} ({employee.payment_frequency?.toLowerCase()})</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {activeTab === 'attendance' && (
          <View>
            <Text style={styles.cardTitle}>{t('employees.sections.attendanceHistory')}</Text>
            {attendance.length > 0 ? (
              attendance.map((att: any) => (
                <Card key={att.id} style={styles.historyItem}>
                  <View style={styles.historyDate}>
                    <Text style={styles.dateDay}>{new Date(att.date).getDate()}</Text>
                    <Text style={styles.dateMonth}>
                      {new Date(att.date).toLocaleDateString(currentLocale, { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyStatus}>{att.status.toUpperCase()}</Text>
                    {att.arrival_time && <Text style={styles.historyTime}>Arrivée: {att.arrival_time}</Text>}
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: att.status === 'PRESENT' ? '#4CAF50' : att.status === 'LATE' ? '#FF9800' : '#F44336' }]} />
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('employees.empty.attendance')}</Text>
            )}
          </View>
        )}

        {activeTab === 'tasks' && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m }}>
              <Text style={styles.cardTitle}>{t('employees.sections.tasksAssigned')}</Text>
              <TouchableOpacity
                style={styles.addTaskSmallBtn}
                onPress={() => navigation.navigate('CreateTask', { employeeId: employee.id })}
              >
                <MaterialIcons name="add" size={20} color={theme.colors.primary} />
                <Text style={styles.addTaskSmallText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
            {tasks.length > 0 ? (
              tasks.map((task: any) => (
                <Card key={task.id} style={styles.historyItem}>
                   <MaterialIcons
                    name={task.status === 'TERMINE' ? "check-circle" : "radio-button-unchecked"}
                    size={24}
                    color={task.status === 'TERMINE' ? '#4CAF50' : theme.colors.textSecondary}
                  />
                  <View style={[styles.historyDetails, { marginLeft: 12 }]}>
                    <Text style={[styles.taskTitle, task.status === 'TERMINE' && styles.completedTask]}>{task.title}</Text>
                    <Text style={styles.historyTime}>Échéance: {new Date(task.due_date).toLocaleDateString(currentLocale)}</Text>
                  </View>
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('employees.empty.tasks')}</Text>
            )}
          </View>
        )}

        {activeTab === 'payroll' && (
          <View>
            <Text style={styles.cardTitle}>{t('employees.sections.payrollHistory')}</Text>
            {payrolls.length > 0 ? (
              payrolls.map((pay: any) => (
                <Card key={pay.id} style={styles.historyItem}>
                  <View style={styles.historyDate}>
                    <MaterialIcons name="payments" size={24} color={theme.colors.primary} />
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyStatus}>{formatCurrency(pay.amount_paid)}</Text>
                    <Text style={styles.historyTime}>Payé le {new Date(pay.date).toLocaleDateString(currentLocale)}</Text>
                  </View>
                  <View style={[styles.paidBadge, { backgroundColor: theme.colors.success + '20' }]}>
                    <Text style={[styles.paidBadgeText, { color: theme.colors.success }]}>{pay.status}</Text>
                  </View>
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('employees.empty.payroll')}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
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
  editBtn: {
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
  profileHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: theme.spacing.m,
  },
  avatarLarge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 5,
    backgroundColor: '#333',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.background,
    zIndex: 10
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextLarge: { fontSize: 44, fontWeight: 'bold', color: theme.colors.primary },
  name: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  position: { fontSize: 16, color: theme.colors.textSecondary, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 12,
  },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.l,
  },
  actionCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 16,
    width: 90,
    ...theme.shadows.light,
  },
  actionLabel: { fontSize: 12, marginTop: 8, fontWeight: '600', color: theme.colors.text },
  infoCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  infoTextContainer: {
    marginLeft: theme.spacing.m,
  },
  infoLabel: { fontSize: 12, color: theme.colors.textSecondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '40',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
  },
  historyDate: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 45,
    marginRight: 15,
  },
  dateDay: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  dateMonth: { fontSize: 10, color: theme.colors.textSecondary, textTransform: 'uppercase' },
  historyDetails: { flex: 1 },
  historyStatus: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  historyTime: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  completedTask: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
  paidBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paidBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 },
  addTaskSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addTaskSmallText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginLeft: 4,
  }
});
