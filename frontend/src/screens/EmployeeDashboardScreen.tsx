import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Dimensions, Image } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { syncOfflineData } from '../utils/offlineStorage';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert } from 'react-native';

export const EmployeeDashboardScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userName, userImage, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [stats, setStats] = useState({
    lotsCount: 0,
    tasksCount: 0,
    todayProduction: 0,
    performance: 0,
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const [recentActions, setRecentActions] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      await syncOfflineData(apiClient);

      // On récupère les données de l'employé connecté
      const empRes = await apiClient.get('/employees/me/');
      const employee = empRes.data;
      setEmployeeData(employee);

      const [prodRes, tasksRes, remindersRes, logsRes, movementsRes] = await Promise.all([
        apiClient.get('/productions/').catch(() => ({ data: [] })),
        apiClient.get('/tasks/').catch(() => ({ data: [] })),
        apiClient.get('/reminders/').catch(() => ({ data: [] })),
        apiClient.get('/activity-logs/').catch(err => {
          if (err.response?.status === 403) return { data: null };
          return { data: [] };
        }),
        apiClient.get('/movements/').catch(() => ({ data: [] })),
      ]);

      const productions = Array.isArray(prodRes.data) ? prodRes.data : [];
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const allReminders = Array.isArray(remindersRes.data) ? remindersRes.data : [];
      const movements = Array.isArray(movementsRes.data) ? movementsRes.data : [];
      const logs = logsRes.data;

      const upcomingReminders = allReminders
        .filter((r: any) => r.status === 'PENDING')
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);

      setReminders(upcomingReminders);

      let filteredLogs = [];
      if (logs) {
        filteredLogs = logs.filter((log: any) => log.user_name === userName);
      } else {
        // FALLBACK: Reconstruction de l'activité si /activity-logs/ est interdit (403)
        const combined: any[] = [];

        productions
          .filter((p: any) => p.created_by_name === userName)
          .forEach((p: any) => combined.push({
            module: 'Production',
            action: 'Saisie Production',
            description: `${p.casiers_produits} casiers collectés`,
            date: p.date
          }));

        const feedRes = await apiClient.get('/feeds/').catch(() => ({ data: [] }));
        if (Array.isArray(feedRes.data)) {
          feedRes.data
            .filter((f: any) => f.created_by_name === userName)
            .forEach((f: any) => combined.push({
              module: 'Alimentation',
              action: 'Distribution Aliment',
              description: `${f.quantity}kg de ${f.feed_type}`,
              date: f.date
            }));
        }

        const healthRes = await apiClient.get('/health-records/').catch(() => ({ data: [] }));
        if (Array.isArray(healthRes.data)) {
          healthRes.data
            .filter((h: any) => h.created_by_name === userName)
            .forEach((h: any) => combined.push({
              module: 'Santé',
              action: 'Soin / Traitement',
              description: h.treatment_type,
              date: h.date
            }));
        }

        filteredLogs = combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
      setRecentActions(filteredLogs.slice(0, 2));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayProduction = productions
        .filter((p: any) => {
          const prodDate = new Date(p.date);
          prodDate.setHours(0, 0, 0, 0);
          return prodDate.getTime() === today.getTime() && (userRole === 'EMPLOYE' ? p.created_by_name === userName : true);
        })
        .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);

      // Performance moyenne pour les lots assignés
      let avgPerf = 0;
      if (employee?.lots?.length > 0) {
        let totalPerf = 0;
        employee.lots.forEach((lot: any) => {
          const lotProds = productions.filter((p: any) => p.lot === lot.id);
          const recentProds = lotProds.filter((p: any) => {
            const pDate = new Date(p.date);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return pDate >= sevenDaysAgo;
          });
          const recentEggs = recentProds.reduce((sum: number, p: any) => sum + (p.casiers_produits * 30), 0);
          const daysWithData = new Set(recentProds.map(p => p.date)).size || 1;

          const lotMovements = movements.filter((m: any) => m.lot === lot.id);
          const totalSick = lotMovements.filter((m: any) => m.type === 'MALADE').reduce((sum: number, m: any) => sum + m.quantity, 0);
          const recovered = lotMovements.filter((m: any) => m.type === 'GUERI').reduce((sum: number, m: any) => sum + m.quantity, 0);
          const currentSick = Math.max(0, totalSick - recovered);

          totalPerf += calculatePerformance(
            lot.initial_quantity,
            lot.current_quantity,
            currentSick,
            recentEggs,
            daysWithData
          );
        });
        avgPerf = Math.round(totalPerf / employee.lots.length);
      }

      setStats({
        lotsCount: employee?.lots?.length || 0,
        tasksCount: tasks.filter((t: any) => t.status !== 'TERMINE').length,
        todayProduction,
        performance: avgPerf,
      });

    } catch (error) {
      console.log('Erreur de chargement du dashboard employé', error);
      // Fallback if /employees/me/ fails
      try {
          const [farmsRes, lotsRes, prodRes, tasksRes] = await Promise.all([
            apiClient.get('/farms/'),
            apiClient.get('/lots/'),
            apiClient.get('/productions/'),
            apiClient.get('/tasks/'),
          ]);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayProduction = prodRes.data
            .filter((p: any) => {
              const prodDate = new Date(p.date);
              prodDate.setHours(0, 0, 0, 0);
              return prodDate.getTime() === today.getTime();
            })
            .reduce((sum: number, p: any) => sum + (p.casiers_produits || 0), 0);

          setStats({
            lotsCount: lotsRes.data.length,
            tasksCount: tasksRes.data.filter((t: any) => t.status !== 'TERMINE').length,
            todayProduction,
          });
      } catch (e) {
          console.log('Fallback failed too');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getLogIcon = (module: string) => {
    switch (module) {
      case 'Production': return 'egg';
      case 'Vente': return 'shopping-cart';
      case 'Alimentation': return 'restaurant';
      case 'Santé': return 'medication';
      case 'Mouvement': return 'sync-alt';
      case 'Rappel': return 'notifications';
      default: return 'history';
    }
  };

  const getLogColor = (module: string) => {
    switch (module) {
      case 'Production': return '#FBC02D';
      case 'Vente': return '#4CAF50';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      default: return theme.colors.primary;
    }
  };

  const styles = createStyles(theme);

  const farmTabName = (userRole === 'EMPLOYE' || !userRole) ? 'Ma Ferme' : 'Fermes';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Bonjour, {userName.split(' ')[0]} 👋</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.avatarContainer}>
           {userImage ? (
             <Image source={{ uri: userImage }} style={styles.avatarImage} />
           ) : (
             <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{userName.charAt(0)}</Text>
             </View>
           )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.9}>
          <Card style={styles.workplaceCard}>
             <View style={styles.workplaceIcon}>
                <MaterialIcons name="business" size={24} color={theme.colors.text} />
             </View>
             <View style={styles.workplaceInfo}>
                <Text style={styles.workplaceLabel}>Espace de travail</Text>
                <Text style={styles.workplaceName}>{employeeData?.farm_name || 'Ma Ferme'}</Text>
                <View style={styles.positionBadge}>
                   <MaterialIcons name="verified-user" size={12} color={theme.colors.primary} />
                   <Text style={styles.positionText}>{employeeData?.position || 'Employé'}</Text>
                </View>
             </View>
             <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.5)" />
          </Card>
        </TouchableOpacity>

        <View style={styles.grid}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}
            onPress={() => navigation.navigate(farmTabName)}
          >
            <View style={styles.statIconBox}>
               <MaterialCommunityIcons name="layers-triple" size={22} color="#1E88E5" />
            </View>
            <View>
               <Text style={styles.statValue}>{stats.lotsCount}</Text>
               <Text style={styles.statLabel}>Mes Lots</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}
            onPress={() => navigation.navigate('Statistics')}
          >
            <View style={styles.statIconBox}>
               <MaterialIcons name="speed" size={22} color={getPerformanceLabel(stats.performance).color} />
            </View>
            <View>
               <Text style={[styles.statValue, { color: getPerformanceLabel(stats.performance).color }]}>{stats.performance}%</Text>
               <Text style={styles.statLabel}>Performance</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}
            onPress={() => navigation.navigate('Tasks')}
          >
            <View style={styles.statIconBox}>
               <MaterialIcons name="playlist-add-check" size={22} color="#8E24AA" />
            </View>
            <View>
               <Text style={styles.statValue}>{stats.tasksCount}</Text>
               <Text style={styles.statLabel}>Tâches</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}
            onPress={() => {
              const lot = employeeData?.lots?.[0];
              if (lot) {
                navigation.navigate(farmTabName, { screen: 'LotHistory', params: { lotId: lot.id, lotName: lot.name } });
              } else {
                navigation.navigate(farmTabName);
              }
            }}
          >
            <View style={styles.statIconBox}>
               <MaterialIcons name="egg" size={22} color="#FBC02D" />
            </View>
            <View>
               <Text style={styles.statValue}>{stats.todayProduction}</Text>
               <Text style={styles.statLabel}>Prod. Jour</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>Actions Rapides</Text>
        </View>
        <View style={styles.quickActionsGrid}>
           <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate(farmTabName, { screen: 'ActionProduction' })}>
              <View style={[styles.actionIcon, { backgroundColor: '#FFF9C4' }]}>
                 <MaterialIcons name="egg" size={30} color="#FBC02D" />
              </View>
              <Text style={styles.actionLabel}>Production</Text>
           </TouchableOpacity>

           <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate(farmTabName, { screen: 'ActionAlimentation' })}>
              <View style={[styles.actionIcon, { backgroundColor: '#E1F5FE' }]}>
                 <MaterialCommunityIcons name="food-apple" size={30} color="#039BE5" />
              </View>
              <Text style={styles.actionLabel}>Alimentation</Text>
           </TouchableOpacity>

           <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate(farmTabName, { screen: 'ActionSante' })}>
              <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
                 <MaterialIcons name="health-and-safety" size={30} color="#2E7D32" />
              </View>
              <Text style={styles.actionLabel}>Santé</Text>
           </TouchableOpacity>

           <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate(farmTabName, { screen: 'ActionMouvement' })}>
              <View style={[styles.actionIcon, { backgroundColor: '#FFEBEE' }]}>
                 <MaterialCommunityIcons name="emoticon-dead" size={30} color="#C62828" />
              </View>
              <Text style={styles.actionLabel}>Mortalité</Text>
           </TouchableOpacity>
        </View>

        {recentActions.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mon activité récente</Text>
              <TouchableOpacity onPress={() => navigation.navigate('GlobalHistory')}>
                 <Text style={styles.seeAllText}>Tout voir</Text>
              </TouchableOpacity>
            </View>
            {recentActions.map((act: any, i: number) => (
              <Card key={i} style={styles.logCard}>
                <View style={[styles.logIconBox, { backgroundColor: getLogColor(act.module) + '15' }]}>
                  <MaterialIcons name={getLogIcon(act.module) as any} size={20} color={getLogColor(act.module)} />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logAction}>{act.action}</Text>
                  <Text style={styles.logDesc} numberOfLines={1}>{act.description}</Text>
                  <Text style={styles.logDate}>{new Date(act.date).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {reminders.length > 0 && (
          <View style={styles.remindersSection}>
            <Text style={styles.sectionTitle}>Rappels prioritaires</Text>
            {reminders.map((reminder) => (
              <TouchableOpacity key={reminder.id} onPress={() => navigation.navigate('Reminders')}>
                <Card style={styles.reminderItem}>
                  <View style={styles.reminderIconBox}>
                    <MaterialIcons name="notifications-active" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderTitle}>{reminder.title}</Text>
                    <Text style={styles.reminderDate}>
                      {new Date(reminder.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </Text>
                  </View>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{reminder.type}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.s,
  },
  welcomeText: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  dateText: { fontSize: 13, color: theme.colors.textSecondary, textTransform: 'capitalize' },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  workplaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
    ...theme.shadows.medium,
  },
  workplaceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  workplaceInfo: {
    flex: 1,
  },
  workplaceLabel: {
    fontSize: 11,
    color: theme.colors.text,
    opacity: 0.8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workplaceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginVertical: 2,
  },
  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primary,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s,
  },
  statCard: {
    width: '48%',
    padding: theme.spacing.m,
    paddingVertical: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    justifyContent: 'space-between',
    marginBottom: theme.spacing.m,
    ...theme.shadows.light,
  },
  statIconBox: {
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  seeAllText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.l,
  },
  actionItem: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border + '30',
    ...theme.shadows.light,
  },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  historySection: {
    marginTop: theme.spacing.s,
    marginBottom: theme.spacing.l,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
    backgroundColor: theme.colors.surface,
  },
  logIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  logInfo: {
    flex: 1,
  },
  logAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  logDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginVertical: 2,
  },
  logDate: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    alignSelf: 'flex-end',
  },
  remindersSection: {
    marginTop: theme.spacing.s,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  reminderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  reminderDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 8,
  },
  typeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
});
