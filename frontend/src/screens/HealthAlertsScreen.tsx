import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { toast } from '../utils/toast';
import { confirmAsync } from '../utils/confirm';
import { Screen, ScreenHeader, useContentWidth, Card, Chip, EmptyState, space, radius } from '../components/ui';

const ALERT_COLOR: Record<string, string> = {
  RED: '#D32F2F', ORANGE: '#F57C00', GREEN: '#388E3C', BLUE: '#1976D2', PURPLE: '#9C27B0',
};
const SEVERITY: Record<string, number> = {
  MORTALITE: 5, MALADIE: 4, VENTE: 2, AJOUT: 1, GUERISON: 0,
};
const ALERT_ICON: Record<string, any> = {
  MORTALITE: 'sentiment-very-dissatisfied', MALADIE: 'sick',
  GUERISON: 'health-and-safety', AJOUT: 'add-circle-outline', VENTE: 'shopping-cart',
};

export const HealthAlertsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const styles = useMemo(() => createStyles(theme), [theme]);
  const contentW = useContentWidth('narrow');

  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('UNREAD');

  const load = useCallback(async () => {
    try {
      const res = await repositoryProvider.api.get('/health-alerts/');
      const rows = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      rows.sort((a: any, b: any) => {
        if (!!a.is_viewed !== !!b.is_viewed) return a.is_viewed ? 1 : -1;
        const sev = (SEVERITY[b.type] ?? 0) - (SEVERITY[a.type] ?? 0);
        if (sev !== 0) return sev;
        return String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''));
      });
      setAlerts(rows);
    } catch {
      toast.error(t('healthAlerts.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unreadCount = alerts.filter((a) => !a.is_viewed).length;
  const visible = filter === 'UNREAD' ? alerts.filter((a) => !a.is_viewed) : alerts;

  const handleMarkAll = async () => {
    if (busy || unreadCount === 0) return;
    const ok = await confirmAsync(t('healthAlerts.markAll'), t('healthAlerts.markAllConfirm'));
    if (!ok) return;
    setBusy(true);
    try {
      const unread = alerts.filter((a) => !a.is_viewed);
      for (const a of unread) {
        await repositoryProvider.api.post(`/health-alerts/${a.id}/mark_as_viewed/`).catch(() => {});
      }
      toast.success(t('healthAlerts.markAllDone'));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const color = ALERT_COLOR[item.color] || theme.colors.textSecondary;
    return (
      <Pressable onPress={() => navigation.navigate('HealthAlertDetail', { alert: item })}>
        <Card style={[styles.card, item.is_viewed && styles.cardViewed]} padding={space.sm}>
          <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
            <MaterialIcons name={ALERT_ICON[item.type] || 'notification-important'} size={22} color={color} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardType, { color: theme.colors.text }]} numberOfLines={1}>
                {item.type || t('healthAlertDetail.health')}
              </Text>
              {!item.is_viewed && <View style={[styles.dot, { backgroundColor: color }]} />}
            </View>
            <Text style={[styles.cardSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {item.quantity ?? 0} {t('healthAlerts.subjectsShort')} · {item.lot_name || t('healthAlertDetail.unknown')}
            </Text>
            <Text style={[styles.cardDate, { color: theme.colors.textSecondary }]}>
              {new Date(item.date || item.created_at).toLocaleDateString()}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={`${t('healthAlerts.title')}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          onBack={() => navigation.goBack()}
        />
      }
    >
      <View style={styles.filterRow}>
        {(['UNREAD', 'ALL'] as const).map((f) => (
          <Chip
            key={f}
            label={f === 'UNREAD' ? t('healthAlerts.unread') : t('healthAlerts.all')}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
        {isOwner && unreadCount > 0 && (
          <Pressable style={styles.markAllBtn} onPress={handleMarkAll} disabled={busy}>
            {busy
              ? <ActivityIndicator size="small" color={theme.colors.primary} />
              : <><MaterialIcons name="done-all" size={16} color={theme.colors.primary} />
                  <Text style={[styles.markAllText, { color: theme.colors.primary }]}>{t('healthAlerts.markAll')}</Text></>}
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(a) => String(a.id)}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingBottom: space.xxl, gap: space.sm }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="check-circle-outline"
              title={filter === 'UNREAD' ? t('healthAlerts.emptyUnread') : t('healthAlerts.empty')}
            />
          }
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: space.sm, flexWrap: 'wrap' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 8 },
  markAllText: { fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 0, borderRadius: radius.md },
  cardViewed: { opacity: 0.55 },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardType: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardSub: { fontSize: 13, marginTop: 2 },
  cardDate: { fontSize: 11, marginTop: 2 },
});
