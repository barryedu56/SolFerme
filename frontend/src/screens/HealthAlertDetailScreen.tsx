import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { apiClient } from '../api/client';

export const HealthAlertDetailScreen = ({ route, navigation }: any) => {
  const { alert } = route.params;
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'RED': return '#D32F2F';
      case 'ORANGE': return '#F57C00';
      case 'GREEN': return '#388E3C';
      case 'BLUE': return '#1976D2';
      default: return theme.colors.textSecondary;
    }
  };

  const markAsViewed = async () => {
    try {
      setLoading(true);
      await apiClient.post(`/health-alerts/${alert.id}/mark_as_viewed/`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Impossible de marquer cette alerte comme vue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Détails de l'Alerte</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusBanner, { backgroundColor: getStatusColor(alert.color) }]}>
          <MaterialIcons name="warning" size={40} color="#FFF" />
          <Text style={styles.alertType}>{alert.type}</Text>
          <Text style={styles.alertDate}>{new Date(alert.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <DetailRow label="Lot concerné" value={alert.lot_name} theme={theme} />
          <DetailRow label="Quantité" value={`${alert.quantity} sujets`} theme={theme} />
          {alert.reason && <DetailRow label="Cause / Raison" value={alert.reason} theme={theme} />}
          <DetailRow label="Déclaré par" value={alert.created_by_name} theme={theme} />
        </View>

        {!alert.is_viewed && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={markAsViewed}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Marquer comme vue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailRow = ({ label, value, theme }: any) => (
  <View style={styles.row}>
    <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
    <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 16 },
  statusBanner: { padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  alertType: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  alertDate: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },
  card: { padding: 20, borderRadius: 16, marginBottom: 20 },
  row: { marginBottom: 15 },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '600' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
});
