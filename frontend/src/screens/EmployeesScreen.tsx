import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable, Linking, Alert, Image } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatCurrency } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { Screen, ScreenHeader, useContentWidth, Card, StatTile, EmptyState, space, radius } from '../components/ui';

export const EmployeesScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const { theme } = useTheme();
  const { isDesktop, isTablet } = useBreakpoint();
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');
  const S = useMemo(() => createStyles(theme), [theme]);

  const [employees, setEmployees] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, payroll: 0, presentToday: 0 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, farmsRes] = await Promise.all([
        repositoryProvider.api.get('/employees/'),
        repositoryProvider.api.get('/farms/'),
      ]);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : empRes.data?.results || []);
      setFarms(Array.isArray(farmsRes.data) ? farmsRes.data : farmsRes.data?.results || []);
      const statsRes = await repositoryProvider.api.get('/employees/stats/');
      const s = statsRes.data;
      setStats({ total: s.total, active: s.active, payroll: s.payroll_mass, presentToday: s.present_today });
    } catch (error) {
      console.log('Erreur fetch employees:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => fetchData());
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const getFarmName = (farmId: number) => farms.find((f) => f.id === farmId)?.name || t('employees.unknownFarm');
  const handleCall = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`);
    else Alert.alert(t('common.info'), t('employees.phoneUnavailable'));
  };

  const renderItem = ({ item }: { item: any }) => {
    const name = item.user_name || `Employé #${item.user}`;
    const img = item.user_image
      ? (item.user_image.startsWith('http') ? item.user_image : `${(repositoryProvider.api.defaults.baseURL || '').replace('/api', '')}${item.user_image}`)
      : null;
    return (
      <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
        <Pressable onPress={() => navigation.navigate('EmployeeDetail', { employeeId: item.id, farms })}>
          <Card style={S.card}>
            <View style={S.top}>
              <View style={[S.avatar, { backgroundColor: theme.colors.primary + '1F' }]}>
                {img ? <Image source={{ uri: img }} style={S.avatarImg} /> : <Text style={[S.avatarText, { color: theme.colors.primary }]}>{name.charAt(0).toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[S.name, { color: theme.colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={S.farmRow}>
                  <MaterialCommunityIcons name="home-group" size={13} color={theme.colors.textSecondary} />
                  <Text style={S.farm} numberOfLines={1}>{getFarmName(item.farm)}</Text>
                </View>
              </View>
              <Pressable style={[S.call, { backgroundColor: theme.colors.primary }]} onPress={() => handleCall(item.user_phone)} hitSlop={6}>
                <MaterialIcons name="phone" size={18} color="#1A1A1A" />
              </Pressable>
            </View>
            <View style={[S.footer, { borderTopColor: theme.colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                <Text style={S.salLabel}>{t('employees.salary')}</Text>
                <Text style={[S.salValue, { color: theme.colors.text }]}>{formatCurrency(item.salary)}</Text>
                {item.bonus_total > 0 && <Text style={[S.salValue, { color: '#2E7D32' }]}>+{formatCurrency(item.bonus_total)}</Text>}
              </View>
              <Text style={[S.link, { color: theme.colors.primary }]}>{t('employees.details')} ›</Text>
            </View>
          </Card>
        </Pressable>
      </View>
    );
  };

  const ACTIONS = [
    { label: t('employees.attendance'), icon: 'calendar-check' as const, onPress: () => navigation.navigate('Attendance') },
    ...(isOwner ? [{ label: t('employees.payrollLabel'), icon: 'cash-multiple' as const, onPress: () => navigation.navigate('Payroll') }] : []),
    { label: t('employees.tasksLabel'), icon: 'clipboard-text-outline' as const, onPress: () => navigation.navigate('Tasks') },
  ];

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('farms.employees')}
          subtitle={`${employees.length} ${t('farms.employees').toLowerCase()}`}
          large
          actions={isOwner ? [{ icon: 'person-add', onPress: () => navigation.navigate('CreateEmployee', { farms }), tint: theme.colors.text }] : []}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          key={numColumns}
          data={employees}
          numColumns={numColumns}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: space.sm, marginBottom: space.sm }}>
              {isOwner && (
                <View style={S.statsRow}>
                  <StatTile label={t('employees.title')} value={stats.total} icon="account-group" />
                  <StatTile label={t('employees.presentToday')} value={stats.presentToday} icon="account-check" accent="#2E7D32" />
                  <StatTile label={t('employees.payrollMass')} value={formatCurrency(stats.payroll)} icon="cash" accent="#1E88E5" />
                </View>
              )}
              <Card style={{ marginBottom: 0 }}>
                <View style={S.quick}>
                  {ACTIONS.map((a) => (
                    <Pressable key={a.label} style={S.quickItem} onPress={a.onPress}>
                      <View style={[S.quickIcon, { backgroundColor: theme.colors.primary + '18' }]}>
                        <MaterialCommunityIcons name={a.icon} size={22} color={theme.colors.primary} />
                      </View>
                      <Text style={[S.quickLabel, { color: theme.colors.text }]}>{a.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="account-group-outline" title={t('common.noData')} />}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  quick: { flexDirection: 'row', justifyContent: 'space-around' },
  quickItem: { alignItems: 'center', gap: 6, flex: 1 },
  quickIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  card: { marginBottom: 0, borderRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  avatar: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 19, fontWeight: '800' },
  name: { fontSize: 15.5, fontWeight: '800' },
  farmRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  farm: { fontSize: 12.5, color: theme.colors.textSecondary, flexShrink: 1 },
  call: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  salLabel: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
  salValue: { fontSize: 13, fontWeight: '800' },
  link: { fontSize: 13, fontWeight: '800' },
});
