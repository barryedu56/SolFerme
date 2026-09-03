import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DatePicker } from '../components/DatePicker';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { Screen, ScreenHeader, useContentWidth, Card, Chip, Badge, StatTile, EmptyState, space, radius } from '../components/ui';

const getStatusColor = (status: string, theme: any) => {
  switch (status) {
    case 'PRESENT': return '#2E7D32';
    case 'RETARD': return '#F57C00';
    case 'ABSENT': return theme.colors.danger;
    default: return theme.colors.textSecondary;
  }
};

export const AttendanceScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const S = useMemo(() => createStyles(theme), [theme]);
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [myLots, setMyLots] = useState<any[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [myAttendance, setMyAttendance] = useState<any>(null);
  const [stats, setStats] = useState({ today: { present: 0, absent: 0, late: 0 }, totalExpected: 0 });
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFarm, setSelectedFarm] = useState<any>('ALL');
  const [selectedLotFilter, setSelectedLotFilter] = useState<any>('ALL');

  const isEmployee = userRole === 'EMPLOYE';

  const fetchData = async () => {
    setLoading(true);
    try {
      if (isEmployee) {
        const empRes = await repositoryProvider.api.get('/employees/me/');
        let lots: any[] = Array.isArray(empRes.data.lots_detail) ? empRes.data.lots_detail : [];
        if (lots.length === 0 && typeof empRes.data.lots_json === 'string') {
          try { const parsed = JSON.parse(empRes.data.lots_json); if (Array.isArray(parsed)) lots = parsed; } catch { /* ignore */ }
        }
        if (lots.length === 0 && Array.isArray(empRes.data.lots)) lots = empRes.data.lots;
        setMyLots(lots);
        if (lots.length > 0 && !selectedLotId) setSelectedLotId(lots[0].id);
        const lid = selectedLotId || (lots.length > 0 ? lots[0].id : null);
        if (lid) {
          const today = new Date().toISOString().split('T')[0];
          const attRes = await repositoryProvider.api.get(`/attendances/?date=${today}&lot=${lid}`);
          setMyAttendance(attRes.data.length > 0 ? attRes.data[0] : null);
        }
      } else {
        const params = new URLSearchParams();
        params.append('date', filterDate);
        if (selectedFarm !== 'ALL') params.append('farm', selectedFarm);
        if (selectedLotFilter !== 'ALL') params.append('lot', selectedLotFilter);
        const [empRes, attRes] = await Promise.all([
          repositoryProvider.api.get(`/employees/${selectedFarm !== 'ALL' ? `?farm=${selectedFarm}` : ''}`),
          repositoryProvider.api.get(`/attendances/?${params.toString()}`),
        ]);
        setEmployees(empRes.data);
        setAttendanceData(attRes.data);
        const present = attRes.data.filter((a: any) => a.status === 'PRESENT').length;
        const late = attRes.data.filter((a: any) => a.status === 'RETARD').length;
        setStats({
          today: { present, late, absent: Math.max(0, empRes.data.length - (present + late)) },
          totalExpected: empRes.data.length,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [isEmployee, selectedFarm, filterDate, selectedLotFilter, selectedLotId]);

  const handleClockIn = async () => {
    if (!selectedLotId) { Alert.alert(t('common.error'), t('attendance.selectLot')); return; }
    setLoading(true);
    try {
      const res = await repositoryProvider.api.post('/attendances/clock_in/', { lot_id: selectedLotId });
      setMyAttendance(res.data);
      Alert.alert(t('common.success'), t('attendance.clockInSuccess', { time: res.data.clock_in }));
    } catch (e: any) {
      const message = getErrorMessage(e, 'Erreur lors du pointage.');
      if (Platform.OS === 'web') toast.error(t('common.error'), message);
      else Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!selectedLotId) return;
    setLoading(true);
    try {
      const res = await repositoryProvider.api.post('/attendances/clock_out/', { lot_id: selectedLotId });
      setMyAttendance(res.data);
      Alert.alert(t('common.success'), t('attendance.clockOutSuccess', { time: res.data.clock_out }));
    } catch (e: any) {
      const message = getErrorMessage(e, 'Erreur lors du pointage.');
      if (Platform.OS === 'web') toast.error(t('common.error'), message);
      else Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const updateAttendanceStatus = async (attendanceId: number, newStatus: string) => {
    try {
      const res = await repositoryProvider.api.patch(`/attendances/${attendanceId}/`, { status: newStatus });
      const previousAttendance = attendanceData.find((a) => a.id === attendanceId);
      setAttendanceData((prev) => prev.map((a) => (a.id === attendanceId ? res.data : a)));
      if (previousAttendance?.status !== newStatus) {
        setStats((prev) => {
          const present = prev.today.present - (previousAttendance?.status === 'PRESENT' ? 1 : 0) + (newStatus === 'PRESENT' ? 1 : 0);
          const late = prev.today.late - (previousAttendance?.status === 'RETARD' ? 1 : 0) + (newStatus === 'RETARD' ? 1 : 0);
          return { ...prev, today: { present, late, absent: Math.max(0, employees.length - present - late) } };
        });
      }
    } catch (e: any) {
      const message = getErrorMessage(e, t('attendance.statusUpdateError'));
      if (Platform.OS === 'web') toast.error(t('common.error'), message);
      else Alert.alert(t('common.error'), message);
    }
  };

  const handleEditAttendance = (attendance: any) => {
    if (Platform.OS === 'web') {
      const choice = window.prompt(
        `${t('attendance.changeStatusTitle')}\n${t('attendance.changeStatusMessage')}\n\n1. ${t('attendance.present')}\n2. ${t('attendance.late')}\n3. ${t('attendance.absent')}`,
        attendance.status,
      );
      if (choice === null) return;
      const statusByChoice: Record<string, string> = {
        '1': 'PRESENT', '2': 'RETARD', '3': 'ABSENT',
        PRESENT: 'PRESENT', RETARD: 'RETARD', ABSENT: 'ABSENT',
      };
      const newStatus = statusByChoice[choice.trim().toUpperCase()];
      if (newStatus) updateAttendanceStatus(attendance.id, newStatus);
      return;
    }
    Alert.alert(t('attendance.changeStatusTitle'), t('attendance.changeStatusMessage'), [
      { text: t('attendance.present'), onPress: () => updateAttendanceStatus(attendance.id, 'PRESENT') },
      { text: t('attendance.late'), onPress: () => updateAttendanceStatus(attendance.id, 'RETARD') },
      { text: t('attendance.absent'), onPress: () => updateAttendanceStatus(attendance.id, 'ABSENT') },
      { text: t('attendance.cancel'), style: 'cancel' },
    ]);
  };

  const OwnerHeader = () => (
    <View style={{ gap: space.md, marginBottom: space.sm }}>
      <View style={S.statsRow}>
        <StatTile label={t('attendance.present') || 'Présents'} value={stats.today.present} icon="account-check" accent="#2E7D32" />
        <StatTile label={t('attendance.late') || 'Retards'} value={stats.today.late} icon="clock-alert-outline" accent="#F57C00" />
        <StatTile label={t('attendance.absent') || 'Absents'} value={stats.today.absent} icon="account-off" accent={theme.colors.danger} />
      </View>
      <Card style={{ marginBottom: 0, gap: space.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('common.allFarms')} active={selectedFarm === 'ALL'} onPress={() => { setSelectedFarm('ALL'); setSelectedLotFilter('ALL'); }} />
        </ScrollView>
        <DatePicker label={t('common.date')} value={filterDate} onChange={setFilterDate} />
      </Card>
    </View>
  );

  const renderEmployeeItem = ({ item }: { item: any }) => {
    const attendances = attendanceData.filter((a) => a.employee === item.id);
    return (
      <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
        <View style={{ marginBottom: space.md }}>
          <View style={S.empHead}>
            <Text style={[S.empName, { color: theme.colors.text }]}>{item.user_name}</Text>
            <Text style={S.empPos}>{item.position}</Text>
          </View>
          {attendances.length > 0 ? attendances.map((att) => (
            <Card key={att.id} style={S.attCard} padding={space.sm}>
              <View style={S.attRow}>
                <View style={[S.attLot, { backgroundColor: theme.colors.primary + '15' }]}>
                  <MaterialIcons name="layers" size={13} color={theme.colors.primary} />
                  <Text style={[S.attLotText, { color: theme.colors.primary }]}>{att.lot_name}</Text>
                </View>
                <Badge label={att.status} color={getStatusColor(att.status, theme)} />
              </View>
              <View style={S.attTimes}>
                <Text style={S.attTime}>{t('attendance.inLabel')} <Text style={{ fontWeight: '800', color: theme.colors.text }}>{att.clock_in?.substring(0, 5) || '--:--'}</Text></Text>
                <Text style={S.attTime}>{t('attendance.outLabel')} <Text style={{ fontWeight: '800', color: theme.colors.text }}>{att.clock_out?.substring(0, 5) || '--:--'}</Text></Text>
                <Pressable onPress={() => handleEditAttendance(att)} style={[S.editBtn, { backgroundColor: theme.colors.background }]} hitSlop={6}>
                  <MaterialIcons name="edit" size={15} color={theme.colors.primary} />
                </Pressable>
              </View>
            </Card>
          )) : (
            <Text style={S.noAtt}>{t('attendance.noAttendanceDeclared')}</Text>
          )}
        </View>
      </View>
    );
  };

  const IndividualView = () => (
    <Card style={S.statusCard}>
      <MaterialIcons name="person-pin-circle" size={44} color={theme.colors.primary} />
      <Text style={[S.statusTitle, { color: theme.colors.text }]}>{t('attendance.individualAttendance')}</Text>

      <View style={{ width: '100%', marginTop: space.lg }}>
        <Text style={S.selectorLabel}>{t('attendance.selectLotWork')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
          {myLots.map((lot) => (
            <Chip key={lot.id} label={lot.name} active={selectedLotId === lot.id} onPress={() => setSelectedLotId(lot.id)} />
          ))}
        </ScrollView>
      </View>

      <View style={[S.clockRow, { backgroundColor: theme.colors.background }]}>
        <View style={S.clockItem}>
          <Text style={S.clockLabel}>{t('attendance.clockIn')}</Text>
          <Text style={[S.clockTime, { color: myAttendance?.clock_in ? theme.colors.primary : theme.colors.textSecondary }]}>
            {myAttendance?.clock_in ? myAttendance.clock_in.substring(0, 5) : '--:--'}
          </Text>
        </View>
        <View style={[S.clockDivider, { backgroundColor: theme.colors.border }]} />
        <View style={S.clockItem}>
          <Text style={S.clockLabel}>{t('attendance.clockOut')}</Text>
          <Text style={[S.clockTime, { color: myAttendance?.clock_out ? theme.colors.primary : theme.colors.textSecondary }]}>
            {myAttendance?.clock_out ? myAttendance.clock_out.substring(0, 5) : '--:--'}
          </Text>
        </View>
      </View>

      <View style={S.btnRow}>
        <Button title={t('attendance.clockIn')} onPress={handleClockIn} disabled={!!myAttendance?.clock_in || loading} variant="success" style={S.clockBtn} icon={<MaterialIcons name="play-arrow" size={20} color="white" />} />
        <Button title={t('attendance.clockOut')} onPress={handleClockOut} disabled={!myAttendance?.clock_in || !!myAttendance?.clock_out || loading} variant="danger" style={S.clockBtn} icon={<MaterialIcons name="stop" size={20} color="white" />} />
      </View>

      {myAttendance?.updated_by_name && (
        <Text style={[S.correctionNote, { color: '#F57C00' }]}>* Pointage ajusté par {myAttendance.updated_by_name}</Text>
      )}
    </Card>
  );

  return (
    <Screen
      scroll={isEmployee}
      width={isEmployee ? 'narrow' : 'wide'}
      header={
        <ScreenHeader
          title={isEmployee ? t('attendance.individualAttendance') : t('attendance.title')}
          onBack={() => navigation.goBack()}
          actions={[{ icon: 'history', onPress: () => navigation.navigate('AttendanceHistory'), tint: theme.colors.primary }]}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : isEmployee ? (
        <IndividualView />
      ) : (
        <FlatList
          key={numColumns}
          data={employees}
          numColumns={numColumns}
          renderItem={renderEmployeeItem}
          keyExtractor={(item) => item.id.toString()}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.md } : undefined}
          ListHeaderComponent={<OwnerHeader />}
          ListEmptyComponent={<EmptyState icon="account-group-outline" title={t('common.noData')} />}
          onRefresh={fetchData}
          refreshing={refreshing}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  statsRow: { flexDirection: 'row', gap: space.sm },

  statusCard: { alignItems: 'center', padding: space.xl, borderRadius: radius.xl, marginBottom: 0 },
  statusTitle: { fontSize: 20, fontWeight: '900', marginTop: space.sm, textTransform: 'uppercase', textAlign: 'center' },
  selectorLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  clockRow: { flexDirection: 'row', alignItems: 'center', padding: space.lg, borderRadius: radius.lg, marginVertical: space.lg, width: '100%' },
  clockItem: { flex: 1, alignItems: 'center' },
  clockLabel: { fontSize: 10, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '800', textTransform: 'uppercase' },
  clockTime: { fontSize: 28, fontWeight: '900' },
  clockDivider: { width: 1, height: 40, marginHorizontal: space.md },
  btnRow: { flexDirection: 'row', width: '100%', gap: space.sm },
  clockBtn: { flex: 1, height: 54, borderRadius: radius.md },
  correctionNote: { fontSize: 11, marginTop: space.md, fontStyle: 'italic' },

  empHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingHorizontal: 4 },
  empName: { fontSize: 15.5, fontWeight: '900' },
  empPos: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  attCard: { marginBottom: 8, borderRadius: radius.md },
  attRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  attLot: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  attLotText: { fontSize: 11, fontWeight: '800' },
  attTimes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attTime: { fontSize: 13, color: theme.colors.textSecondary },
  editBtn: { marginLeft: 'auto', padding: 6, borderRadius: radius.sm },
  noAtt: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: 'italic', marginLeft: 4 },
});
