import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { repositoryProvider } from '../repositories';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';
import { Screen, ScreenHeader, Card, Badge, SectionHeader, space, radius } from '../components/ui';

const LOT_LINKED_TYPES = new Set(['MORTALITE', 'MALADIE', 'GUERISON', 'AJOUT', 'VENTE']);

export const HealthAlertDetailScreen = ({ route, navigation }: any) => {
  const { alert } = route.params;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isOwner = userRole === 'PROPRIETAIRE';
  const [loading, setLoading] = useState(false);
  const [viewed, setViewed] = useState(!!alert.is_viewed);

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'RED': return '#D32F2F';
      case 'ORANGE': return '#F57C00';
      case 'GREEN': return '#388E3C';
      case 'BLUE': return '#1976D2';
      case 'PURPLE': return '#9C27B0';
      default: return theme.colors.textSecondary;
    }
  };

  const markAsViewed = async () => {
    try {
      setLoading(true);
      await repositoryProvider.api.post(`/health-alerts/${alert.id}/mark_as_viewed/`);
      setViewed(true);
      toast.success(t('healthAlertDetail.viewedOk'));
      navigation.goBack();
    } catch (error) {
      toast.error(t('healthAlertDetail.viewError'));
    } finally {
      setLoading(false);
    }
  };

  const openLot = () => {
    const lotId = alert.lot_id ?? alert.lot;
    if (!lotId) return;
    navigation.navigate('RootDrawer', {
      screen: 'MainTabs',
      params: {
        screen: 'Farms',
        params: {
          screen: 'LotDetail',
          params: { lotId, lotName: alert.lot_name, farmId: alert.farm_id ?? alert.farm },
        },
      },
    });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return t('healthAlertDetail.dateUnknown');
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return t('healthAlertDetail.invalidDate');
    return date.toLocaleDateString(t('common.dateLocale'), { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const lotLinked = LOT_LINKED_TYPES.has(alert.type) && (alert.lot_id ?? alert.lot);
  const banner = getStatusColor(alert.color);

  const DetailRow = ({ label, value }: any) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <Screen scroll width="narrow" header={<ScreenHeader title={t('healthAlertDetail.title')} onBack={() => navigation.goBack()} />}>
      <View style={[styles.statusBanner, { backgroundColor: banner }]}>
        <MaterialIcons name="notification-important" size={38} color="#FFF" />
        <Text style={styles.alertType}>{alert.type || t('healthAlertDetail.health')}</Text>
        <Text style={styles.alertDate}>{formatDate(alert.date || alert.created_at)}</Text>
        {viewed && (
          <View style={styles.viewedBadge}>
            <MaterialIcons name="check-circle" size={14} color="#FFF" />
            <Text style={styles.viewedBadgeText}>{t('healthAlertDetail.viewedBadge')}</Text>
          </View>
        )}
      </View>

      <Card style={styles.card}>
        <DetailRow label={t('healthAlertDetail.farm')} value={alert.farm_name || t('healthAlertDetail.unknown')} />
        <DetailRow label={t('healthAlertDetail.lot')} value={alert.lot_name || t('healthAlertDetail.unknown')} />
        <DetailRow label={t('healthAlertDetail.event')} value={alert.type || t('healthAlertDetail.unknown')} />
        <DetailRow label={t('healthAlertDetail.quantity')} value={alert.quantity !== undefined ? `${alert.quantity} ${t('healthAlertDetail.subjects')}` : t('healthAlertDetail.unknown')} />
        <DetailRow label={t('healthAlertDetail.performedBy')} value={alert.created_by_name || t('healthAlertDetail.unknownUser')} />
      </Card>

      {(lotLinked || (isOwner && !viewed)) && (
        <SectionHeader title={t('healthAlertDetail.recommendedActions')} />
      )}

      {lotLinked && (
        <Pressable style={[styles.actionButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={openLot}>
          <MaterialIcons name="visibility" size={20} color={theme.colors.primary} />
          <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>{t('healthAlertDetail.viewLot')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      )}

      {isOwner && !viewed && (
        <Pressable style={[styles.button, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]} onPress={markAsViewed} disabled={loading}>
          <MaterialIcons name="done" size={20} color="#000" />
          <Text style={styles.buttonText}>{t('healthAlertDetail.markAsViewed')}</Text>
        </Pressable>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  statusBanner: { padding: space.xl, borderRadius: radius.lg, alignItems: 'center', marginBottom: space.lg },
  alertType: { color: '#FFF', fontSize: 21, fontWeight: '800', marginTop: 10 },
  alertDate: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  viewedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  viewedBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  card: { padding: space.lg, borderRadius: radius.lg, marginBottom: space.lg },
  row: { marginBottom: space.md },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '600' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.md, borderWidth: 1, marginBottom: space.sm },
  actionButtonText: { flex: 1, fontSize: 15, fontWeight: '600' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: space.md, borderRadius: radius.md, marginTop: space.sm },
  buttonText: { color: '#000', fontWeight: '800', fontSize: 16 },
});
