import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { useAutoRefreshData } from '../hooks/useDataChange';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { toast } from '../utils/toast';
import { Screen, ScreenHeader, useContentWidth, Card, Badge, EmptyState, radius, space, shadow } from '../components/ui';

export const FarmsScreen = ({ navigation }: any) => {
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { userRole } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop, isTablet } = useBreakpoint();
  const isEmployee = userRole === 'EMPLOYE';
  const numColumns = isDesktop ? 3 : isTablet ? 2 : 1;
  const contentW = useContentWidth('wide');
  const S = useMemo(() => createStyles(theme), [theme]);

  const fetchFarms = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/farms/', {
        params: { status: includeArchived ? 'ARCHIVE' : 'ACTIF' },
      });
      setFarms(Array.isArray(response.data) ? response.data : response.data?.results || []);
    } catch (error) {
      console.log('Erreur fetch farms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useAutoRefreshData(['farms'], fetchFarms, 150);
  useEffect(() => { fetchFarms(); }, [includeArchived]);

  const onRefresh = () => { setRefreshing(true); fetchFarms(); };

  const handleReactivate = async (farm: any) => {
    try {
      await repositoryProvider.farm.reactivate(farm.id);
      toast.success(t('common.success'), t('farms.reactivateSuccess'));
      fetchFarms();
    } catch (error: any) {
      toast.error(t('common.error'), error.response?.data?.error || error.response?.data?.detail || t('farms.reactivateError'));
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const archived = item.status === 'ARCHIVE';
    return (
      <View style={numColumns > 1 ? { flex: 1 / numColumns } : undefined}>
        <Card style={[S.card, archived && { opacity: 0.72 }]} padding={0}>
          <Pressable
            onPress={() => navigation.navigate('FarmDetail', { farmId: item.id, farmName: item.name })}
            style={({ hovered }: any) => [S.cardInner, hovered && { backgroundColor: theme.colors.border + '22' }]}
          >
            <View style={[S.iconBox, { backgroundColor: (archived ? theme.colors.textSecondary : theme.colors.primary) + '1F' }]}>
              <MaterialCommunityIcons
                name={archived ? 'archive-outline' : 'home-group'}
                size={24}
                color={archived ? theme.colors.textSecondary : theme.colors.primary}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={S.nameRow}>
                <Text style={S.name} numberOfLines={1}>{item.name}</Text>
                {archived && <Badge label={t('profile.inactive')} color={theme.colors.textSecondary} />}
              </View>
              <View style={S.metaRow}>
                <MaterialIcons name="location-on" size={13} color={theme.colors.textSecondary} />
                <Text style={S.meta} numberOfLines={1}>{item.location || t('common.noData')}</Text>
              </View>
            </View>

            {!isEmployee && archived ? (
              <Pressable onPress={() => handleReactivate(item)} hitSlop={8} style={S.actBtn} accessibilityLabel={t('common.reactivate')}>
                <MaterialIcons name="unarchive" size={20} color={theme.colors.success} />
              </Pressable>
            ) : !isEmployee ? (
              <Pressable onPress={() => navigation.navigate('CreateFarm', { farm: item })} hitSlop={8} style={S.actBtn}>
                <MaterialIcons name="edit" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            ) : (
              <MaterialIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
            )}
          </Pressable>
        </Card>
      </View>
    );
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={isEmployee ? t('profile.myFarm') : t('farms.all')}
          subtitle={isEmployee ? undefined : t('farms.illustrationText')}
          large
          actions={
            isEmployee
              ? []
              : [
                  { icon: includeArchived ? 'unarchive' : 'archive', onPress: () => setIncludeArchived((v) => !v), tint: includeArchived ? theme.colors.primary : theme.colors.textSecondary },
                  { icon: 'add', onPress: () => navigation.navigate('CreateFarm'), tint: theme.colors.text },
                ]
          }
        />
      }
    >
      {loading && !refreshing ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          key={numColumns}
          data={farms}
          numColumns={numColumns}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderItem}
          style={{ width: '100%' }}
          contentContainerStyle={[contentW, { paddingTop: space.md, paddingBottom: space.xxl, gap: space.sm }]}
          columnWrapperStyle={numColumns > 1 ? { gap: space.sm } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="home-group"
              title={t('common.noData')}
              description={isEmployee ? undefined : t('farms.addFarm')}
              action={isEmployee ? undefined : { label: t('farms.addFarm'), onPress: () => navigation.navigate('CreateFarm') }}
            />
          }
        />
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  card: { marginBottom: 0, borderRadius: radius.lg, overflow: 'hidden' },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  iconBox: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16.5, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  meta: { fontSize: 13, color: theme.colors.textSecondary, flexShrink: 1 },
  actBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
});
