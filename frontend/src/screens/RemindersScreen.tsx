import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cancelNotification } from '../utils/notifications';
import { syncReminders } from '../utils/reminderSync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBreakpoint } from '../hooks/useBreakpoint';

export const RemindersScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { t, language } = useTranslation();
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');

  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();
  const numColumns = isDesktop ? 3 : (isTablet ? 2 : 1);
  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet, isDesktopOrTablet), [theme, isDesktop, isTablet, isDesktopOrTablet]);

  const fetchReminders = async () => {
    try {
      const res = await repositoryProvider.api.get('/reminders/');
      setReminders(res.data);
      await syncReminders(res.data);
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('reminders.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchReminders();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReminders();
  };

  const handleToggleStatus = async (reminder: any) => {
    const isRepetitive = reminder.repetition !== 'ONCE';
    const newStatus = reminder.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    try {
      if (newStatus === 'COMPLETED' && isRepetitive) {
        Alert.alert(
          t('reminders.repetitive.title') || "Rappel Répétitif",
          t('reminders.repetitive.desc') || "Voulez-vous programmer la prochaine échéance ou terminer définitivement ce rappel ?",
          [
            {
              text: t('reminders.repetitive.next') || "Prochaine échéance",
              onPress: async () => {
                const nextDate = new Date(reminder.date);
                if (reminder.repetition === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
                if (reminder.repetition === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
                if (reminder.repetition === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);

                await repositoryProvider.api.patch(`/reminders/${reminder.id}/`, {
                  date: nextDate.toISOString().split('T')[0],
                  status: 'PENDING'
                });
                fetchReminders();
              }
            },
            {
              text: t('reminders.repetitive.finishAll') || "Terminer tout",
              style: "destructive",
              onPress: async () => {
                await repositoryProvider.api.patch(`/reminders/${reminder.id}/`, { status: 'COMPLETED' });
                const notifId = await AsyncStorage.getItem(`notif_reminder_${reminder.id}`);
                if (notifId) await cancelNotification(notifId);
                fetchReminders();
              }
            }
          ]
        );
      } else {
        await repositoryProvider.api.patch(`/reminders/${reminder.id}/`, { status: newStatus });
        if (newStatus === 'COMPLETED') {
          const notifId = await AsyncStorage.getItem(`notif_reminder_${reminder.id}`);
          if (notifId) {
            await cancelNotification(notifId);
            await AsyncStorage.removeItem(`notif_reminder_${reminder.id}`);
          }
        }
        fetchReminders();
      }
    } catch (error) {
      Alert.alert(t('common.error'), "Erreur lors de la mise à jour");
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert(t('common.delete'), t('reminders.deleteConfirm') || 'Voulez-vous supprimer ce rappel ?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await repositoryProvider.api.delete(`/reminders/${id}/`);
            const notifId = await AsyncStorage.getItem(`notif_reminder_${id}`);
            if (notifId) {
              await cancelNotification(notifId);
              await AsyncStorage.removeItem(`notif_reminder_${id}`);
            }
            fetchReminders();
          } catch (e) { Alert.alert(t('common.error'), t('common.error')); }
        }
      }
    ]);
  };

  const filteredReminders = reminders.filter(r => {
    if (filter === 'COMPLETED') return r.status === 'COMPLETED';
    if (r.status === 'COMPLETED' && filter !== 'ALL') return false;

    const today = new Date();
    today.setHours(0,0,0,0);
    const rDate = new Date(r.date);
    rDate.setHours(0,0,0,0);

    if (filter === 'TODAY') return rDate.getTime() === today.getTime();
    if (filter === 'WEEK') {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      return rDate >= today && rDate <= nextWeek;
    }
    return true;
  }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const renderItem = ({ item }: any) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const rDate = new Date(item.date);
    rDate.setHours(0,0,0,0);

    const isOverdue = rDate < today && item.status === 'PENDING';

    const getStatusInfo = () => {
      if (item.status === 'COMPLETED') return { label: t('reminders.status.completed') || 'Terminé', color: '#4CAF50' };
      if (item.status === 'CANCELLED') return { label: t('reminders.status.cancelled') || 'Annulé', color: '#9E9E9E' };
      if (isOverdue) return { label: t('reminders.status.overdue') || 'En retard', color: '#FF5252' };
      return { label: t('reminders.status.pending') || 'En attente', color: '#FFC107' };
    };

    const statusInfo = getStatusInfo();

    return (
      <View style={isDesktopOrTablet ? styles.tabletCardContainer : null}>
        <Card style={[styles.reminderCard, isOverdue && { borderColor: '#FF5252', borderWidth: 0.8 }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
              <Text style={styles.statusBadgeText}>{statusInfo.label}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={[styles.reminderTitle, item.status === 'COMPLETED' && styles.completedText, { color: theme.colors.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.reminderType, { color: theme.colors.textSecondary }]}>
                {item.type}
              </Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
             <View style={styles.detailItem}>
                <MaterialIcons name="event" size={16} color={theme.colors.primary} />
                <Text style={[styles.detailText, { color: theme.colors.textSecondary }]}>{item.date}</Text>
             </View>
             {item.time && (
               <View style={styles.detailItem}>
                  <MaterialIcons name="access-time" size={16} color={theme.colors.primary} />
                  <Text style={[styles.detailText, { color: theme.colors.textSecondary }]}>{item.time.substring(0,5)}</Text>
               </View>
             )}
          </View>

          <View style={styles.locationRow}>
             <MaterialIcons name="business" size={16} color={theme.colors.primary} />
             <Text style={[styles.locationText, { color: theme.colors.textSecondary }]}>{item.farm_name || `Ferme #${item.farm}`}</Text>
             {item.lot && (
               <>
                 <MaterialCommunityIcons name="layers" size={16} color={theme.colors.primary} style={{marginLeft: 10}} />
                 <Text style={[styles.locationText, { color: theme.colors.textSecondary }]}>{item.lot_name || `Lot #${item.lot}`}</Text>
               </>
             )}
          </View>

          <View style={[styles.cardActions, { borderTopColor: theme.colors.border + '40' }]}>
            {item.status === 'PENDING' && userRole === 'PROPRIETAIRE' && (
              <TouchableOpacity style={styles.doneBtn} onPress={() => handleToggleStatus(item)}>
                <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
                <Text style={[styles.actionText, { color: theme.colors.primary }]}>{t('common.finish') || 'Terminer'}</Text>
              </TouchableOpacity>
            )}

            {userRole === 'PROPRIETAIRE' && (
              <>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('ActionReminder', { reminderId: item.id })}>
                    <MaterialIcons name="edit" size={20} color={theme.colors.primary} />
                    <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>{t('common.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id)}>
                    <MaterialIcons name="delete" size={20} color={theme.colors.danger} />
                    <Text style={[styles.actionText, {color: theme.colors.danger}]}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Card>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        {!isDesktop && Platform.OS !== 'web' && (
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton}>
            <MaterialIcons name="menu" size={28} color={theme.colors.text} />
          </TouchableOpacity>
        )}
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('reminders.title')}</Text>
        {userRole === 'PROPRIETAIRE' ? (
          <TouchableOpacity onPress={() => navigation.navigate('ActionReminder')} style={styles.addButton}>
            <MaterialIcons name="add" size={28} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { label: t('common.all'), value: 'ALL' },
            { label: t('common.today'), value: 'TODAY' },
            { label: t('common.thisWeek'), value: 'WEEK' },
            { label: t('reminders.status.completed'), value: 'COMPLETED' },
          ].map(f => (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.filterChip, { backgroundColor: isDarkMode ? '#2C2C2C' : '#eee' }, filter === f.value && { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.filterChipText, { color: theme.colors.textSecondary }, filter === f.value && { color: '#000', fontWeight: 'bold' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{marginTop: 50}} />
      ) : (
        <FlatList
          key={numColumns}
          data={filteredReminders}
          numColumns={numColumns}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={[styles.list, isDesktopOrTablet && styles.listDesktop]}
          columnWrapperStyle={isDesktopOrTablet ? styles.columnWrapper : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <MaterialIcons name="notifications-none" size={64} color={theme.colors.textSecondary} />
               <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('common.noData')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false, isTablet: boolean = false, isDesktopOrTablet: boolean = false) => StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  menuButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold' },
  addButton: { padding: 4 },
  filterRow: { paddingHorizontal: 16, marginBottom: 10 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  filterChipText: { fontSize: 13 },
  list: { padding: 16, paddingBottom: 40 },
  listDesktop: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  columnWrapper: { gap: theme.spacing.m, justifyContent: 'flex-start' },
  tabletCardContainer: { flex: 1 },
  reminderCard: { padding: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 8, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#000' },
  headerInfo: { flex: 1, marginLeft: 0 },
  reminderTitle: { fontSize: 16, fontWeight: 'bold' },
  completedText: { textDecorationLine: 'line-through', opacity: 0.5 },
  reminderType: { fontSize: 12, marginTop: 2 },
  detailsRow: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 0.8, borderBottomColor: theme.colors.border, paddingBottom: 8 },
  detailItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  detailText: { fontSize: 13, marginLeft: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  locationText: { fontSize: 12, marginLeft: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, paddingTop: 10, borderTopWidth: 0.8, borderTopColor: theme.colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 15 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 'auto' },
  actionText: { fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 10, fontSize: 16 }
});