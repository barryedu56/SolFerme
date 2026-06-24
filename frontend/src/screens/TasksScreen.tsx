import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export const TasksScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const numColumns = isTablet ? 2 : 1;

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/tasks/');
      setTasks(response.data);
    } catch (error) {
      console.log('Erreur fetch tasks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
      case 'TERMINE': return theme.colors.success;
      case 'EN_COURS': return theme.colors.warning;
      default: return theme.colors.textSecondary;
    }
  };

  const toggleTaskStatus = async (task: any) => {
    const newStatus = task.status === 'TERMINE' ? 'A_FAIRE' : 'TERMINE';
    try {
      await apiClient.patch(`/tasks/${task.id}/`, { status: newStatus });
      setTasks((prev: any) =>
        prev.map((t: any) => t.id === task.id ? { ...t, status: newStatus } : t)
      );
    } catch (error) {
      console.log('Erreur update task:', error);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={isTablet ? styles.tabletCardContainer : null}>
      <Card style={[styles.taskCard, item.status === 'TERMINE' && { opacity: 0.7 }]}>
        <View style={styles.taskHeader}>
          <View style={styles.titleRow}>
            <TouchableOpacity onPress={() => toggleTaskStatus(item)}>
              <MaterialIcons
                name={item.status === 'TERMINE' ? "check-box" : "check-box-outline-blank"}
                size={24}
                color={item.status === 'TERMINE' ? theme.colors.success : theme.colors.primary}
              />
            </TouchableOpacity>
            <Text style={[styles.taskTitle, item.status === 'TERMINE' && styles.completedText]}>
              {item.title}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {t(`tasks.${item.status.toLowerCase().replace('_', '')}`)}
            </Text>
          </View>
        </View>
        <Text style={styles.taskDesc}>{item.description}</Text>
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateTask')}
        >
          <MaterialIcons name="add-task" size={24} color={theme.colors.text} />
        </TouchableOpacity>
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
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('tasks.noTasks')}</Text>
            </View>
          }
        />
      )}
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
    ...theme.shadows.light,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
  taskCard: { marginBottom: theme.spacing.m, padding: theme.spacing.m },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  completedText: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
  taskTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginLeft: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  taskDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12 },
  taskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerItem: { flexDirection: 'row', alignItems: 'center' },
  footerText: { fontSize: 12, color: theme.colors.textSecondary, marginLeft: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { fontSize: 16, color: theme.colors.textSecondary },
});
