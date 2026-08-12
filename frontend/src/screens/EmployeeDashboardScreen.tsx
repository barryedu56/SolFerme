import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { syncManager } from '../utils/syncManager';
import { formatNumber } from '../utils/formatters';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

export const EmployeeDashboardScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const { userName, userImage } = useAuth();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const isTablet = width > 600;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [stats, setStats] = useState({
    lotsCount: 0,
    tasksCount: 0,
    todayProduction: 0,
    pendingRequests: 0,
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      await syncManager.syncAll();
      const emptyEmpStats = { summary: { farms_count: 0, lots_count: 0, total_chickens: 0, today_production: 0, revenues: 0, expenses: 0, alerts_count: 0, performance: 0, total_bonuses: 0, employees_with_bonuses: 0 } };
      const [empRes, statsRes] = await Promise.all([
        repositoryProvider.api.get('/employees/me/').catch(() => ({ data: null })),
        repositoryProvider.api.get('/farms/statistics/').catch(() => ({ data: emptyEmpStats }))
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
        tasksCount: tasks.filter((t: any) => t.status !== 'TERMINE').length,
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const styles = useMemo(() => createStyles(theme, isTablet, isDarkMode), [theme, isTablet, isDarkMode]);

  const StatCard = ({ title, value, icon, color, badge, onPress, isCommunityIcon }: any) => (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconContainer, { backgroundColor: color + '15' }]}>
          {isCommunityIcon ? (
            <MaterialCommunityIcons name={icon as any} size={20} color={color} />
          ) : (
            <MaterialIcons name={icon as any} size={20} color={color} />
          )}
        </View>
        {badge && <View style={styles.statBadge} />}
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{title}</Text>
      </View>
    </TouchableOpacity>
  );

  const ActionItem = ({ label, icon, color, onPress, isCommunityIcon }: any) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.actionIconWrapper, { backgroundColor: color + '10', borderColor: color + '30' }]}>
        {isCommunityIcon ? (
          <MaterialCommunityIcons name={icon as any} size={24} color={color} />
        ) : (
          <MaterialIcons name={icon as any} size={24} color={color} />
        )}
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* --- HEADER (Cliquable vers Profil) --- */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => navigation.getParent()?.navigate('Profile')}
        activeOpacity={0.7}
      >
        <View>
          <Text style={styles.dateText}>{new Date().toLocaleDateString(t('common.dateLocale'), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={styles.welcomeText}>{t('profile.greeting')} {userName?.split(' ')[0]}</Text>
        </View>
        <View style={styles.avatarWrapper}>
           {userImage ? (
             <Image source={{ uri: userImage }} style={styles.avatarImage} />
           ) : (
             <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{userName?.charAt(0)}</Text>
             </View>
           )}
        </View>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* --- BANDEAU POSTE (Cliquable vers Profil) --- */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.getParent()?.navigate('Profile')}
        >
          <Card style={styles.workplaceCard}>
             <View style={styles.workplaceRow}>
               <View style={styles.workplaceIcon}>
                  <MaterialIcons name="business" size={20} color={theme.colors.primary} />
               </View>
               <View style={styles.workplaceInfo}>
                  <Text style={styles.workplaceName}>{employeeData?.farm_name || t('profile.noFarm')}</Text>
                  <Text style={styles.positionText}>{employeeData?.position || t('profile.employee')}</Text>
               </View>
               <View style={[styles.statusBadge, { backgroundColor: theme.colors.success + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                  <Text style={[styles.statusText, { color: theme.colors.success }]}>
                    {employeeData?.status ? t(`status.${employeeData.status.toLowerCase()}`) : t('status.active')}
                  </Text>
               </View>
             </View>
          </Card>
        </TouchableOpacity>

        {/* --- STATISTIQUES --- */}
        <View style={styles.statsGrid}>
          <StatCard
            title={t('profile.myLots')}
            value={stats.lotsCount}
            icon="layers"
            color="#3498db"
            onPress={() => navigation.navigate('Farms')}
          />
          <StatCard
            title={t('tasks.title')}
            value={stats.tasksCount}
            icon="assignment"
            color="#9b59b6"
            badge={stats.tasksCount > 0}
            onPress={() => navigation.getParent()?.navigate('Tasks')}
          />
          <StatCard
            title={t('requests.shortTitle')}
            value={stats.pendingRequests}
            icon="send"
            color="#e67e22"
            badge={stats.pendingRequests > 0}
            onPress={() => navigation.getParent()?.navigate('Requests')}
          />
          <StatCard
            title={t('profile.dayProd')}
            value={formatNumber(stats.todayProduction)}
            icon="egg"
            color="#f1c40f"
            onPress={() => navigation.navigate('Farms')}
            isCommunityIcon
          />
        </View>

        {/* --- ACTIONS RAPIDES --- */}
        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
        </View>
        <View style={styles.actionsGrid}>
           <ActionItem label={t('attendance.shortTitle')} icon="access-time" color="#00897B" onPress={() => navigation.getParent()?.navigate('Attendance')} />
           <ActionItem label={t('actions.production')} icon="egg" color="#FBC02D" onPress={() => navigation.navigate('Farms')} isCommunityIcon />
           <ActionItem label={t('actions.feed')} icon="grass" color="#039BE5" onPress={() => navigation.navigate('Farms')} />
           <ActionItem label={t('actions.health')} icon="medication" color="#E91E63" onPress={() => navigation.navigate('Farms')} />
           <ActionItem label={t('actions.movement')} icon="sync-alt" color="#FF5722" onPress={() => navigation.navigate('Farms')} />
           <ActionItem label={t('profile.stats.payments')} icon="payments" color="#8E24AA" onPress={() => navigation.getParent()?.navigate('Payroll')} />
        </View>

        {/* --- LISTES DYNAMIQUES --- */}
        <View style={styles.bottomSection}>
          {recentRequests.length > 0 && (
            <View style={styles.listSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('requests.title')}</Text>
              </View>
              {recentRequests.map((req, i) => (
                <TouchableOpacity key={i} style={styles.listItem} onPress={() => navigation.getParent()?.navigate('Requests')}>
                  <View style={[styles.listIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="mail-outline" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.listContent}>
                    <Text style={styles.listTitle}>{t(`requests.types.${req.type}`)}</Text>
                    <Text style={styles.listSub} numberOfLines={1}>{req.description}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {reminders.length > 0 && (
            <View style={styles.listSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('profile.priorityReminders')}</Text>
              </View>
              {reminders.map((r, i) => (
                <TouchableOpacity key={i} style={styles.listItem} onPress={() => navigation.getParent()?.navigate('Reminders')}>
                  <View style={[styles.listIcon, { backgroundColor: '#FFEBEE' }]}>
                    <MaterialIcons name="notifications-none" size={20} color={theme.colors.danger} />
                  </View>
                  <View style={styles.listContent}>
                    <Text style={styles.listTitle}>{r.title}</Text>
                    <Text style={styles.listSub}>{new Date(r.date).toLocaleDateString(t('common.dateLocale'))}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isTablet: boolean, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 15,
  },
  dateText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  welcomeText: { fontSize: 24, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    padding: 2,
    ...theme.shadows.light,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 22 },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },

  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  workplaceCard: {
    padding: 15,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  workplaceRow: { flexDirection: 'row', alignItems: 'center' },
  workplaceIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  workplaceInfo: { flex: 1 },
  workplaceName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  positionText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.light,
  },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statIconContainer: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statBadge: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.danger, position: 'absolute', top: -4, right: 0, borderWidth: 2, borderColor: theme.colors.surface },
  statInfo: {},
  statValue: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },

  sectionHeader: { marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 25 },
  actionItem: { width: '31%', alignItems: 'center', marginBottom: 20 },
  actionIconWrapper: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1 },
  actionLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.text },

  bottomSection: { marginTop: 10 },
  listSection: { marginBottom: 25 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  listIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  listContent: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  listSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});