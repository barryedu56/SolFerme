import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DatePicker } from '../components/DatePicker';

export const AttendanceScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet, isDesktopOrTablet), [theme, isDesktop, isTablet, isDesktopOrTablet]);
  
  const numColumns = isDesktop ? 3 : (isTablet ? 2 : 1);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [myLots, setMyLots] = useState<any[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [myAttendance, setMyAttendance] = useState<any>(null);

  const [stats, setStats] = useState({
    today: { present: 0, absent: 0, late: 0 },
    totalExpected: 0
  });

  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFarm, setSelectedFarm] = useState<any>('ALL');
  const [selectedLotFilter, setSelectedLotFilter] = useState<any>('ALL');

  const isEmployee = userRole === 'EMPLOYE';

  const fetchData = async () => {
    setLoading(true);
    try {
      if (isEmployee) {
        const empRes = await repositoryProvider.api.get('/employees/me/');
        // Priorité 1: lots_detail (API ou normalizeFkFields from SQLite)
        // Priorité 2: lots_json (champ dénormalisé SQLite si lots_detail absent)
        // Priorité 3: lots (M2M complet)
        let lots: any[] = Array.isArray(empRes.data.lots_detail) ? empRes.data.lots_detail : [];
        if (lots.length === 0 && typeof empRes.data.lots_json === 'string') {
          try {
            const parsed = JSON.parse(empRes.data.lots_json);
            if (Array.isArray(parsed)) lots = parsed;
          } catch { /* ignore */ }
        }
        if (lots.length === 0 && Array.isArray(empRes.data.lots)) {
          lots = empRes.data.lots;
        }
        setMyLots(lots);

        if (lots.length > 0 && !selectedLotId) {
          setSelectedLotId(lots[0].id);
        }

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
          today: {
            present,
            late,
            absent: Math.max(0, empRes.data.length - (present + late))
          },
          totalExpected: empRes.data.length
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isEmployee, selectedFarm, filterDate, selectedLotFilter, selectedLotId]);

  const handleClockIn = async () => {
    if (!selectedLotId) {
      Alert.alert(t('common.error'), t('attendance.selectLot'));
      return;
    }
    setLoading(true);
    try {
      const res = await repositoryProvider.api.post('/attendances/clock_in/', { lot_id: selectedLotId });
      setMyAttendance(res.data);
      Alert.alert(t('common.success'), t('attendance.clockInSuccess', { time: res.data.clock_in }));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.detail || "Erreur lors du pointage.");
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
      Alert.alert(t('common.error'), e.response?.data?.detail || "Erreur lors du pointage.");
    } finally {
      setLoading(false);
    }
  };

  const updateAttendanceStatus = async (attendanceId: number, newStatus: string) => {
    try {
      const res = await repositoryProvider.api.patch(`/attendances/${attendanceId}/`, { status: newStatus });
      setAttendanceData(prev => prev.map(a => a.id === attendanceId ? res.data : a));
      fetchData(); // Refresh stats
    } catch (e) {
      Alert.alert(t('common.error'), t('attendance.statusUpdateError'));
    }
  };

  const renderOwnerHeader = () => (
    <View style={styles.statsContainer}>
      <View style={styles.statsRowTop}>
        <Card style={[styles.statCardSmall, { borderColor: theme.colors.success }]}>
          <Text style={styles.statLabelSmall}>{t('attendance.present') || 'Présents'}</Text>
          <Text style={[styles.statValueSmall, { color: theme.colors.success }]}>{stats.today.present}</Text>
        </Card>
        <Card style={[styles.statCardSmall, { borderColor: theme.colors.warning }]}>
          <Text style={styles.statLabelSmall}>{t('attendance.late') || 'Retards'}</Text>
          <Text style={[styles.statValueSmall, { color: theme.colors.warning }]}>{stats.today.late}</Text>
        </Card>
        <Card style={[styles.statCardSmall, { borderColor: theme.colors.danger }]}>
          <Text style={styles.statLabelSmall}>{t('attendance.absent') || 'Absents'}</Text>
          <Text style={[styles.statValueSmall, { color: theme.colors.danger }]}>{stats.today.absent}</Text>
        </Card>
      </View>

      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
           <TouchableOpacity
            style={[styles.filterChip, selectedFarm === 'ALL' && styles.filterChipActive]}
            onPress={() => { setSelectedFarm('ALL'); setSelectedLotFilter('ALL'); }}
           >
            <Text style={[styles.filterText, selectedFarm === 'ALL' && styles.filterTextActive]}>{t('common.allFarms')}</Text>
           </TouchableOpacity>
        </ScrollView>
        <View style={styles.datePickerWrap}>
          <DatePicker
            label={t('common.date')}
            value={filterDate}
            onChange={setFilterDate}
          />
        </View>
      </View>
    </View>
  );

  const renderEmployeeItem = ({ item }: { item: any }) => {
    const attendances = attendanceData.filter(a => a.employee === item.id);

    return (
      <View style={[styles.employeeGroup, isDesktopOrTablet && styles.employeeGroupDesktop]}>
        <View style={styles.employeeHeaderRow}>
            <Text style={styles.ownerEmpName}>{item.user_name}</Text>
            <Text style={styles.ownerEmpPos}>{item.position}</Text>
        </View>

        {attendances.length > 0 ? (
          attendances.map((att) => (
            <Card key={att.id} style={styles.attendanceSubCard}>
              <View style={styles.attRow}>
                <View style={styles.attLotInfo}>
                   <MaterialIcons name="layers" size={14} color={theme.colors.primary} />
                   <Text style={styles.attLotText}>{att.lot_name}</Text>
                </View>
                <View style={[styles.statusBadgeSmall, { backgroundColor: getStatusColor(att.status, theme) + '20' }]}>
                   <Text style={[styles.statusTextSmall, { color: getStatusColor(att.status, theme) }]}>{att.status}</Text>
                </View>
              </View>

              <View style={styles.attTimes}>
                 <Text style={styles.attTimeText}>{t('attendance.inLabel')} <Text style={{fontWeight:'700'}}>{att.clock_in?.substring(0,5) || '--:--'}</Text></Text>
                 <Text style={styles.attTimeText}>{t('attendance.outLabel')} <Text style={{fontWeight:'700'}}>{att.clock_out?.substring(0,5) || '--:--'}</Text></Text>

                 <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      t('attendance.changeStatusTitle'),
                      t('attendance.changeStatusMessage'),
                      [
                        { text: t('attendance.present'), onPress: () => updateAttendanceStatus(att.id, 'PRESENT') },
                        { text: t('attendance.late'), onPress: () => updateAttendanceStatus(att.id, 'RETARD') },
                        { text: t('attendance.absent'), onPress: () => updateAttendanceStatus(att.id, 'ABSENT') },
                        { text: t('attendance.cancel'), style: 'cancel' }
                      ]
                    )
                  }}
                  style={styles.editBtnSmall}
                 >
                    <MaterialIcons name="edit" size={16} color={theme.colors.primary} />
                 </TouchableOpacity>
              </View>
            </Card>
          ))
        ) : (
          <Text style={styles.noAttText}>{t('attendance.noAttendanceDeclared')}</Text>
        )}
      </View>
    );
  };

  const renderIndividualView = () => (
    <View style={[styles.individualContainer, isDesktop && styles.individualContainerDesktop]}>
      <Card style={styles.statusCard}>
        <MaterialIcons name="person-pin-circle" size={48} color={theme.colors.primary} />
        <Text style={styles.statusTitle}>{t('attendance.individualAttendance')}</Text>

        <View style={styles.lotSelectorContainer}>
          <Text style={styles.selectorLabel}>{t('attendance.selectLotWork')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.lotScroll}>
            {myLots.map((lot) => (
              <TouchableOpacity
                key={lot.id}
                style={[styles.lotChip, selectedLotId === lot.id && styles.lotChipActive]}
                onPress={() => setSelectedLotId(lot.id)}
              >
                <Text style={[styles.lotChipText, selectedLotId === lot.id && styles.lotChipTextActive]}>{lot.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.clockRow}>
          <View style={styles.clockItem}>
            <Text style={styles.clockLabel}>{t('attendance.clockIn')}</Text>
            <Text style={[styles.clockTime, !myAttendance?.clock_in && { color: theme.colors.textSecondary }]}>
              {myAttendance?.clock_in ? myAttendance.clock_in.substring(0, 5) : '--:--'}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.clockItem}>
            <Text style={styles.clockLabel}>{t('attendance.clockOut')}</Text>
            <Text style={[styles.clockTime, !myAttendance?.clock_out && { color: theme.colors.textSecondary }]}>
              {myAttendance?.clock_out ? myAttendance.clock_out.substring(0, 5) : '--:--'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Button
            title={t('attendance.clockIn')}
            onPress={handleClockIn}
            disabled={!!myAttendance?.clock_in || loading}
            variant="success"
            style={styles.clockButton}
            icon={<MaterialIcons name="play-arrow" size={20} color="white" />}
          />
          <Button
            title={t('attendance.clockOut')}
            onPress={handleClockOut}
            disabled={!myAttendance?.clock_in || !!myAttendance?.clock_out || loading}
            variant="danger"
            style={styles.clockButton}
            icon={<MaterialIcons name="stop" size={20} color="white" />}
          />
        </View>

        {myAttendance?.updated_by_name && (
          <Text style={styles.correctionNote}>
            * Pointage ajusté par {myAttendance.updated_by_name}
          </Text>
        )}
      </Card>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEmployee ? t('attendance.individualAttendance') : t('attendance.title')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AttendanceHistory')} style={styles.backButton}>
          <MaterialIcons name="history" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : isEmployee ? (
        renderIndividualView()
      ) : (
        <FlatList
          key={numColumns}
          data={employees}
          numColumns={numColumns}
          renderItem={renderEmployeeItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={[styles.list, isDesktopOrTablet && styles.listDesktop]}
          columnWrapperStyle={isDesktopOrTablet ? styles.columnWrapper : null}
          ListHeaderComponent={renderOwnerHeader}
          onRefresh={fetchData}
          refreshing={refreshing}
        />
      )}
    </SafeAreaView>
  );
};

const getStatusColor = (status: string, theme: any) => {
    switch(status) {
        case 'PRESENT': return theme.colors.success;
        case 'RETARD': return theme.colors.warning;
        case 'ABSENT': return theme.colors.danger;
        default: return theme.colors.textSecondary;
    }
};

const createStyles = (theme: any, isDesktop: boolean = false, isTablet: boolean = false, isDesktopOrTablet: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  list: { padding: theme.spacing.m },
  listDesktop: {
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  columnWrapper: {
    gap: theme.spacing.m,
  },
  individualContainer: { flex: 1, padding: theme.spacing.m, justifyContent: 'center' },
  individualContainerDesktop: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  statusCard: {
    width: '100%',
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderRadius: theme.borderRadius.xxl,
    ...theme.shadows.medium,
  },
  statusTitle: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: theme.spacing.m, textTransform: 'uppercase' },
  lotSelectorContainer: { width: '100%', marginTop: 24, marginBottom: 16 },
  selectorLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, textTransform: 'uppercase' },
  lotScroll: { flexDirection: 'row' },
  lotChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.background, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border },
  lotChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  lotChipText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  lotChipTextActive: { color: '#000' },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    marginVertical: 20,
    width: '100%',
  },
  clockItem: { flex: 1, alignItems: 'center' },
  clockLabel: { fontSize: 10, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '800', textTransform: 'uppercase' },
  clockTime: { fontSize: 28, fontWeight: '900', color: theme.colors.primary },
  divider: { width: 1, height: 40, marginHorizontal: theme.spacing.m },
  buttonRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  clockButton: { flex: 0.48, height: 56, borderRadius: 16 },
  correctionNote: { fontSize: 11, color: theme.colors.warning, marginTop: 16, fontStyle: 'italic' },

  statsContainer: { marginBottom: 20 },
  statsRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statCardSmall: { flex: 0.31, padding: 12, alignItems: 'center', borderRadius: 16, borderWidth: 1.5 },
  statLabelSmall: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  statValueSmall: { fontSize: 22, fontWeight: '900' },
  filterSection: { marginBottom: 10 },
  filterScroll: { flexDirection: 'row' },
  datePickerWrap: { marginTop: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  filterTextActive: { color: '#000' },

  employeeGroup: { marginBottom: 20 },
  employeeGroupDesktop: { flex: 1 },
  employeeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingHorizontal: 4 },
  ownerEmpName: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  ownerEmpPos: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  attendanceSubCard: { padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: theme.colors.surface },
  attRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  attLotInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  attLotText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary, marginLeft: 4 },
  statusBadgeSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusTextSmall: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  attTimes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attTimeText: { fontSize: 13, color: theme.colors.text },
  editBtnSmall: { marginLeft: 'auto', padding: 6, backgroundColor: theme.colors.background, borderRadius: 8 },
  noAttText: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: 'italic', marginLeft: 4 }
});