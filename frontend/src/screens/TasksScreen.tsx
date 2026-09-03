import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { useAutoRefreshData } from '../hooks/useDataChange';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { Screen, ScreenHeader, useContentWidth, Card, Badge, EmptyState, space, radius } from '../components/ui';

export const TasksScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole !== 'EMPLOYE';
  const { isDesktop, isTablet } = useBreakpoint();
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');
  const S = useMemo(() => createStyles(theme), [theme]);

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [taskDetails, setTaskDetails] = useState<any>(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/tasks/');
      setTasks(Array.isArray(response.data) ? response.data : response.data?.results || []);
    } catch (error) {
      console.log('Erreur fetch tasks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useAutoRefreshData(['tasks'], fetchTasks, 150);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => fetchTasks());
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const statusColor = (status: string) =>
    status === 'COMPLETED' ? '#2E7D32' : status === 'OVERDUE' ? theme.colors.danger : '#F57C00';

  const handleToggleTask = (task: any) => {
    if (task.status === 'COMPLETED') return;
    const msg = `${t('common.confirm')} : ${task.title}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('tasks.completeTask')}\n\n${msg}`)) performCompleteTask(task);
      return;
    }
    Alert.alert(t('tasks.completeTask'), msg, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => performCompleteTask(task) },
    ]);
  };

  const performCompleteTask = async (task: any) => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.post(`/tasks/${task.id}/complete/`, { comment: '' });
      setTasks((prev: any) => prev.map((x: any) => (x.id === task.id ? response.data : x)));
    } catch (error: any) {
      const message = getErrorMessage(error, t('tasks.updateError'));
      if (Platform.OS === 'web') toast.error(t('common.error'), message);
      else Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleShowDetails = (task: any) => { setTaskDetails(task); setDetailsModalVisible(true); };

  const renderItem = ({ item }: { item: any }) => {
    const done = item.status === 'COMPLETED';
    const col = statusColor(item.status);
    return (
      <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
        <Pressable onPress={() => handleShowDetails(item)}>
          <Card style={[S.card, done && { opacity: 0.72 }]}>
            <View style={S.top}>
              <Pressable onPress={() => handleToggleTask(item)} disabled={done} hitSlop={8}>
                <MaterialIcons
                  name={done ? 'check-circle' : 'radio-button-unchecked'}
                  size={24}
                  color={done ? '#2E7D32' : theme.colors.primary}
                />
              </Pressable>
              <Text style={[S.title, { color: theme.colors.text }, done && S.done]} numberOfLines={2}>{item.title}</Text>
              <Badge label={t(`tasks.${item.status.toLowerCase()}`)} color={col} />
            </View>

            {!!item.description && <Text style={S.desc} numberOfLines={2}>{item.description}</Text>}

            {item.lot_name ? (
              <View style={[S.lot, { backgroundColor: theme.colors.primary + '14' }]}>
                <MaterialCommunityIcons name="layers-triple" size={13} color={theme.colors.primary} />
                <Text style={[S.lotText, { color: theme.colors.primary }]}>{item.lot_name}</Text>
              </View>
            ) : null}

            {item.completion_comment ? (
              <View style={[S.comment, { backgroundColor: theme.colors.background }]}>
                <MaterialIcons name="chat-bubble-outline" size={13} color={theme.colors.textSecondary} />
                <Text style={S.commentText} numberOfLines={1}>{item.completion_comment}</Text>
              </View>
            ) : null}

            <View style={[S.footer, { borderTopColor: theme.colors.border }]}>
              <View style={S.fItem}><MaterialIcons name="person-outline" size={13} color={theme.colors.textSecondary} /><Text style={S.fText}>{item.employee_name}</Text></View>
              <View style={S.fItem}><MaterialIcons name="event" size={13} color={theme.colors.textSecondary} /><Text style={S.fText}>
                {new Date(item.due_date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
              </Text></View>
            </View>
          </Card>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('tasks.title')}
          onBack={() => navigation.goBack()}
          actions={isOwner ? [{ icon: 'add-task', onPress: () => navigation.navigate('CreateTask'), tint: theme.colors.text }] : []}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          key={numColumns}
          data={tasks}
          numColumns={numColumns}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="clipboard-check-outline" title={t('tasks.noTasks')} />}
        />
      )}

      <Modal animationType="fade" transparent visible={detailsModalVisible} onRequestClose={() => setDetailsModalVisible(false)}>
        <View style={S.overlay}>
          <View style={[S.modal, { backgroundColor: theme.colors.surface }]}>
            <View style={[S.modalHead, { borderBottomColor: theme.colors.border }]}>
              <Text style={[S.modalTitle, { color: theme.colors.text }]}>{t('common.details')}</Text>
              <Pressable onPress={() => setDetailsModalVisible(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
              <Field label={t('common.title')} value={taskDetails?.title} theme={theme} />
              <Field label={t('common.description')} value={taskDetails?.description || t('common.noDescription')} theme={theme} />
              {taskDetails?.lot_name && <Field label={t('farms.lot')} value={taskDetails?.lot_name} theme={theme} />}
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.dLabel, { color: theme.colors.textSecondary }]}>{t('common.status')}</Text>
                  {taskDetails && <Badge label={t(`tasks.${taskDetails.status.toLowerCase()}`)} color={statusColor(taskDetails.status)} />}
                </View>
                <Field label={t('tasks.dueDate')} value={taskDetails && new Date(taskDetails.due_date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')} theme={theme} style={{ flex: 1 }} />
              </View>
              {taskDetails?.completion_comment && (
                <View style={[S.comment, { backgroundColor: theme.colors.background }]}>
                  <MaterialIcons name="chat-bubble-outline" size={13} color={theme.colors.textSecondary} />
                  <Text style={[S.commentText, { fontStyle: 'italic' }]}>{taskDetails.completion_comment}</Text>
                </View>
              )}
              <Button title={t('common.close')} onPress={() => setDetailsModalVisible(false)} style={{ marginTop: 6 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const Field = ({ label, value, theme, style }: any) => (
  <View style={style}>
    <Text style={[fieldStyles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
    <Text style={[fieldStyles.value, { color: theme.colors.text }]}>{value}</Text>
  </View>
);
const fieldStyles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  value: { fontSize: 15, fontWeight: '600' },
});

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: 0, borderRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontSize: 15.5, fontWeight: '800' },
  done: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
  desc: { fontSize: 13.5, color: theme.colors.textSecondary, marginTop: space.xs },
  lot: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, marginTop: space.xs },
  lotText: { fontSize: 12, fontWeight: '800' },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radius.sm, marginTop: space.xs, borderLeftWidth: 3, borderLeftColor: '#2E7D32' },
  commentText: { flex: 1, fontSize: 12.5, color: theme.colors.text },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  fItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: radius.xl, width: '100%', maxWidth: 500, maxHeight: '82%', overflow: 'hidden' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  dLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
});
