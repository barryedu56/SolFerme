import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../components/Card';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const GlobalHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { userRole, userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      // Tentative de récupération du journal global
      const response = await apiClient.get('/activity-logs/').catch(err => {
        if (err.response?.status === 403) return { data: null };
        throw err;
      });

      if (response && response.data) {
        let data = response.data;

        // Filtrage si l'utilisateur est un employé
        if (userRole === 'EMPLOYE' && userName) {
          data = data.filter((log: any) => log.user_name === userName);
        }

        setLogs(data);
      } else {
        // FALLBACK: Reconstruction de l'historique pour l'employé
        // On récupère les données des différents modules
        const [prodRes, feedRes, healthRes, movRes] = await Promise.all([
          apiClient.get('/productions/').catch(() => ({ data: [] })),
          apiClient.get('/feeds/').catch(() => ({ data: [] })),
          apiClient.get('/health-records/').catch(() => ({ data: [] })),
          apiClient.get('/movements/').catch(() => ({ data: [] })),
        ]);

        const combinedLogs: any[] = [];

        if (Array.isArray(prodRes.data)) {
          prodRes.data
            .filter((p: any) => p.created_by_name === userName)
            .forEach((p: any) => combinedLogs.push({
              id: `p-${p.id}`,
              module: 'Production',
              action: 'Saisie Production',
              description: `${p.casiers_produits} casiers collectés (Lot: ${p.lot_name || p.lot})`,
              date: p.date,
              user_name: userName
            }));
        }

        if (Array.isArray(feedRes.data)) {
          feedRes.data
            .filter((f: any) => f.created_by_name === userName)
            .forEach((f: any) => combinedLogs.push({
              id: `f-${f.id}`,
              module: 'Alimentation',
              action: 'Distribution Aliment',
              description: `${f.quantity}kg de ${f.feed_type} distribués`,
              date: f.date,
              user_name: userName
            }));
        }

        if (Array.isArray(healthRes.data)) {
          healthRes.data
            .filter((h: any) => h.created_by_name === userName)
            .forEach((h: any) => combinedLogs.push({
              id: `h-${h.id}`,
              module: 'Santé',
              action: 'Soin / Traitement',
              description: `${h.treatment_type}: ${h.description}`,
              date: h.date,
              user_name: userName
            }));
        }

        if (Array.isArray(movRes.data)) {
          movRes.data
            .filter((m: any) => m.created_by_name === userName)
            .forEach((m: any) => combinedLogs.push({
              id: `m-${m.id}`,
              module: 'Mouvement',
              action: 'Mortalité / Mouvement',
              description: `${m.quantity} sujets - Raison: ${m.reason}`,
              date: m.date,
              user_name: userName
            }));
        }

        // Tri par date décroissante
        setLogs(combinedLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch (error) {
      console.log('Erreur historique:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const getIcon = (action: string, module: string) => {
    if (action.toLowerCase().includes('conversion')) return 'autorenew';
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

  const getIconColor = (action: string, module: string) => {
    if (action.toLowerCase().includes('conversion')) return '#9C27B0'; // Purple for conversion
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {userRole === 'EMPLOYE' ? 'Mon historique d\'actions' : 'Journal d\'activités global'}
        </Text>
        <TouchableOpacity onPress={fetchLogs} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={64} color={theme.colors.border} />
              <Text style={styles.emptyText}>Aucune activité enregistrée</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.logCard}>
              <View style={[styles.iconContainer, { backgroundColor: getIconColor(item.action, item.module) + '15' }]}>
                 <MaterialIcons name={getIcon(item.action, item.module) as any} size={24} color={getIconColor(item.action, item.module)} />
              </View>
              <View style={styles.logContent}>
                <View style={styles.row}>
                  <Text style={styles.logAction}>{item.action}</Text>
                  <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={styles.logDesc}>{item.description}</Text>
                {userRole !== 'EMPLOYE' && <Text style={styles.logUser}>Par : {item.user_name}</Text>}
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.xl, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, flex: 1, textAlign: 'center' },
  refreshButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, opacity: 0.5 },
  emptyText: { marginTop: 10, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  logCard: {
    flexDirection: 'row', padding: theme.spacing.m, marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: theme.colors.border + '40',
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m,
  },
  logContent: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logAction: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, flex: 1 },
  logDate: { fontSize: 11, color: theme.colors.textSecondary },
  logDesc: { fontSize: 13, color: theme.colors.textSecondary, marginVertical: 4 },
  logUser: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
});
