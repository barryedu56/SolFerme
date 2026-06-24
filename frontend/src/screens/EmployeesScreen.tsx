import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Linking, Alert, useWindowDimensions, Image } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';

export const EmployeesScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const numColumns = isTablet ? 2 : 1;

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    payroll: 0,
    presentToday: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [empRes, farmsRes, attendanceRes] = await Promise.all([
        apiClient.get('/employees/'),
        apiClient.get('/farms/'),
        apiClient.get(`/attendances/?date=${today}`)
      ]);

      const empData = empRes.data;
      setEmployees(empData);
      setFarms(farmsRes.data);

      // Calcul des stats
      const total = empData.length;
      const active = empData.filter((e: any) => e.status === 'ACTIF').length;
      const payroll = empData.reduce((sum: number, e: any) => sum + (parseFloat(e.salary) || 0), 0);
      const presentToday = attendanceRes.data.filter((a: any) => a.status === 'PRESENT').length;

      setStats({ total, active, payroll, presentToday });
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
    return farm ? farm.name : 'Inconnue';
  };

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('Info', 'Numéro de téléphone non disponible');
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const name = item.user_name || `Employé #${item.user}`;

    const profileImageUrl = item.user_image
      ? (item.user_image.startsWith('http') ? item.user_image : `${apiClient.defaults.baseURL.replace('/api', '')}${item.user_image}`)
      : null;

    return (
      <View style={isTablet ? styles.tabletCardContainer : null}>
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
                <MaterialIcons name="agriculture" size={14} color={theme.colors.textSecondary} />
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
            <Text style={styles.hiredDate} numberOfLines={1}>Poste: {item.position || 'Agent'}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EmployeeDetail', { employeeId: item.id, farms })}>
               <Text style={styles.detailsLink}>Détails</Text>
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
        <TouchableOpacity
          style={styles.addButton} 
          onPress={() => navigation.navigate('CreateEmployee', { farms })}
        >
          <MaterialIcons name="person-add" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Employés</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: theme.colors.success }]}>{stats.presentToday}</Text>
          <Text style={styles.statLabel}>Présents (J)</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: theme.colors.primary }]}>
            {(stats.payroll / 1000000).toFixed(1)}M
          </Text>
          <Text style={styles.statLabel}>Masse Sal.</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Attendance')}>
          <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
            <MaterialIcons name="event-available" size={26} color="#1976D2" />
          </View>
          <Text style={styles.actionLabel}>Pointage</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Payroll')}>
          <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
            <MaterialIcons name="payments" size={26} color="#7B1FA2" />
          </View>
          <Text style={styles.actionLabel}>Paie</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Tasks')}>
          <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
            <MaterialIcons name="assignment" size={26} color="#2E7D32" />
          </View>
          <Text style={styles.actionLabel}>Tâches</Text>
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
          columnWrapperStyle={isTablet ? styles.columnWrapper : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('common.noData')}</Text>
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
    paddingTop: theme.spacing.l,
    marginBottom: theme.spacing.s,
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
    borderWidth: 1,
    borderColor: theme.colors.border + '20',
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
    justifyContent: 'space-between',
  },
  tabletCardContainer: {
    flex: 0.49,
  },
  employeeCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
    borderTopWidth: 1,
    borderTopColor: theme.colors.border + '40',
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
