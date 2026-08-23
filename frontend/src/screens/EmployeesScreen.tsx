import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Linking, Alert, useWindowDimensions, Image } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatCurrency } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

export const EmployeesScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const [employees, setEmployees] = useState([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { theme } = useTheme();
  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet, isDesktopOrTablet), [theme, isDesktop, isTablet, isDesktopOrTablet]);

  const numColumns = isDesktop ? 3 : (isTablet ? 2 : 1);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    payroll: 0,
    presentToday: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Récupérer employés + fermes en parallèle
      const [empRes, farmsRes] = await Promise.all([
        repositoryProvider.api.get('/employees/'),
        repositoryProvider.api.get('/farms/'),
      ]);

      const empData = empRes.data;
      setEmployees(empData);
      setFarms(farmsRes.data);

      // Stats dynamiques via endpoint dédié (données réelles de la base)
      const statsRes = await repositoryProvider.api.get('/employees/stats/');
      const s = statsRes.data;
      setStats({
        total: s.total,
        active: s.active,
        payroll: s.payroll_mass,     // SUM salaire des employés ACTIFS uniquement
        presentToday: s.present_today,
      });
    } catch (error) {
      console.log('Erreur fetch employees:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getFarmName = (farmId: number) => {
    const farm = farms.find(f => f.id === farmId);
    return farm ? farm.name : t('employees.unknownFarm');
  };

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert(t('common.info'), t('employees.phoneUnavailable'));
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const name = item.user_name || `Employé #${item.user}`;

    const profileImageUrl = item.user_image
      ? (item.user_image.startsWith('http') ? item.user_image : `${(repositoryProvider.api.defaults.baseURL || '').replace('/api', '')}${item.user_image}`)
      : null;

    return (
      <View style={isDesktopOrTablet ? styles.tabletCardContainer : null}>
        <Card style={styles.employeeCard}>
          <View style={styles.employeeContent}>
            <View style={[styles.avatarPlaceholder, { overflow: 'hidden' }]}>
               {profileImageUrl ? (
                 <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
               ) : (
                 <Text style={styles.avatarText}>{name.charAt(0)}</Text>
               )}
            </View>
            <View style={styles.employeeInfoMain}>
              <Text style={styles.employeeName} numberOfLines={1}>{name}</Text>
              <View style={styles.farmRow}>
                <MaterialIcons name="business" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.farmName} numberOfLines={1}>{getFarmName(item.farm)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => handleCall(item.user_phone)}
            >
               <MaterialIcons name="phone" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.employeeFooter}>
            <View style={styles.salaryRow}>
              <Text style={styles.salaryLabel}>{t('employees.salary')}:</Text>
              <Text style={styles.salaryValue}>{formatCurrency(item.salary)}</Text>
              {item.bonus_total > 0 && (
                <>
                  <Text style={styles.salaryLabel}> {t('employees.bonus')}:</Text>
                  <Text style={[styles.salaryValue, { color: theme.colors.success }]}>
                    +{formatCurrency(item.bonus_total)}
                  </Text>
                </>
              )}
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('EmployeeDetail', { employeeId: item.id, farms })}>
               <Text style={styles.detailsLink}>{t('employees.details')}</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('farms.employees')}</Text>
          <Text style={styles.subtitle}>{employees.length} {t('farms.employees').toLowerCase()} actifs</Text>
        </View>
      {isOwner && (
        <TouchableOpacity
          style={styles.addButton} 
          onPress={() => navigation.navigate('CreateEmployee', { farms })}
        >
          <MaterialIcons name="person-add" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      )}
      </View>

      <View style={styles.mainContent}>
        {isOwner && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>{t('employees.title')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>{stats.presentToday}</Text>
              <Text style={styles.statLabel}>{t('employees.presentToday')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                {formatCurrency(stats.payroll)}
              </Text>
              <Text style={styles.statLabel}>{t('employees.payrollMass')}</Text>
            </View>
          </View>
        )}

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Attendance')}>
            <View style={[styles.actionIcon, { backgroundColor: theme.colors.primary + '15' }]}>
              <MaterialIcons name="event-available" size={26} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel}>{t('employees.attendance')}</Text>
          </TouchableOpacity>

          {isOwner && (
            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Payroll')}>
              <View style={[styles.actionIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                <MaterialIcons name="payments" size={26} color={theme.colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{t('employees.payrollLabel')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Tasks')}>
            <View style={[styles.actionIcon, { backgroundColor: theme.colors.primary + '15' }]}>
              <MaterialIcons name="assignment" size={26} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel}>{t('employees.tasksLabel')}</Text>
          </TouchableOpacity>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            key={numColumns}
            data={employees}
            numColumns={numColumns}
            keyExtractor={(item: any) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            columnWrapperStyle={isDesktopOrTablet ? styles.columnWrapper : null}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
            ListEmptyComponent={
              <EmptyState
                icon="account-group-outline"
                title={t('common.noData')}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean, isTablet: boolean, isDesktopOrTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    marginBottom: theme.spacing.s,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  mainContent: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.m,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    marginHorizontal: 4,
    ...theme.shadows.light,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.m,
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.medium,
    marginBottom: theme.spacing.m
  },
  actionItem: { alignItems: 'center' },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  actionLabel: { fontSize: 12, fontWeight: 'bold', color: theme.colors.text },
  loader: { marginTop: theme.spacing.xl },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: theme.spacing.m,
  },
  tabletCardContainer: {
    flex: isDesktop ? 0.32 : 0.49,
  },
  employeeCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    flex: 1,
  },
  employeeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: theme.colors.textSecondary },
  employeeInfoMain: {
    flex: 1,
    marginLeft: theme.spacing.m,
  },
  employeeName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  farmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  farmName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  employeeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.m,
    paddingTop: theme.spacing.m,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border,
  },
  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  salaryLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginRight: 4,
  },
  salaryValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 8,
  },
  hiredDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    marginRight: 10,
  },
  detailsLink: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '700',
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: theme.spacing.xl }
});