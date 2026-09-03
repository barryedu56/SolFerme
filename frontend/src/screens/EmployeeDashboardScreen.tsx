import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { syncManager } from '../utils/syncManager';
import { formatNumber } from '../utils/formatters';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, Card, StatTile, SectionHeader, space, radius } from '../components/ui';

export const EmployeeDashboardScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userName, userImage } = useAuth();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [stats, setStats] = useState({ lotsCount: 0, tasksCount: 0, todayProduction: 0, pendingRequests: 0 });
  const [reminders, setReminders] = useState<any[]>([]);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      await syncManager.syncAll();
      const emptyEmpStats = { summary: { farms_count: 0, lots_count: 0, total_chickens: 0, today_production: 0, revenues: 0, expenses: 0, alerts_count: 0, performance: 0, total_bonuses: 0, employees_with_bonuses: 0 } };
      const [empRes, statsRes] = await Promise.all([
        repositoryProvider.api.get('/employees/me/').catch(() => ({ data: null })),
        repositoryProvider.api.get('/farms/statistics/').catch(() => ({ data: emptyEmpStats })),
      ]);

      const employee = empRes.data;
      setEmployeeData(employee);
      const backendSummary = statsRes.data.summary;

      const [tasksRes, remindersRes, requestsRes] = await Promise.all([
        repositoryProvider.api.get('/tasks/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/reminders/').catch(() => ({ data: [] })),
        repositoryProvider.api.get('/employee-requests/').catch(() => ({ data: [] })),
      ]);

      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];

      setReminders((remindersRes.data || []).filter((r: any) => r.status === 'PENDING').slice(0, 3));
      setRecentRequests(requests.filter((r: any) => r.status === 'PENDING').slice(0, 2));

      setStats({
        lotsCount: employee?.lots?.length || 0,
        tasksCount: tasks.filter((tk: any) => tk.status !== 'TERMINE').length,
        todayProduction: backendSummary.today_production,
        pendingRequests: requests.filter((r: any) => r.status === 'PENDING').length,
      });
    } catch (error) {
      console.log('Error loading dashboard', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchDashboardData);
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchDashboardData(); };

  const S = useMemo(() => createStyles(theme), [theme]);

  const openLotAction = (screen: string, actionParams?: any) => {
    const primaryLot = employeeData?.lots?.[0] || employeeData?.lot;
    if (!primaryLot) { navigation.navigate('Farms'); return; }
    navigation.navigate('Farms', {
      screen,
      params: {
        lotId: primaryLot.id || primaryLot.lot_id,
        lotName: primaryLot.name || primaryLot.lot_name,
        farmId: primaryLot.farm || employeeData?.farm_id,
        ...actionParams,
      },
    });
  };

  const ActionItem = ({ label, icon, color, onPress, isCommunityIcon }: any) => (
    <Pressable style={S.actionItem} onPress={onPress}>
      <View style={[S.actionIcon, { backgroundColor: color + '14', borderColor: color + '30' }]}>
        {isCommunityIcon
          ? <MaterialCommunityIcons name={icon} size={23} color={color} />
          : <MaterialIcons name={icon} size={23} color={color} />}
      </View>
      <Text style={[S.actionLabel, { color: theme.colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </Screen>
    );
  }

  const header = (
    <Pressable style={S.header} onPress={() => navigation.getParent()?.navigate('Profile')}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={S.dateText}>{new Date().toLocaleDateString(t('common.dateLocale'), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        <Text style={[S.welcomeText, { color: theme.colors.text }]} numberOfLines={1}>{t('profile.greeting')} {userName?.split(' ')[0]}</Text>
      </View>
      <View style={[S.avatarWrapper, { borderColor: theme.colors.primary }]}>
        {userImage ? (
          <Image source={{ uri: userImage }} style={S.avatarImage} />
        ) : (
          <View style={[S.avatarPlaceholder, { backgroundColor: theme.colors.primary }]}>
            <Text style={S.avatarInitial}>{userName?.charAt(0)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <Screen scroll header={header} refreshing={refreshing} onRefresh={onRefresh}>
      <Pressable onPress={() => navigation.getParent()?.navigate('Profile')}>
        <Card style={S.workplaceCard}>
          <View style={S.workplaceRow}>
            <View style={[S.workplaceIcon, { backgroundColor: theme.colors.primary + '20' }]}>
              <MaterialIcons name="business" size={19} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[S.workplaceName, { color: theme.colors.text }]} numberOfLines={1}>{employeeData?.farm_name || t('profile.noFarm')}</Text>
              <Text style={S.positionText}>{employeeData?.position || t('profile.employee')}</Text>
            </View>
            <View style={[S.statusBadge, { backgroundColor: '#2E7D32' + '20' }]}>
              <View style={[S.statusDot, { backgroundColor: '#2E7D32' }]} />
              <Text style={[S.statusText, { color: '#2E7D32' }]}>
                {employeeData?.status ? t(`status.${employeeData.status.toLowerCase()}`) : t('status.active')}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <View style={S.statsGrid}>
        <View style={S.statCell}><StatTile label={t('profile.myLots')} value={stats.lotsCount} icon="layers-triple" accent="#3498db" onPress={() => navigation.navigate('Farms')} /></View>
        <View style={S.statCell}><StatTile label={t('tasks.title')} value={stats.tasksCount} icon="clipboard-text-outline" accent="#9b59b6" onPress={() => navigation.getParent()?.navigate('Tasks')} /></View>
        <View style={S.statCell}><StatTile label={t('requests.shortTitle')} value={stats.pendingRequests} icon="send-outline" accent="#e67e22" onPress={() => navigation.getParent()?.navigate('Requests')} /></View>
        <View style={S.statCell}><StatTile label={t('profile.dayProd')} value={formatNumber(stats.todayProduction)} icon="egg-outline" accent="#f1c40f" onPress={() => navigation.navigate('Farms')} /></View>
      </View>

      <SectionHeader title={t('dashboard.quickActions')} />
      <View style={S.actionsGrid}>
        <ActionItem label={t('attendance.shortTitle')} icon="access-time" color="#00897B" onPress={() => navigation.getParent()?.navigate('Attendance')} />
        <ActionItem label={t('actions.production')} icon="egg" color="#F9A825" onPress={() => openLotAction('ActionProduction')} isCommunityIcon />
        <ActionItem label={t('actions.feed')} icon="grass" color="#039BE5" onPress={() => openLotAction('ActionAlimentation')} />
        <ActionItem label={t('actions.health')} icon="medication" color="#E91E63" onPress={() => openLotAction('ActionSante')} />
        <ActionItem label={t('actions.movement')} icon="sync-alt" color="#FF5722" onPress={() => openLotAction('ActionMouvement')} />
        <ActionItem label={t('profile.stats.payments')} icon="payments" color="#8E24AA" onPress={() => navigation.getParent()?.navigate('Payroll')} />
      </View>

      {recentRequests.length > 0 && (
        <>
          <SectionHeader title={t('requests.title')} />
          {recentRequests.map((req, i) => (
            <Pressable key={i} onPress={() => navigation.getParent()?.navigate('Requests')}>
              <Card style={S.listItem}>
                <View style={[S.listIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                  <MaterialIcons name="mail-outline" size={19} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[S.listTitle, { color: theme.colors.text }]}>{t(`requests.types.${req.type}`)}</Text>
                  <Text style={S.listSub} numberOfLines={1}>{req.description}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {reminders.length > 0 && (
        <>
          <SectionHeader title={t('profile.priorityReminders')} />
          {reminders.map((r, i) => (
            <Pressable key={i} onPress={() => navigation.getParent()?.navigate('Reminders')}>
              <Card style={S.listItem}>
                <View style={[S.listIcon, { backgroundColor: theme.colors.danger + '18' }]}>
                  <MaterialIcons name="notifications-none" size={19} color={theme.colors.danger} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[S.listTitle, { color: theme.colors.text }]}>{r.title}</Text>
                  <Text style={S.listSub}>{new Date(r.date).toLocaleDateString(t('common.dateLocale'))}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: space.sm, gap: space.sm },
  dateText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  welcomeText: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  avatarWrapper: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, padding: 2 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 21 },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },

  workplaceCard: { marginBottom: space.md, borderRadius: radius.lg },
  workplaceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  workplaceIcon: { width: 36, height: 36, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  workplaceName: { fontSize: 15.5, fontWeight: '800' },
  positionText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  statCell: { flexGrow: 1, flexBasis: '46%', minWidth: 150 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.lg },
  actionItem: { width: 88, alignItems: 'center', gap: 6 },
  actionIcon: { width: 58, height: 58, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  actionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm, borderRadius: radius.md },
  listIcon: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700' },
  listSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});
