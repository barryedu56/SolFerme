import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FarmsScreen = ({ navigation }: any) => {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const numColumns = isTablet ? 2 : 1;

  const fetchFarms = async () => {
    setLoading(true);
    try {
      const role = await AsyncStorage.getItem('user_role');
      setUserRole(role);
      const response = await apiClient.get('/farms/');
      setFarms(response.data);
    } catch (error) {
      console.log('Erreur fetch farms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFarms();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFarms();
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={isTablet ? styles.tabletCardContainer : null}>
      <Card style={styles.farmCard}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FarmDetail', { farmId: item.id, farmName: item.name })}
          activeOpacity={0.7}
          style={styles.cardHeader}
        >
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="egg" size={28} color={theme.colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.farmName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.locationRow}>
              <MaterialIcons name="location-on" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.farmLocation} numberOfLines={1}>{item.location || 'Localisation non définie'}</Text>
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
        <View>
          <Text style={styles.title}>{userRole === 'EMPLOYE' ? 'Ma Ferme' : 'Mes Fermes'}</Text>
          <Text style={styles.subtitle}>
            {userRole === 'EMPLOYE' ? 'Votre exploitation affectée' : 'Gérez vos exploitations'}
          </Text>
        </View>
        {userRole !== 'EMPLOYE' && (
          <TouchableOpacity
            style={styles.addCircle}
            onPress={() => navigation.navigate('CreateFarm')}
          >
            <MaterialIcons name="add" size={28} color={theme.colors.text} />
          </TouchableOpacity>
        )}
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
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Aucune ferme trouvée.</Text>
              {userRole !== 'EMPLOYE' && (
                <TouchableOpacity onPress={() => navigation.navigate('CreateFarm')}>
                  <Text style={styles.emptyLink}>Commencez par en créer une !</Text>
                </TouchableOpacity>
              )}
            </View>
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
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
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
