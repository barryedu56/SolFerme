import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, useWindowDimensions, Modal, ScrollView, Alert } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useAutoRefreshData } from '../hooks/useDataChange';

export const TasksScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const { userRole } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Details Modal State
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [taskDetails, setTaskDetails] = useState<any>(null);

  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const numColumns = isTablet ? 2 : 1;

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/tasks/');
      setTasks(response.data);
    } catch (error) {
      console.log('Erreur fetch tasks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useAutoRefreshData(['tasks'], fetchTasks, 150);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTasks();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTasks();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return theme.colors.success;
      case 'PENDING': return theme.colors.warning;
      case 'OVERDUE': return theme.colors.danger;
      default: return theme.colors.textSecondary;
    }
  };

  const handleToggleTask = (task: any) => {
    if (task.status === 'COMPLETED') {
      return;
    }

    Alert.alert(
      t('tasks.completeTask'),
      `${t('common.confirm')} : ${task.title}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: () => performCompleteTask(task)
        }
      ]
    );
  };

  const performCompleteTask = async (task: any) => {
    setLoading(true);
    const commentData = { comment: '' };
    try {
      const response = await repositoryProvider.api.post(`/tasks/${task.id}/complete/`, commentData);
      setTasks((prev: any) =>
        prev.map((t: any) => t.id === task.id ? response.data : t)
      );
    } catch (error: any) {
      console.log('Erreur complete task:', error);
      Alert.alert(t('common.error'), t('tasks.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const handleShowDetails = (task: any) => {
    setTaskDetails(task);
    setDetailsModalVisible(true);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={isTablet ? styles.tabletCardContainer : null}>
      <TouchableOpacity onPress={() => handleShowDetails(item)} activeOpacity={0.7}>
        <Card style={[styles.taskCard, item.status === 'COMPLETED' && { opacity: 0.7 }]}>
          <View style={styles.taskHeader}>
            <View style={styles.titleRow}>
              <TouchableOpacity
                onPress={() => handleToggleTask(item)}
                disabled={item.status === 'COMPLETED'}
              >
                <MaterialIcons
                  name={item.status === 'COMPLETED' ? "check-box" : "check-box-outline-blank"}
                  size={24}
                  color={item.status === 'COMPLETED' ? theme.colors.success : theme.colors.primary}
                />
              </TouchableOpacity>
              <Text style={[styles.taskTitle, item.status === 'COMPLETED' && styles.completedText]}>
                {item.title}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {t(`tasks.${item.status.toLowerCase()}`)}
              </Text>
            </View>
          </View>
          <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>

          {item.lot_name ? (
            <View style={styles.lotInfo}>
               <MaterialIcons name="layers" size={14} color={theme.colors.primary} />
               <Text style={styles.lotText}>{item.lot_name}</Text>
            </View>
          ) : null}

          {item.completion_comment ? (
            <View style={styles.commentBox}>
              <MaterialIcons name="comment" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.commentText} numberOfLines={1}>{item.completion_comment}</Text>
            </View>
          ) : null}

          <View style={styles.taskFooter}>
            <View style={styles.footerItem}>
              <MaterialIcons name="person" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.footerText}>{item.employee_name}</Text>
            </View>
            <View style={styles.footerItem}>
              <MaterialIcons name="event" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.footerText}>
                  {new Date(item.due_date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('tasks.title')}</Text>
        </View>
        {userRole !== 'EMPLOYE' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateTask')}
          >
            <MaterialIcons name="add-task" size={24} color="#000000" />
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
          data={tasks}
          numColumns={numColumns}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          columnWrapperStyle={isTablet ? styles.columnWrapper : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchTasks} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-check-outline"
              title={t('tasks.noTasks')}
            />
          }
        />
      )}

      {/* Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={detailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.details')}</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
               <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('common.title')}</Text>
                  <Text style={styles.detailValue}>{taskDetails?.title}</Text>
               </View>

               <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('common.description')}</Text>
                  <Text style={styles.detailValue}>{taskDetails?.description || t('common.noDescription')}</Text>
               </View>

               {taskDetails?.lot_name && (
                 <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('farms.lot')}</Text>
                    <View style={styles.row}>
                       <MaterialIcons name="layers" size={16} color={theme.colors.primary} />
                       <Text style={[styles.detailValue, { marginLeft: 8 }]}>{taskDetails?.lot_name}</Text>
                    </View>
                 </View>
               )}

               <View style={styles.row}>
                  <View style={[styles.detailItem, { flex: 1 }]}>
                    <Text style={styles.detailLabel}>{t('common.status')}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(taskDetails?.status) + '20', alignSelf: 'flex-start' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(taskDetails?.status) }]}>
                          {taskDetails && t(`tasks.${taskDetails.status.toLowerCase()}`)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.detailItem, { flex: 1 }]}>
                    <Text style={styles.detailLabel}>{t('tasks.dueDate')}</Text>
                    <Text style={styles.detailValue}>
                        {taskDetails && new Date(taskDetails.due_date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US')}
                    </Text>
                  </View>
               </View>

               {taskDetails?.completion_comment && (
                 <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('tasks.comment')}</Text>
                    <View style={styles.commentBox}>
                      <MaterialIcons name="comment" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.commentText}>{taskDetails.completion_comment}</Text>
                    </View>
                 </View>
               )}

               <Button
                title={t('common.close')}
                onPress={() => setDetailsModalVisible(false)}
                style={{ marginTop: 10 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
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
  title: { fontSize: 24, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
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
  list: {
    padding: theme.spacing.m,
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%'
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  tabletCardContainer: {
    flex: 0.49,
  },
  taskCard: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface
  },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  completedText: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
  taskTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginLeft: 8 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: theme.colors.border
  },
  statusText: { fontSize: 10, fontWeight: '900' },
  lotInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: theme.colors.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  lotText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
    marginLeft: 4
  },
  taskDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12, fontWeight: '600' },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success
  },
  commentText: {
    fontSize: 13,
    color: theme.colors.text,
    marginLeft: 8,
    fontStyle: 'italic',
    flex: 1
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.s,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border + '40'
  },
  footerItem: { flexDirection: 'row', alignItems: 'center' },
  footerText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 16, color: theme.colors.textSecondary },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    ...theme.shadows.large,
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'uppercase'
  },
  modalBody: {
    padding: 20
  },
  taskSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4
  },
  taskSummaryDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 20
  },
  commentInput: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12
  },
  confirmButton: {
    marginTop: 10
  },
  detailItem: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  detailValue: {
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '600'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center'
  }
});