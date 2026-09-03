import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { useAuth } from '../context/AuthContext';
import { cancelNotification } from '../utils/notifications';
import { syncReminders } from '../utils/reminderSync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Screen, ScreenHeader, useContentWidth, Card, Chip, Badge, EmptyState, space, radius } from '../components/ui';

export const RemindersScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const { isDesktop, isTablet } = useBreakpoint();
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');
  const S = useMemo(() => createStyles(theme), [theme]);

  const fetchReminders = async () => {
    try {
      const res = await repositoryProvider.api.get('/reminders/');
      setReminders(Array.isArray(res.data) ? res.data : res.data?.results || []);
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
    const unsubscribe = navigation.addListener('focus', () => fetchReminders());
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchReminders(); };

  const handleToggleStatus = async (reminder: any) => {
    const isRepetitive = reminder.repetition !== 'ONCE';
    const newStatus = reminder.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      if (newStatus === 'COMPLETED' && isRepetitive) {
        Alert.alert(
          t('reminders.repetitive.title') || 'Rappel Répétitif',
          t('reminders.repetitive.desc') || 'Voulez-vous programmer la prochaine échéance ou terminer définitivement ce rappel ?',
          [
            {
              text: t('reminders.repetitive.next') || 'Prochaine échéance',
              onPress: async () => {
                const nextDate = new Date(reminder.date);
                if (reminder.repetition === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
                if (reminder.repetition === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
                if (reminder.repetition === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
                await repositoryProvider.api.patch(`/reminders/${reminder.id}/`, {
                  date: nextDate.toISOString().split('T')[0], status: 'PENDING',
                });
                fetchReminders();
              },
            },
            {
              text: t('reminders.repetitive.finishAll') || 'Terminer tout',
              style: 'destructive',
              onPress: async () => {
                await repositoryProvider.api.patch(`/reminders/${reminder.id}/`, { status: 'COMPLETED' });
                const notifId = await AsyncStorage.getItem(`notif_reminder_${reminder.id}`);
                if (notifId) await cancelNotification(notifId);
                fetchReminders();
              },
            },
          ],
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
      Alert.alert(t('common.error'), 'Erreur lors de la mise à jour');
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
        },
      },
    ]);
  };

  const filteredReminders = reminders.filter((r) => {
    if (filter === 'COMPLETED') return r.status === 'COMPLETED';
    if (r.status === 'COMPLETED' && filter !== 'ALL') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rDate = new Date(r.date); rDate.setHours(0, 0, 0, 0);
    if (filter === 'TODAY') return rDate.getTime() === today.getTime();
    if (filter === 'WEEK') {
      const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
      return rDate >= today && rDate <= nextWeek;
    }
    return true;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const renderItem = ({ item }: any) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rDate = new Date(item.date); rDate.setHours(0, 0, 0, 0);
    const isOverdue = rDate < today && item.status === 'PENDING';
    const status =
      item.status === 'COMPLETED' ? { label: t('reminders.status.completed') || 'Terminé', color: '#2E7D32' }
      : item.status === 'CANCELLED' ? { label: t('reminders.status.cancelled') || 'Annulé', color: '#9E9E9E' }
      : isOverdue ? { label: t('reminders.status.overdue') || 'En retard', color: '#D32F2F' }
      : { label: t('reminders.status.pending') || 'En attente', color: '#F57C00' };

    return (
      <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
        <Card style={[S.card, isOverdue && { borderColor: '#D32F2F' }]}>
          <View style={S.top}>
            <View style={[S.iconBox, { backgroundColor: status.color + '1F' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={20} color={status.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.title, { color: theme.colors.text }, item.status === 'COMPLETED' && S.done]} numberOfLines={2}>{item.title}</Text>
              <Text style={[S.type, { color: theme.colors.textSecondary }]}>{item.type}</Text>
            </View>
            <Badge label={status.label} color={status.color} />
          </View>

          <View style={[S.meta, { borderTopColor: theme.colors.border }]}>
            <View style={S.metaItem}>
              <MaterialIcons name="event" size={14} color={theme.colors.textSecondary} />
              <Text style={S.metaText}>{item.date}{item.time ? ` · ${item.time.substring(0, 5)}` : ''}</Text>
            </View>
            <View style={S.metaItem}>
              <MaterialCommunityIcons name="home-group" size={14} color={theme.colors.textSecondary} />
              <Text style={S.metaText} numberOfLines={1}>
                {item.farm_name || `Ferme #${item.farm}`}{item.lot ? ` · ${item.lot_name || `Lot #${item.lot}`}` : ''}
              </Text>
            </View>
          </View>

          {isOwner && (
            <View style={[S.actions, { borderTopColor: theme.colors.border }]}>
              {item.status === 'PENDING' && (
                <Pressable style={[S.act, { marginRight: 'auto' }]} onPress={() => handleToggleStatus(item)}>
                  <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
                  <Text style={[S.actText, { color: theme.colors.primary }]}>{t('common.finish') || 'Terminer'}</Text>
                </Pressable>
              )}
              <Pressable style={S.act} onPress={() => navigation.navigate('ActionReminder', { reminderId: item.id })}>
                <MaterialIcons name="edit" size={18} color={theme.colors.textSecondary} />
                <Text style={[S.actText, { color: theme.colors.textSecondary }]}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable style={S.act} onPress={() => handleDelete(item.id)}>
                <MaterialIcons name="delete-outline" size={18} color={theme.colors.danger} />
                <Text style={[S.actText, { color: theme.colors.danger }]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          )}
        </Card>
      </View>
    );
  };

  const FILTERS = [
    { label: t('common.all'), value: 'ALL' },
    { label: t('common.today'), value: 'TODAY' },
    { label: t('common.thisWeek'), value: 'WEEK' },
    { label: t('reminders.status.completed'), value: 'COMPLETED' },
  ];

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('reminders.title')}
          large
          onMenu={!isDesktop && Platform.OS !== 'web' ? () => navigation.openDrawer() : undefined}
          actions={isOwner ? [{ icon: 'add', onPress: () => navigation.navigate('ActionReminder'), tint: theme.colors.text }] : []}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={S.chipRow}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          key={numColumns}
          data={filteredReminders}
          numColumns={numColumns}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingBottom: space.xxl, gap: space.sm }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="bell-outline" title={t('common.noData')} description={isOwner ? t('reminders.subtitle') : undefined} />}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: space.sm, alignItems: 'center' },
  card: { marginBottom: 0, borderRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '800' },
  done: { textDecorationLine: 'line-through', opacity: 0.55 },
  type: { fontSize: 12, marginTop: 2 },
  meta: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: 5 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, color: theme.colors.textSecondary, flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  act: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actText: { fontSize: 12.5, fontWeight: '700' },
});
