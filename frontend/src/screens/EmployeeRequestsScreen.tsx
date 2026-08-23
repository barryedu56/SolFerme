import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const EmployeeRequestsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet, isDesktopOrTablet), [theme, isDesktop, isTablet, isDesktopOrTablet]);

  const numColumns = isDesktop ? 3 : (isTablet ? 2 : 1);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // New Request Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [requestType, setRequestType] = useState('CONGE');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const REQUEST_TYPES = ['CONGE', 'PERMISSION', 'MATERIEL', 'PROBLEME_ELEVAGE', 'AUTRE'];

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/employee-requests/');
      setRequests(response.data);
    } catch (error) {
      console.log('Erreur fetch requests:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchRequests();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert(t('common.error'), t('auth.fillRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const requestData = {
        type: requestType,
        description: description,
      };

      // Si hors-ligne, on ajoute à la queue et on enregistre localement
      try {
        await repositoryProvider.api.post('/employee-requests/', requestData);
        Alert.alert(t('common.success'), t('requests.success'));
      } catch (error: any) {
        console.log('Erreur creation request:', error);
        Alert.alert(t('common.error'), t('requests.error'));
      }

      setModalVisible(false);
      setDescription('');
      setRequestType('CONGE');
      fetchRequests();
    } catch (error) {
      console.log('Erreur creation request:', error);
      Alert.alert(t('common.error'), t('requests.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (requestId: number, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' ? t('requests.confirmApprove') : t('requests.confirmReject');

    const executeAction = async () => {
      try {
        const endpoint = action === 'approve' ? 'approve' : 'reject';
        await repositoryProvider.api.post(`/employee-requests/${requestId}/${endpoint}/`);
        fetchRequests();
      } catch (error) {
        console.log(`Erreur ${action} request:`, error);
        Alert.alert(t('common.error'), t('common.errorSave'));
      }
    };

    // Web: utiliser window.confirm()
    if (typeof window !== 'undefined') {
      if (window.confirm(confirmMsg)) {
        await executeAction();
      }
      return;
    }

    // Mobile: utiliser Alert.alert()
    Alert.alert(
      t('common.confirm'),
      confirmMsg,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: action === 'approve' ? t('requests.approve') : t('requests.reject'),
          onPress: executeAction
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return theme.colors.success;
      case 'REJECTED': return theme.colors.danger;
      case 'PENDING': return theme.colors.warning;
      default: return theme.colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={isDesktopOrTablet ? styles.tabletCardContainer : null}>
    <Card style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.typeContainer}>
          <MaterialIcons
            name={item.type === 'CONGE' ? 'beach-access' : item.type === 'MATERIEL' ? 'build' : 'info'}
            size={20}
            color={theme.colors.primary}
          />
          <Text style={styles.requestType}>{t(`requests.types.${item.type}`)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {t(`requests.${item.status}`)}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{item.description}</Text>

      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <MaterialIcons name="person" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.footerText}>{item.employee_name}</Text>
        </View>
        <View style={styles.footerInfo}>
          <MaterialIcons name="event" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.footerText}>
            {new Date(item.created_at).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
          </Text>
        </View>
      </View>

      {userRole !== 'EMPLOYE' && item.status === 'PENDING' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.success + '20' }]}
            onPress={() => handleAction(item.id, 'approve')}
          >
            <MaterialIcons name="check" size={20} color={theme.colors.success} />
            <Text style={[styles.actionText, { color: theme.colors.success }]}>{t('requests.approve')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.danger + '20' }]}
            onPress={() => handleAction(item.id, 'reject')}
          >
            <MaterialIcons name="close" size={20} color={theme.colors.danger} />
            <Text style={[styles.actionText, { color: theme.colors.danger }]}>{t('requests.reject')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{userRole === 'EMPLOYE' ? t('requests.title') : t('requests.manageTitle')}</Text>
        </View>
        {userRole === 'EMPLOYE' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <MaterialIcons name="add" size={24} color="#000000" />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={requests}
          numColumns={numColumns}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, isDesktopOrTablet && styles.listDesktop]}
          columnWrapperStyle={isDesktopOrTablet ? styles.columnWrapper : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRequests} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('requests.noRequests')}</Text>
            </View>
          }
        />
      )}

      {/* New Request Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('requests.newRequest')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.label}>{t('requests.type')}</Text>
              <View style={styles.typeSelector}>
                {REQUEST_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      requestType === type && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                    ]}
                    onPress={() => setRequestType(type)}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      requestType === type && { color: theme.colors.text, fontWeight: 'bold' }
                    ]}>
                      {t(`requests.types.${type}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label={t('requests.description')}
                placeholder={t('requests.form.descPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                style={styles.textArea}
              />

              <Button
                title={t('common.save')}
                onPress={handleSubmit}
                loading={submitting}
                style={styles.submitButton}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false, isTablet: boolean = false, isDesktopOrTablet: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%'
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
  },
  list: { padding: theme.spacing.m, maxWidth: 800, alignSelf: 'center', width: '100%' },
  listDesktop: {
    maxWidth: 1000,
  },
  columnWrapper: { gap: theme.spacing.m, justifyContent: 'flex-start' },
  tabletCardContainer: { flex: 1 },
  requestCard: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeContainer: { flexDirection: 'row', alignItems: 'center' },
  requestType: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginLeft: 8 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  description: { fontSize: 14, color: theme.colors.text, marginBottom: 16, fontWeight: '500', lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border + '40',
  },
  footerInfo: { flexDirection: 'row', alignItems: 'center' },
  footerText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border + '40',
    paddingTop: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionText: { fontWeight: '900', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 16, color: theme.colors.textSecondary },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: '60%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  modalBody: { padding: 24 },
  label: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: 8, textTransform: 'uppercase' },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  typeButtonText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  submitButton: { marginTop: 20, height: 56 },
});