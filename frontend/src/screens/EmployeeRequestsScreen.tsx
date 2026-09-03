import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, Modal, ScrollView, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { Screen, ScreenHeader, useContentWidth, Card, Badge, EmptyState, Chip, space, radius } from '../components/ui';

export const EmployeeRequestsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const S = useMemo(() => createStyles(theme), [theme]);
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    const unsubscribe = navigation.addListener('focus', () => { fetchRequests(); });
    return unsubscribe;
  }, [navigation]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      if (Platform.OS === 'web') toast.error(t('common.error'), t('auth.fillRequired'));
      else Alert.alert(t('common.error'), t('auth.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const requestData = { type: requestType, description };
      await repositoryProvider.api.post('/employee-requests/', requestData);
      if (Platform.OS === 'web') toast.success(t('common.success'), t('requests.success'));
      else Alert.alert(t('common.success'), t('requests.success'));
      setModalVisible(false);
      setDescription('');
      setRequestType('CONGE');
      fetchRequests();
    } catch (error: any) {
      console.log('Erreur creation request:', error);
      const message = getErrorMessage(error, t('requests.error'));
      if (Platform.OS === 'web') toast.error(t('common.error'), message);
      else Alert.alert(t('common.error'), message);
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
      } catch (error: any) {
        console.log(`Erreur ${action} request:`, error);
        const message = getErrorMessage(error, t('common.errorSave'));
        if (Platform.OS === 'web') toast.error(t('common.error'), message);
        else Alert.alert(t('common.error'), message);
      }
    };
    if (typeof window !== 'undefined') {
      if (window.confirm(confirmMsg)) await executeAction();
      return;
    }
    Alert.alert(t('common.confirm'), confirmMsg, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: action === 'approve' ? t('requests.approve') : t('requests.reject'), onPress: executeAction },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return '#2E7D32';
      case 'REJECTED': return theme.colors.danger;
      case 'PENDING': return '#F57C00';
      default: return theme.colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
      <Card style={S.card}>
        <View style={S.head}>
          <View style={S.typeRow}>
            <MaterialIcons name={item.type === 'CONGE' ? 'beach-access' : item.type === 'MATERIEL' ? 'build' : 'info'} size={19} color={theme.colors.primary} />
            <Text style={[S.type, { color: theme.colors.text }]}>{t(`requests.types.${item.type}`)}</Text>
          </View>
          <Badge label={t(`requests.${item.status}`)} color={getStatusColor(item.status)} />
        </View>

        <Text style={[S.desc, { color: theme.colors.text }]}>{item.description}</Text>

        <View style={[S.footer, { borderTopColor: theme.colors.border }]}>
          <View style={S.fInfo}><MaterialIcons name="person" size={13} color={theme.colors.textSecondary} /><Text style={S.fText}>{item.employee_name}</Text></View>
          <View style={S.fInfo}><MaterialIcons name="event" size={13} color={theme.colors.textSecondary} /><Text style={S.fText}>
            {new Date(item.created_at).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
          </Text></View>
        </View>

        {userRole !== 'EMPLOYE' && item.status === 'PENDING' && (
          <View style={[S.actions, { borderTopColor: theme.colors.border }]}>
            <Pressable style={[S.actBtn, { backgroundColor: '#2E7D32' + '18' }]} onPress={() => handleAction(item.id, 'approve')}>
              <MaterialIcons name="check" size={18} color="#2E7D32" />
              <Text style={[S.actText, { color: '#2E7D32' }]}>{t('requests.approve')}</Text>
            </Pressable>
            <Pressable style={[S.actBtn, { backgroundColor: theme.colors.danger + '18' }]} onPress={() => handleAction(item.id, 'reject')}>
              <MaterialIcons name="close" size={18} color={theme.colors.danger} />
              <Text style={[S.actText, { color: theme.colors.danger }]}>{t('requests.reject')}</Text>
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title={userRole === 'EMPLOYE' ? t('requests.title') : t('requests.manageTitle')}
          onBack={() => navigation.goBack()}
          actions={userRole === 'EMPLOYE' ? [{ icon: 'add', onPress: () => setModalVisible(true), tint: theme.colors.text }] : []}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={S.center}><Text style={{ color: theme.colors.textSecondary }}>…</Text></View>
      ) : (
        <FlatList
          key={numColumns}
          data={requests}
          numColumns={numColumns}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRequests} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="inbox-outline" title={t('requests.noRequests')} />}
        />
      )}

      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={S.overlay}>
          <View style={[S.modal, { backgroundColor: theme.colors.surface }]}>
            <View style={[S.modalHead, { borderBottomColor: theme.colors.border }]}>
              <Text style={[S.modalTitle, { color: theme.colors.text }]}>{t('requests.newRequest')}</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={8}><MaterialIcons name="close" size={22} color={theme.colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: space.lg }}>
              <Text style={[S.label, { color: theme.colors.text }]}>{t('requests.type')}</Text>
              <View style={S.typeSelector}>
                {REQUEST_TYPES.map((type) => (
                  <Chip key={type} label={t(`requests.types.${type}`)} active={requestType === type} onPress={() => setRequestType(type)} />
                ))}
              </View>
              <Input
                label={t('requests.description')}
                placeholder={t('requests.form.descPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                style={{ height: 120, textAlignVertical: 'top' }}
              />
              <Button title={t('common.save')} onPress={handleSubmit} loading={submitting} style={{ marginTop: space.lg, height: 54 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: { marginBottom: 0, borderRadius: radius.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  type: { fontSize: 15, fontWeight: '800' },
  desc: { fontSize: 14, marginBottom: space.sm, fontWeight: '500', lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  fInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' },
  actions: { flexDirection: 'row', marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, gap: space.sm },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.sm, gap: 4 },
  actText: { fontWeight: '800', fontSize: 13 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, minHeight: '55%', maxHeight: '88%', paddingBottom: space.lg, alignSelf: 'center', width: '100%', maxWidth: 640 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '900', textTransform: 'uppercase' },
  label: { fontSize: 12, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.lg },
});
