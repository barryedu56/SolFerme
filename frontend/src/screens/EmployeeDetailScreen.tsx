import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Linking, ActivityIndicator, Image, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { Card } from '../components/Card';
import { formatCurrency } from '../utils/formatters';
import { getProfileImageUrl } from '../utils/media';
import * as ImagePicker from 'expo-image-picker';
import { appendImageToFormData, MULTIPART_HEADERS } from '../utils/imageUpload';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const EmployeeDetailScreen = ({ route, navigation }: any) => {
  const { employeeId, farms } = route.params;
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop } = useBreakpoint();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme, isDesktop), [theme, isDesktop]);

  const [employee, setEmployee] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [attendanceFilter, setAttendanceFilter] = useState<'day' | 'week' | 'year' | 'all'>('all');
  const [bonusFilter, setBonusFilter] = useState<'all' | 'PERFORMANCE' | 'EXCEPTIONNEL' | 'AUTRE'>('all');
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [bonusSort, setBonusSort] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'type'>('date_desc');
  const currentLocale = activeLanguage === 'fr' ? 'fr-FR' : 'en-US';

  const fetchData = async () => {
    try {
      const [empRes, attRes, tasksRes, payRes, bonusRes, reqRes] = await Promise.all([
        repositoryProvider.api.get(`/employees/${employeeId}/`),
        repositoryProvider.api.get(`/attendances/?employee=${employeeId}`),
        repositoryProvider.api.get(`/tasks/?employee=${employeeId}`),
        repositoryProvider.api.get(`/payrolls/?employee=${employeeId}`),
        repositoryProvider.api.get(`/bonuses/?employee=${employeeId}`),
        repositoryProvider.api.get(`/employee-requests/?employee=${employeeId}`),
      ]);
      setEmployee(empRes.data);
      setAttendance(attRes.data);
      setTasks(tasksRes.data);
      setPayrolls(payRes.data);
      setBonuses(bonusRes.data);
      setRequests(reqRes.data);
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
      Alert.alert(t('common.info'), t('employees.messages.phoneNotAvailable'));
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
              await repositoryProvider.api.delete(`/employees/${employeeId}/`);
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
    return employee.farm_name || t('common.unknown');
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('employees.messages.photoPermission'));
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      handleUploadImage(result.assets[0]);
    }
  };

  const handleUploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setUpdatingPhoto(true);
      const formData = new FormData();
      appendImageToFormData(formData, asset, 'profile_image');

      await repositoryProvider.api.patch(`/users/${employee.user}/`, formData, {
        headers: MULTIPART_HEADERS,
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

  const getFrequencyLabel = (freq: string) => {
    if (!freq) return '';
    const map: Record<string, string> = {
      'MENSUEL':    t('employees.form.frequencies.monthly'),
      'SEMESTRIEL': t('employees.form.frequencies.semiAnnually'),
      'ANNUEL':     t('employees.form.frequencies.annually'),
    };
    return map[freq] || freq;
  };

  const getFilteredAttendance = () => {
    const now = new Date();
    return attendance.filter((att: any) => {
      const d = new Date(att.date);
      if (attendanceFilter === 'day') {
        return d.toDateString() === now.toDateString();
      } else if (attendanceFilter === 'week') {
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(now.getDate() - 7);
        return d >= oneWeekAgo;
      } else if (attendanceFilter === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true; // 'all'
    });
  };

  const getSortedAndFilteredBonuses = () => {
    let filtered = bonusFilter === 'all' ? bonuses : bonuses.filter((b: any) => b.bonus_type === bonusFilter);
    
    // Apply sorting
    return filtered.sort((a: any, b: any) => {
      switch (bonusSort) {
        case 'date_desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date_asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount_desc':
          return parseFloat(b.amount) - parseFloat(a.amount);
        case 'amount_asc':
          return parseFloat(a.amount) - parseFloat(b.amount);
        case 'type':
          return a.bonus_type.localeCompare(b.bonus_type);
        default:
          return 0;
      }
    });
  };

  const getFilteredRequests = () => {
    if (requestFilter === 'ALL') return requests;
    return requests.filter((r: any) => r.status === requestFilter);
  };

  const handleRequestAction = async (requestId: number, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' ? t('requests.confirmApprove') : t('requests.confirmReject');

    Alert.alert(
      t('common.confirm'),
      confirmMsg,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: action === 'approve' ? t('requests.approve') : t('requests.reject'),
          onPress: async () => {
            try {
              const endpoint = action === 'approve' ? 'approve' : 'reject';
              await repositoryProvider.api.post(`/employee-requests/${requestId}/${endpoint}/`);
              // Refresh requests
              const reqRes = await repositoryProvider.api.get(`/employee-requests/?employee=${employeeId}`);
              setRequests(reqRes.data);
            } catch (error) {
              console.log(`Erreur ${action} request:`, error);
              Alert.alert(t('common.error'), t('common.errorSave'));
            }
          }
        }
      ]
    );
  };

  const getRequestStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return theme.colors.success;
      case 'REJECTED': return theme.colors.danger;
      case 'PENDING': return theme.colors.warning;
      default: return theme.colors.textSecondary;
    }
  };

  const handleDeleteAttendance = (attId: number) => {
    Alert.alert(
      t('common.confirm') || 'Confirmation',
      t('employees.messages.deleteAttendanceConfirm') || 'Supprimer ce pointage ?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await repositoryProvider.api.delete(`/attendances/${attId}/`);
              setAttendance(prev => prev.filter((a: any) => a.id !== attId));
            } catch (e) {
              Alert.alert(t('common.error'), t('employees.messages.deleteError') || 'Impossible de supprimer.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('employees.detailTitle')}</Text>
        {isOwner ? (
          <TouchableOpacity onPress={() => navigation.navigate('EditEmployee', { employee, farms })} style={styles.editBtn}>
            <MaterialIcons name="edit" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.tabs}>
        {[
          { id: 'info', label: t('employees.tabs.profile'), icon: 'person' },
          { id: 'attendance', label: t('employees.tabs.attendance'), icon: 'event-available' },
          { id: 'tasks', label: t('employees.tabs.tasks'), icon: 'assignment' },
          { id: 'requests', label: t('requests.shortTitle') || 'Demandes', icon: 'message' },
          isOwner && { id: 'bonus', label: 'Primes', icon: 'star' },
          isOwner && { id: 'payroll', label: t('employees.tabs.payroll'), icon: 'payments' },
        ].filter(Boolean).map((tab: any) => (
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

      <ScrollView contentContainerStyle={[styles.scroll, styles.scrollDesktop]}>
        {activeTab === 'info' && (
          <>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <View style={[styles.avatarLarge, { overflow: 'hidden' }]}>
                  {employee.user_image && getProfileImageUrl(employee.user_image) ? (
                    <Image
                      source={{ uri: getProfileImageUrl(employee.user_image) || undefined }}
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

              {isOwner && (
                <>
                  <TouchableOpacity
                    style={styles.actionCircle}
                    onPress={() => Alert.alert(
                      t('employees.actions.contract'),
                      t('employees.messages.contractInfo', {
                        salary: formatCurrency(employee.salary),
                        date: employee.hired_at ? new Date(employee.hired_at).toLocaleDateString(currentLocale) : t('common.unknown')
                      })
                    )}
                  >
                    <MaterialIcons name="description" size={28} color={theme.colors.primary} />
                    <Text style={styles.actionLabel}>{t('employees.actions.contract')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionCircle} onPress={handleDelete}>
                    <MaterialIcons name="delete" size={28} color={theme.colors.danger} />
                    <Text style={styles.actionLabel}>{t('employees.actions.delete')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Card style={styles.infoCard}>
              <Text style={styles.cardTitle}>{t('employees.sections.personalInfo')}</Text>
              <View style={styles.infoRow}>
                <MaterialIcons name="phone" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('employees.form.phone')}</Text>
                  <Text style={styles.infoValue}>{employee.user_phone || t('common.noData')}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="email" size={20} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('common.email')}</Text>
                  <Text style={styles.infoValue}>{employee.user_email || t('common.noData')}</Text>
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
                      : t('employees.form.noLots')}
                  </Text>
                </View>
              </View>
              {isOwner && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="payments" size={20} color={theme.colors.primary} />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>{t('employees.form.salary')}</Text>
                    <Text style={styles.infoValue}>{formatCurrency(employee.salary)} ({getFrequencyLabel(employee.payment_frequency)})</Text>
                  </View>
                </View>
              )}
            </Card>

            {/* Section Rémunération (primes) */}
            {isOwner && (
              <Card style={styles.infoCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m }}>
                  <Text style={styles.cardTitle}>Rémunération</Text>
                  <TouchableOpacity
                    style={styles.addTaskSmallBtn}
                    onPress={() => navigation.navigate('CreateBonus', { employee })}
                  >
                    <MaterialIcons name="add" size={18} color={theme.colors.primary} />
                    <Text style={styles.addTaskSmallText}>Prime</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.remuRow}>
                  <View style={styles.remuItem}>
                    <Text style={styles.remuLabel}>Salaire de base</Text>
                    <Text style={styles.remuValue}>{formatCurrency(employee.salary)}</Text>
                  </View>
                  <View style={styles.remuItem}>
                    <Text style={styles.remuLabel}>Total primes</Text>
                    <Text style={[styles.remuValue, { color: theme.colors.success }]}>
                      +{formatCurrency(employee.bonus_total || 0)}
                    </Text>
                  </View>
                </View>
                {employee.last_bonus && (
                  <View style={[styles.lastBonusRow]}>
                    <MaterialIcons name="star" size={16} color={theme.colors.primary} />
                    <Text style={styles.lastBonusText}>
                      Dernière prime : {formatCurrency(employee.last_bonus.amount)} — {new Date(employee.last_bonus.date).toLocaleDateString(currentLocale)}
                    </Text>
                  </View>
                )}
                <View style={[styles.estimatedRow]}>
                  <Text style={styles.estimatedLabel}>Rémunération totale estimée</Text>
                  <Text style={styles.estimatedValue}>{formatCurrency(employee.estimated_total || employee.salary)}</Text>
                </View>
              </Card>
            )}
          </>
        )}

        {activeTab === 'attendance' && (
          <View>
            {/* Barre de filtres */}
            <View style={styles.filterBar}>
              {(['all', 'day', 'week', 'year'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, attendanceFilter === f && styles.filterChipActive]}
                  onPress={() => setAttendanceFilter(f)}
                >
                  <Text style={[styles.filterChipText, attendanceFilter === f && styles.filterChipTextActive]}>
                    {f === 'all'  ? 'Tout'
                     : f === 'day'  ? 'Jour'
                     : f === 'week' ? 'Semaine'
                     : 'Année'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Liste filtrée */}
            {getFilteredAttendance().length > 0 ? (
              getFilteredAttendance().map((att: any) => (
                <Card key={att.id} style={styles.historyItem}>
                  <View style={styles.historyDate}>
                    <Text style={styles.dateDay}>{new Date(att.date).getDate()}</Text>
                    <Text style={styles.dateMonth}>
                      {new Date(att.date).toLocaleDateString(currentLocale, { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyStatus}>{att.status.toUpperCase()}</Text>
                    {att.arrival_time && <Text style={styles.historyTime}>{t('common.morning')}: {att.arrival_time}</Text>}
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: att.status === 'PRESENT' ? '#4CAF50' : att.status === 'LATE' ? '#FF9800' : '#F44336', marginRight: 10 }]} />
                  {isOwner && (
                    <TouchableOpacity onPress={() => handleDeleteAttendance(att.id)} style={styles.deleteAttBtn}>
                      <MaterialIcons name="delete-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {attendance.length === 0
                  ? t('employees.empty.attendance')
                  : 'Aucun pointage pour cette période.'}
              </Text>
            )}
          </View>
        )}

        {activeTab === 'bonus' && (
          <View>
            {/* Header avec bouton ajouter */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m }}>
              <Text style={styles.cardTitle}>Historique des primes</Text>
              {isOwner && (
                <TouchableOpacity
                  style={styles.addTaskSmallBtn}
                  onPress={() => navigation.navigate('CreateBonus', { employee })}
                >
                  <MaterialIcons name="add" size={18} color={theme.colors.primary} />
                  <Text style={styles.addTaskSmallText}>Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Filtres par type */}
            <View style={styles.filterBar}>
              {[
                { key: 'all', label: 'Tout' },
                { key: 'PERFORMANCE', label: 'Performance' },
                { key: 'EXCEPTIONNEL', label: 'Exceptionnel' },
                { key: 'AUTRE', label: 'Autre' },
              ].map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, bonusFilter === f.key && styles.filterChipActive]}
                  onPress={() => setBonusFilter(f.key as any)}
                >
                  <Text style={[styles.filterChipText, bonusFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tri */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m }}>
              <MaterialIcons name="sort" size={16} color={theme.colors.textSecondary} />
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4 }}>Trier par:</Text>
              <TouchableOpacity
                style={[styles.sortChip, bonusSort === 'date_desc' && styles.sortChipActive]}
                onPress={() => setBonusSort('date_desc')}
              >
                <Text style={[styles.sortChipText, bonusSort === 'date_desc' && styles.sortChipTextActive]}>Plus récent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortChip, bonusSort === 'date_asc' && styles.sortChipActive]}
                onPress={() => setBonusSort('date_asc')}
              >
                <Text style={[styles.sortChipText, bonusSort === 'date_asc' && styles.sortChipTextActive]}>Plus ancien</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortChip, bonusSort === 'amount_desc' && styles.sortChipActive]}
                onPress={() => setBonusSort('amount_desc')}
              >
                <Text style={[styles.sortChipText, bonusSort === 'amount_desc' && styles.sortChipTextActive]}>Montant ↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortChip, bonusSort === 'amount_asc' && styles.sortChipActive]}
                onPress={() => setBonusSort('amount_asc')}
              >
                <Text style={[styles.sortChipText, bonusSort === 'amount_asc' && styles.sortChipTextActive]}>Montant ↑</Text>
              </TouchableOpacity>
            </View>

            {/* Liste des primes */}
            {getSortedAndFilteredBonuses().length > 0 ? (
              getSortedAndFilteredBonuses().map((bonus: any) => (
                <Card key={bonus.id} style={styles.historyItem}>
                  <View style={styles.bonusIconBox}>
                    <MaterialIcons
                      name={bonus.bonus_type === 'PERFORMANCE' ? 'trending-up' : bonus.bonus_type === 'EXCEPTIONNEL' ? 'star' : 'redeem'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.bonusTypeLabel}>{bonus.bonus_type_label}</Text>
                    <Text style={[styles.bonusAmount, bonus.status === 'ANNULEE' && { textDecorationLine: 'line-through', opacity: 0.5 }]}>
                      +{formatCurrency(bonus.amount)}
                    </Text>
                    <Text style={styles.historyTime}>
                      Attribuée le {new Date(bonus.date).toLocaleDateString(currentLocale)}
                    </Text>
                    {bonus.status === 'ANNULEE' && (
                      <Text style={[styles.bonusStatus, { color: theme.colors.danger }]}>🔴 ANNULÉE</Text>
                    )}
                    {bonus.reason ? (
                      <Text style={styles.bonusReason} numberOfLines={2}>{bonus.reason}</Text>
                    ) : null}
                  </View>
                  {isOwner && bonus.status !== 'ANNULEE' && (
                    <TouchableOpacity
                      style={styles.deleteAttBtn}
                      onPress={() => {
                        Alert.alert(
                          'Annuler la prime',
                          `Annuler la prime de ${formatCurrency(bonus.amount)} ?`,
                          [
                            { text: 'Annuler', style: 'cancel' },
                            {
                              text: 'Annuler',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await repositoryProvider.api.delete(`/bonuses/${bonus.id}/`);
                                  setBonuses(prev => prev.map((b: any) => b.id === bonus.id ? { ...b, status: 'ANNULEE' } : b));
                                } catch (e: any) {
                                  Alert.alert(t('common.error'), e.response?.data?.detail || 'Impossible d\'annuler cette prime.');
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="cancel" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {bonuses.length === 0 ? 'Aucune prime attribuée.' : 'Aucune prime pour ce filtre.'}
              </Text>
            )}
          </View>
        )}

        {activeTab === 'requests' && (
          <View>
            <View style={styles.filterBar}>
              {[
                { key: 'ALL', label: 'Toutes' },
                { key: 'PENDING', label: 'En attente' },
                { key: 'APPROVED', label: 'Acceptées' },
                { key: 'REJECTED', label: 'Refusées' },
              ].map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, requestFilter === f.key && styles.filterChipActive]}
                  onPress={() => setRequestFilter(f.key as any)}
                >
                  <Text style={[styles.filterChipText, requestFilter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {getFilteredRequests().length > 0 ? (
              getFilteredRequests().map((req: any) => (
                <Card key={req.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <View style={styles.typeContainer}>
                      <MaterialIcons
                        name={req.type === 'CONGE' ? 'beach-access' : req.type === 'MATERIEL' ? 'build' : 'info'}
                        size={20}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.requestType}>{t(`requests.types.${req.type}`)}</Text>
                    </View>
                    <View style={[styles.statusBadgeSmall, { backgroundColor: getRequestStatusColor(req.status) + '20' }]}>
                      <Text style={[styles.statusTextSmall, { color: getRequestStatusColor(req.status) }]}>
                        {t(`requests.${req.status.toLowerCase()}`)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.descriptionText}>{req.description}</Text>

                  <View style={styles.requestFooter}>
                    <View style={styles.footerInfo}>
                      <MaterialIcons name="event" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.footerText}>
                        {new Date(req.created_at).toLocaleDateString(currentLocale)}
                      </Text>
                    </View>
                  </View>

                  {isOwner && req.status === 'PENDING' && (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionBtnSmall, { backgroundColor: theme.colors.success + '20' }]}
                        onPress={() => handleRequestAction(req.id, 'approve')}
                      >
                        <MaterialIcons name="check" size={18} color={theme.colors.success} />
                        <Text style={[styles.actionTextSmall, { color: theme.colors.success }]}>{t('requests.approve')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtnSmall, { backgroundColor: theme.colors.danger + '20' }]}
                        onPress={() => handleRequestAction(req.id, 'reject')}
                      >
                        <MaterialIcons name="close" size={18} color={theme.colors.danger} />
                        <Text style={[styles.actionTextSmall, { color: theme.colors.danger }]}>{t('requests.reject')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              ))
            ) : (
              <Text style={styles.emptyText}>Aucune demande trouvée.</Text>
            )}
          </View>
        )}

        {activeTab === 'tasks' && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.m }}>
              <Text style={styles.cardTitle}>{t('employees.sections.tasksAssigned')}</Text>
              {isOwner && (
                <TouchableOpacity
                  style={styles.addTaskSmallBtn}
                  onPress={() => navigation.navigate('CreateTask', { employeeId: employee.id })}
                >
                  <MaterialIcons name="add" size={20} color={theme.colors.primary} />
                  <Text style={styles.addTaskSmallText}>{t('common.add')}</Text>
                </TouchableOpacity>
              )}
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
                    <Text style={styles.historyTime}>{t('tasks.form.dueDate')}: {new Date(task.due_date).toLocaleDateString(currentLocale)}</Text>
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
                <Card key={pay.id} style={[styles.historyItem, pay.status === 'ANNULEE' && { opacity: 0.6 }]}>
                  <View style={styles.historyDate}>
                    <MaterialIcons name="payments" size={24} color={pay.status === 'ANNULEE' ? '#999' : theme.colors.primary} />
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={[styles.historyStatus, pay.status === 'ANNULEE' && { textDecorationLine: 'line-through' }]}>
                      {formatCurrency(pay.amount_paid)}
                    </Text>
                    <Text style={styles.historyTime}>{t('profile.paidOn')} {new Date(pay.date).toLocaleDateString(currentLocale)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[styles.paidBadge, { backgroundColor: pay.status === 'ANNULEE' ? '#FFEBEE' : theme.colors.success + '20' }]}>
                      <Text style={[styles.paidBadgeText, { color: pay.status === 'ANNULEE' ? '#C62828' : theme.colors.success }]}>
                        {pay.status === 'ANNULEE' ? t('common.cancelled') : pay.status}
                      </Text>
                    </View>
                    {pay.status === 'ACTIF' && (
                      <TouchableOpacity
                        onPress={() => {
                          const title = t('employees.messages.cancelSalaryTitle');
                          const msg = t('employees.messages.cancelSalaryMsg');
                          
                          const executeCancel = async () => {
                            try {
                              setLoading(true);
                              await repositoryProvider.api.delete(`/payrolls/${pay.id}/`);
                              fetchData();
                              if (Platform.OS === 'web') {
                                window.alert(t('employees.messages.cancelSalarySuccess'));
                              } else {
                                Alert.alert(t('common.success'), t('employees.messages.cancelSalarySuccess'));
                              }
                            } catch (error) {
                              if (Platform.OS === 'web') {
                                window.alert(t('employees.messages.cancelSalaryError'));
                              } else {
                                Alert.alert(t('common.error'), t('employees.messages.cancelSalaryError'));
                              }
                            } finally {
                              setLoading(false);
                            }
                          };

                          if (Platform.OS === 'web') {
                            if (window.confirm(`${title}\n\n${msg}`)) {
                              executeCancel();
                            }
                          } else {
                            Alert.alert(
                              title,
                              msg,
                              [
                                { text: t('common.no'), style: "cancel" },
                                {
                                  text: t('finance.yesCancel'),
                                  style: "destructive",
                                  onPress: executeCancel
                                }
                              ]
                            );
                          }
                        }}
                        style={{ marginTop: 5 }}
                      >
                        <Text style={{ fontSize: 10, color: theme.colors.danger, fontWeight: 'bold' }}>{t('common.cancel').toUpperCase()}</Text>
                      </TouchableOpacity>
                    )}
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

const createStyles = (theme: any, isDesktop: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
    maxWidth: 1000,
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
  scrollDesktop: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.l,
    paddingTop: theme.spacing.s,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: theme.spacing.m,
  },
  avatarLarge: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: theme.colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.surface,
    ...theme.shadows.medium,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: theme.colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.background,
    zIndex: 10,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextLarge: { fontSize: 40, fontWeight: '800', color: theme.colors.primary },
  name: { fontSize: 22, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.2 },
  position: { fontSize: 14.5, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '600' },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 12,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.l,
  },
  actionCircle: {
    alignItems: 'center',
    gap: 7,
    backgroundColor: theme.colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    width: 96,
    ...theme.shadows.light,
  },
  actionLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  infoCard: {
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.m,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: theme.spacing.m, textTransform: 'uppercase', letterSpacing: 0.6 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  infoTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: theme.colors.primary + '18',
  },
  tabLabel: {
    fontSize: 9.5,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  activeTabLabel: {
    color: theme.colors.primary,
    fontWeight: '800',
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
  },
  filterBar: {
    flexDirection: 'row',
    marginBottom: theme.spacing.m,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#000',
  },
  deleteAttBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.danger + '12',
  },
  remuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s,
  },
  remuItem: {
    flex: 1,
  },
  remuLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  remuValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  lastBonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.s,
    paddingTop: theme.spacing.s,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border,
  },
  lastBonusText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  estimatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.m,
    paddingTop: theme.spacing.m,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primary,
  },
  estimatedLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  estimatedValue: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.primary,
  },
  bonusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bonusTypeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  bonusAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.success,
    marginTop: 2,
  },
  bonusReason: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  bonusStatus: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    marginLeft: 6,
  },
  sortChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  sortChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  sortChipTextActive: {
    color: '#000',
  },
  requestCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginLeft: 8,
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTextSmall: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  descriptionText: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 10,
    lineHeight: 18,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border + '50',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionBtnSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  actionTextSmall: {
    fontWeight: 'bold',
    fontSize: 12,
  },
});