import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useContentWidth, Screen, ScreenHeader, Card, Badge, EmptyState, space, radius } from '../components/ui';

export const AttendanceHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const S = useMemo(() => createStyles(theme), [theme]);
  const contentW = useContentWidth('narrow');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = async () => {
    try {
      const res = await repositoryProvider.api.get('/attendances/');
      const grouped = res.data.reduce((acc: any, curr: any) => {
        const date = curr.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(curr);
        return acc;
      }, {});
      const sorted = Object.keys(grouped)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .map((date) => ({
          date,
          data: grouped[date],
          present: grouped[date].filter((a: any) => a.status === 'PRESENT').length,
          late: grouped[date].filter((a: any) => a.status === 'LATE').length,
          absent: grouped[date].filter((a: any) => a.status === 'ABSENT').length,
        }));
      setHistory(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchHistory(); };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return '#2E7D32';
      case 'LATE': return '#F57C00';
      case 'ABSENT': return theme.colors.danger;
      default: return theme.colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <Card style={S.card}>
      <View style={S.head}>
        <View style={S.dateInfo}>
          <MaterialIcons name="event" size={18} color={theme.colors.primary} />
          <Text style={[S.dateText, { color: theme.colors.text }]}>
            {new Date(item.date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={S.pills}>
          <View style={[S.pill, { backgroundColor: '#2E7D32' + '20' }]}><Text style={[S.pillTxt, { color: '#2E7D32' }]}>{item.present}</Text></View>
          <View style={[S.pill, { backgroundColor: '#F57C00' + '20' }]}><Text style={[S.pillTxt, { color: '#F57C00' }]}>{item.late}</Text></View>
          <View style={[S.pill, { backgroundColor: theme.colors.danger + '20' }]}><Text style={[S.pillTxt, { color: theme.colors.danger }]}>{item.absent}</Text></View>
        </View>
      </View>

      <View style={[S.divider, { backgroundColor: theme.colors.border }]} />

      {item.data.map((att: any, idx: number) => (
        <View key={att.id} style={[S.empRow, { borderBottomColor: theme.colors.border }, idx === item.data.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={[S.empName, { color: theme.colors.text }]} numberOfLines={1}>{att.employee_name || `Employé #${att.employee}`}</Text>
          <Badge label={t(`attendance.${att.status.toLowerCase()}`)} color={getStatusColor(att.status)} />
        </View>
      ))}
    </Card>
  );

  return (
    <Screen header={<ScreenHeader title={t('attendance.history')} onBack={() => navigation.goBack()} />}>
      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.date}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={<EmptyState icon="history" title={t('common.noData')} />}
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: { marginBottom: 0, borderRadius: radius.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dateText: { fontSize: 14.5, fontWeight: '800', textTransform: 'capitalize' },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pillTxt: { fontSize: 12, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  empRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  empName: { fontSize: 13.5, flex: 1 },
});
