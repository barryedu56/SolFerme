import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export const AttendanceHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = async () => {
    try {
      const res = await repositoryProvider.api.get('/attendances/');
      // On groupe par date
      const grouped = res.data.reduce((acc: any, curr: any) => {
        const date = curr.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(curr);
        return acc;
      }, {});

      const sorted = Object.keys(grouped)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .map(date => ({
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

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return theme.colors.success;
      case 'LATE': return theme.colors.warning;
      case 'ABSENT': return theme.colors.danger;
      default: return theme.colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <Card style={styles.dateCard}>
      <View style={styles.cardHeader}>
        <View style={styles.dateInfo}>
          <MaterialIcons name="event" size={20} color={theme.colors.primary} />
          <Text style={styles.dateText}>
            {new Date(item.date).toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statBadge, { backgroundColor: theme.colors.success + '20' }]}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>{item.present}</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: theme.colors.warning + '20' }]}>
            <Text style={[styles.statValue, { color: theme.colors.warning }]}>{item.late}</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: theme.colors.danger + '20' }]}>
            <Text style={[styles.statValue, { color: theme.colors.danger }]}>{item.absent}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {item.data.map((att: any, idx: number) => (
        <View key={att.id} style={[styles.empRow, idx === item.data.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.empName}>{att.employee_name || `Employé #${att.employee}`}</Text>
          <View style={[styles.statusTag, { backgroundColor: getStatusColor(att.status) + '15' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(att.status) }]}>
              {t(`attendance.${att.status.toLowerCase()}`)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('attendance.history')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={item => item.date}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={60} color={theme.colors.border} />
              <Text style={styles.emptyText}>{t('common.noData')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  list: { padding: theme.spacing.m },
  dateCard: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s,
  },
  dateInfo: { flexDirection: 'row', alignItems: 'center' },
  dateText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginLeft: 8,
    textTransform: 'capitalize'
  },
  statsRow: { flexDirection: 'row' },
  statBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  statValue: { fontSize: 12, fontWeight: 'bold' },
  divider: {
    height: 0.8,
    backgroundColor: theme.colors.border + '40',
    marginVertical: theme.spacing.s,
  },
  empRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.8,
    borderBottomColor: theme.colors.border + '20',
  },
  empName: { fontSize: 14, color: theme.colors.text },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 16, color: theme.colors.textSecondary, fontSize: 16 }
});