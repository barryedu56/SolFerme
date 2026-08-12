import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmptyState } from '../components/EmptyState';
import { useAutoRefreshData } from '../hooks/useDataChange';

export const FarmsScreen = ({ navigation }: any) => {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { userRole } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const numColumns = isTablet ? 2 : 1;

  const [includeArchived, setIncludeArchived] = useState(false);

  const fetchFarms = async () => {
    setLoading(true);
    try {
      const response = await repositoryProvider.api.get('/farms/', {
        params: { status: includeArchived ? 'ARCHIVE' : 'ACTIF' }
      });
      setFarms(response.data);
    } catch (error) {
      console.log('Erreur fetch farms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useAutoRefreshData(['farms'], fetchFarms, 150);

  useEffect(() => {
    fetchFarms();
  }, [includeArchived]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFarms();
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={isTablet ? styles.tabletCardContainer : null}>
      <Card style={[styles.farmCard, item.status === 'ARCHIVE' && styles.archivedCard]}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FarmDetail', { farmId: item.id, farmName: item.name })}
          activeOpacity={0.7}
          style={styles.cardHeader}
        >
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name={item.status === 'ARCHIVE' ? "archive" : "egg"}
              size={28}
              color={item.status === 'ARCHIVE' ? theme.colors.textSecondary : theme.colors.primary}
            />
          </View>
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.farmName} numberOfLines={1}>{item.name}</Text>
              {item.status === 'ARCHIVE' && (
                <View style={styles.archiveBadge}>
                  <Text style={styles.archiveBadgeText}>{t('profile.inactive')}</Text>
                </View>
              )}
            </View>
            <View style={styles.locationRow}>
              <MaterialIcons name="location-on" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.farmLocation} numberOfLines={1}>{item.location || t('common.noData')}</Text>
            </View>
          </View>

          {userRole !== 'EMPLOYE' ? (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('CreateFarm', { farm: item })}
            >
              <MaterialIcons name="edit" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </Card>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{userRole === 'EMPLOYE' ? t('profile.myFarm') : t('farms.all')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {userRole === 'EMPLOYE' ? t('settings.guides.employee.lots.content') : t('farms.illustrationText')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={[styles.filterBtn, includeArchived && styles.filterBtnActive]}
              onPress={() => setIncludeArchived(!includeArchived)}
            >
              <MaterialIcons
                name="archive"
                size={22}
                color={includeArchived ? theme.colors.surface : theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          {userRole !== 'EMPLOYE' && (
            <TouchableOpacity
              style={styles.addCircle}
              onPress={() => navigation.navigate('CreateFarm')}
            >
              <MaterialIcons name="add" size={28} color="#000000" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={farms}
          numColumns={numColumns}
          keyExtractor={(item: any) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          columnWrapperStyle={isTablet ? styles.columnWrapper : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="office-building"
              title={t('common.noData')}
              description={userRole !== 'EMPLOYE' ? t('farms.addFarm') : undefined}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
    marginBottom: theme.spacing.s,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  list: {
    padding: theme.spacing.m,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  tabletCardContainer: {
    flex: 0.49, // Presque 50% pour laisser un peu d'espace au milieu
  },
  farmCard: {
    marginBottom: theme.spacing.m,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  cardInfo: {
    flex: 1,
  },
  farmName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  farmLocation: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  editBtn: {
    padding: 8,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.s,
    ...theme.shadows.light,
  },
  filterBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  archivedCard: {
    opacity: 0.6,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  archiveBadge: {
    backgroundColor: theme.colors.textSecondary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  archiveBadgeText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  emptyLink: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginTop: 10,
    textDecorationLine: 'underline',
  }
});