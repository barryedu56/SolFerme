import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export const AttendanceScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t, activeLanguage } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<number, string>>({}); // employeeId -> status ('PRESENT', 'ABSENT', 'LATE')

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/employees/');
      setEmployees(res.data);
      // Initialize with 'PRESENT' (aligned with backend ChoiceField)
      const initial: Record<number, string> = {};
      res.data.forEach((emp: any) => initial[emp.id] = 'PRESENT');
      setAttendance(initial);
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('attendance.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const setStatus = (id: number, status: string) => {
    setAttendance(prev => ({ ...prev, [id]: status }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Vérifier d'abord si un pointage existe déjà pour aujourd'hui
      const existingRes = await apiClient.get(`/attendances/?date=${today}`);
      if (existingRes.data.length > 0) {
        Alert.alert(t('common.info'), t('attendance.alreadyDone'));
        setLoading(false);
        return;
      }

      const promises = Object.entries(attendance).map(([employeeId, status]) => {
        return apiClient.post('/attendances/', {
          employee: parseInt(employeeId),
          date: today,
          status: status,
        });
      });

      await Promise.all(promises);
      Alert.alert(t('common.success'), t('attendance.success'));
      navigation.goBack();
    } catch (e: any) {
      console.log(e);
      Alert.alert(t('common.error'), t('attendance.error'));
    } finally {
      setLoading(false);
    }
  };

  const renderEmployee = ({ item }: { item: any }) => {
    const status = attendance[item.id];
    const name = item.user_name || `Employé #${item.user}`;

    return (
      <Card style={styles.empCard}>
        <View style={styles.empInfo}>
          <View style={styles.avatarMini}>
            <Text style={styles.avatarText}>{name.charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.empName}>{name}</Text>
            <Text style={styles.empPos}>{item.position || t('attendance.defaultPosition')}</Text>
          </View>
        </View>
        <View style={styles.actions}>
           <TouchableOpacity
             onPress={() => setStatus(item.id, 'PRESENT')}
             style={[
               styles.statusBtn,
               status === 'PRESENT' && { backgroundColor: theme.colors.success + '20', borderColor: theme.colors.success, borderWidth: 1.5 }
             ]}
           >
              <MaterialIcons
                name="check-circle"
                size={22}
                color={status === 'PRESENT' ? theme.colors.success : theme.colors.border}
              />
           </TouchableOpacity>
           <TouchableOpacity
             onPress={() => setStatus(item.id, 'LATE')}
             style={[
               styles.statusBtn,
               status === 'LATE' && { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning, borderWidth: 1.5 }
             ]}
           >
              <MaterialIcons
                name="access-time"
                size={22}
                color={status === 'LATE' ? theme.colors.warning : theme.colors.border}
              />
           </TouchableOpacity>
           <TouchableOpacity
             onPress={() => setStatus(item.id, 'ABSENT')}
             style={[
               styles.statusBtn,
               status === 'ABSENT' && { backgroundColor: theme.colors.danger + '20', borderColor: theme.colors.danger, borderWidth: 1.5 }
             ]}
           >
              <MaterialIcons
                name="cancel"
                size={22}
                color={status === 'ABSENT' ? theme.colors.danger : theme.colors.border}
              />
           </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('attendance.title')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AttendanceHistory')} style={styles.backButton}>
          <MaterialIcons name="history" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dateHeader}>
        <MaterialIcons name="event" size={20} color={theme.colors.primary} />
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString(activeLanguage === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={employees}
            renderItem={renderEmployee}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialIcons name="group-off" size={48} color={theme.colors.border} />
                <Text style={styles.empty}>{t('attendance.noEmployees')}</Text>
              </View>
            }
          />
          <View style={styles.footer}>
            <Button
              title={t('attendance.submit')}
              onPress={handleSave}
              style={styles.saveBtn}
            />
          </View>
        </View>
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
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.s,
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginLeft: 8,
    textTransform: 'capitalize'
  },
  list: { padding: theme.spacing.m },
  empCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  empInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.textSecondary },
  empName: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  empPos: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row' },
  statusBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border + '60',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: theme.colors.surface,
  },
  footer: {
    padding: theme.spacing.m,
    paddingBottom: Platform.OS === 'ios' ? 30 : theme.spacing.m,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    ...theme.shadows.medium
  },
  saveBtn: {
    height: 54,
    borderRadius: theme.borderRadius.l,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  empty: { textAlign: 'center', marginTop: 12, color: theme.colors.textSecondary, fontSize: 14 }
});
