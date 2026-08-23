import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, Pressable, RefreshControl, Alert, ScrollView, Platform } from 'react-native';
import { Card } from '../components/Card';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

export const LotHistoryScreen = ({ route, navigation }: any) => {
  const { lotId, lotName } = route.params || {};
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const fetchHistory = async () => {
    if (!lotId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!refreshing) setLoading(true);
    try {
      const response = await repositoryProvider.api.get(`/activity-logs/?lot=${lotId}&period=${filterPeriod}`).catch(() => ({ data: [] }));
      const rawLogs = Array.isArray(response.data) ? response.data : (response.data?.results || []);
      // 🔧 Déduplication uniquement des doublons exacts (même id) pour conserver l'historique complet
      // des opérations (création, modification, annulation) sur une même entité.
      const seenLogs = new Map<number, any>();
      for (const log of rawLogs) {
        const existing = seenLogs.get(log.id);
        if (!existing) {
          seenLogs.set(log.id, log);
        } else if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
          // If the same log appears both locally and from the server, prefer the server copy.
          if (log.id > 0 && existing.id < 0) {
            seenLogs.set(log.id, log);
          }
        }
      }
      setLogs(Array.from(seenLogs.values()));
    } catch (error) {
      console.log('Erreur LotHistory:', error);
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // 🔧 Filtrage période côté client (fallback offline — le paramètre 'period'
    // ne peut pas être traduit en clause WHERE SQLite)
    if (filterPeriod && filterPeriod !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startDate = (() => {
        switch (filterPeriod) {
          case 'day': return todayStart;
          case 'week': return new Date(todayStart.getTime() - 7 * 86400000);
          case 'month': return new Date(todayStart.getTime() - 30 * 86400000);
          case 'year': return new Date(todayStart.getTime() - 365 * 86400000);
          default: return null;
        }
      })();
      if (startDate) {
        result = result.filter(log => {
          const logDate = new Date(log.date);
          return logDate >= startDate;
        });
      }
    }

    return result.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [logs, sortOrder, filterPeriod]);

  const getModuleLabel = (module: string, action?: string) => {
    // 🔧 Correction robuste : déduire le module de l'action si le module est incorrect
    let correctedModule = module;
    
    // Si le module est incorrect ou manquant, déduire-le de l'action
    if (action) {
      const actionLower = action.toLowerCase();
      if (actionLower.includes('production') || actionLower.includes('casiers') || actionLower.includes('collect')) {
        correctedModule = 'Production';
      } else if (actionLower.includes('vente') || actionLower.includes('sale') || actionLower.includes('client')) {
        correctedModule = 'Vente';
      } else if (actionLower.includes('aliment') || actionLower.includes('feed') || actionLower.includes('nutrition')) {
        correctedModule = 'Alimentation';
      } else if (actionLower.includes('santé') || actionLower.includes('health') || actionLower.includes('traitement') || actionLower.includes('vaccin')) {
        correctedModule = 'Santé';
      } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
        correctedModule = 'Mouvement';
      } else if (actionLower.includes('dépense') || actionLower.includes('expense') || actionLower.includes('finance')) {
        correctedModule = 'Finance';
      }
    }
    
    switch (correctedModule) {
      case 'Production': return t('actions.production');
      case 'Vente': return t('actions.sale');
      case 'Alimentation': return t('actions.nutrition') || 'Alimentation';
      case 'Santé': return t('actions.health') || 'Santé';
      case 'Mouvement': return t('actions.movement');
      case 'Finance': return t('actions.finance') || 'Finance';
      case 'Rappel': return t('actions.reminder');
      default: return correctedModule;
    }
  };

  const handleCancelAction = (item: any) => {
    console.log('[TEST SOLFERME] CANCEL HISTORY CLICK', item);

    const executeCancel = async () => {
      console.log('[TEST SOLFERME] CANCEL HISTORY CONFIRMED', item);
      try {
        let endpoint = '';
        const actionLower = item.action.toLowerCase();
        const relatedId = item.related_id || item.id;


        if (actionLower.includes('conversion')) {
          endpoint = `/egg-conversions/${relatedId}/`;
        } else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) {
          endpoint = `/sale-payments/${relatedId}/`;
        } else if (actionLower.includes('vente poules')) {
          endpoint = `/sales/${relatedId}/`;
        } else if (actionLower.includes('vente') || actionLower.includes('sale')) {
          endpoint = `/sales/${relatedId}/`;
        } else if (actionLower.includes('salaire')) {
          endpoint = `/payrolls/${relatedId}/`;
        } else if (actionLower.includes('prime')) {
          endpoint = `/bonuses/${relatedId}/`;
        } else if (actionLower.includes('dépense') || actionLower.includes('expense')) {
          endpoint = `/expenses/${relatedId}/`;
        } else if (actionLower.includes('production') || actionLower.includes('casiers')) {
          endpoint = `/productions/${relatedId}/`;
        } else if (actionLower.includes('achat aliment') || actionLower.includes('feed purchase')) {
          endpoint = `/feed-purchases/${relatedId}/`;
        } else if (actionLower.includes('préparation') || actionLower.includes('preparation')) {
          endpoint = `/feed-preparations/${relatedId}/`;
        } else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) {
          endpoint = `/feeds/${relatedId}/`;
        } else if (actionLower.includes('achat santé') || actionLower.includes('health purchase')) {
          endpoint = `/health-purchases/${relatedId}/`;
        } else if (actionLower.includes('santé') || actionLower.includes('health') || actionLower.includes('traitement') || actionLower.includes('soin')) {
          endpoint = `/health-records/${relatedId}/`;
        } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
          endpoint = `/movements/${relatedId}/`;
        } else if (actionLower.includes('rappel')) {
          endpoint = `/reminders/${relatedId}/`;
        }

        if (endpoint) {
          await repositoryProvider.api.delete(endpoint);
          
          import('../utils/dataEvents').then(({ emitDataChange }) => {
            emitDataChange({ tableName: 'lots' });
            emitDataChange({ tableName: 'productions' });
            emitDataChange({ tableName: 'sales' });
            emitDataChange({ tableName: 'feeds' });
            emitDataChange({ tableName: 'chicken_movements' });
            emitDataChange({ tableName: 'health_records' });
            emitDataChange({ tableName: 'expenses' });
            emitDataChange({ tableName: 'egg_conversions' });
            emitDataChange({ tableName: 'feed_purchases' });
            emitDataChange({ tableName: 'health_purchases' });
          });

          if (Platform.OS === 'web') {
            toast.success(t('common.success'), t('common.cancelSuccess'));
          } else {
            Alert.alert(t('common.success'), t('common.cancelSuccess'));
          }
          fetchHistory();
        }
      } catch (error: any) {
        const msg = getErrorMessage(error, "Erreur lors de l'annulation");
        if (Platform.OS === 'web') {
          toast.error(t('common.actionImpossible'), msg);
        } else {
          Alert.alert(t('common.actionImpossible'), msg);
        }
      }
    };

    // Sur web, utiliser window.confirm() pour confirmation
    if (Platform.OS === 'web') {
      console.log('[TEST SOLFERME] CANCEL HISTORY: web path - using window.confirm');
      if (window.confirm(t('finance.confirmCancelMsg'))) {
        executeCancel();
      }
      return;
    }

    // Sur native, utiliser Alert.alert pour confirmation
    Alert.alert(
      t('finance.confirmCancelTitle'),
      t('finance.confirmCancelMsg'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('finance.yesCancel'),
          style: 'destructive',
          onPress: executeCancel
        }
      ]
    );
  };

  const handleEditAction = async (item: any) => {
    try {
      setLoading(true);
      let endpoint = '';
      let screen = '';
      const actionLower = item.action.toLowerCase();
      const relatedId = item.related_id || item.id;

      if (actionLower.includes('conversion')) {
        endpoint = `/egg-conversions/${relatedId}/`;
        screen = 'ProductionConvert';
      } else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) {
        setLoading(false);
        const msg = "Pour modifier un paiement de vente, veuillez vous rendre sur la carte de la vente correspondante et gérer ses paiements.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('vente poules')) {
        endpoint = `/sales/${relatedId}/`;
        screen = 'ActionVentePoules';
      } else if (actionLower.includes('vente') || actionLower.includes('sale')) {
        endpoint = `/sales/${relatedId}/`;
        screen = 'ActionVente';
      } else if (actionLower.includes('salaire')) {
        setLoading(false);
        const msg = "La modification d'un salaire depuis l'historique sera bientôt disponible. Veuillez l'annuler et le recréer pour le moment.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('prime')) {
        setLoading(false);
        const msg = "Les primes ne peuvent pas être modifiées. Veuillez annuler la prime et en créer une nouvelle.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      } else if (actionLower.includes('dépense') || actionLower.includes('depense') || actionLower.includes('expense')) {
        endpoint = `/expenses/${relatedId}/`;
        screen = 'AddExpense';
      } else if (actionLower.includes('production') || actionLower.includes('casiers')) {
        endpoint = `/productions/${relatedId}/`;
        screen = 'ActionProduction';
      } else if (actionLower.includes('achat aliment') || actionLower.includes('feed purchase')) {
        endpoint = `/feed-purchases/${relatedId}/`;
        screen = 'Purchase';
      } else if (actionLower.includes('préparation') || actionLower.includes('preparation')) {
        endpoint = `/feed-preparations/${relatedId}/`;
        screen = 'ActionPreparation';
      } else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) {
        endpoint = `/feeds/${relatedId}/`;
        screen = 'ActionAlimentation';
      } else if (actionLower.includes('achat santé') || actionLower.includes('achat sante')) {
        endpoint = `/health-purchases/${relatedId}/`;
        screen = 'Purchase';
      } else if (actionLower.includes('santé') || actionLower.includes('sante') || actionLower.includes('traitement') || actionLower.includes('soin')) {
        endpoint = `/health-records/${relatedId}/`;
        screen = 'ActionSante';
      } else if (actionLower.includes('mouvement') || actionLower.includes('movement')) {
        endpoint = `/movements/${relatedId}/`;
        screen = 'ActionMouvement';
      } else if (actionLower.includes('rappel')) {
        endpoint = `/reminders/${relatedId}/`;
        screen = 'ActionReminder';
      }

      if (!endpoint || !screen) {
        setLoading(false);
        const msg = "La modification de ce type d'action n'est pas encore supportée.";
        if (Platform.OS === 'web') { toast.info(t('common.info'), msg); } else { Alert.alert(t('common.info'), msg); }
        return;
      }

      const response = await repositoryProvider.api.get(endpoint);
      const originalItem = response.data;
      
      // Ajustement dynamique de l'écran pour les ventes de poules
      let finalScreen = screen;
      if (originalItem.product_type === 'CHICKEN') {
        finalScreen = 'ActionVentePoules';
      }

      // 🔧 Paramètres de navigation en fonction de l'écran cible
      const navParams: any = {
        item: originalItem,
        lotId: lotId,
        lotName: lotName,
        farmId: item.farm || originalItem.farm,
      };

      if (screen === 'ActionReminder') {
        navParams.reminderId = relatedId;
      } else if (screen === 'Purchase') {
        navParams.type = actionLower.includes('santé') || actionLower.includes('sante') ? 'health' : 'feed';
      }

      navigation.navigate(finalScreen, navParams);
      
    } catch (error: any) {
      console.log('Erreur modification:', error);
      if (Platform.OS === 'web') { toast.error(t('common.error'), "Impossible de récupérer les détails de l'action (peut-être a-t-elle été supprimée ?)."); }
      else { Alert.alert(t('common.error'), "Impossible de récupérer les détails de l'action."); }
    } finally {
      setLoading(false);
    }
  };

  const handleActionPress = async (item: any) => {
    // 🔧 Vérifier si l'action est déjà annulée via plusieurs critères :
    // 1. L'action contient "annul", "suppression" (online) ou "annulation" (offline)
    const isCancelled =
      item.action.toLowerCase().includes('annul') ||
      item.action.toLowerCase().includes('suppression');

    if (isCancelled) {
      if (Platform.OS === 'web') { toast.info(t('common.info') || 'Info', "Cette action est déjà annulée."); }
      else { Alert.alert(t('common.info') || 'Info', "Cette action est déjà annulée."); }
      return;
    }

    // 🔧 Vérifier le statut réel de l'entité liée en utilisant la logique action-based
    try {
      const actionLower = item.action.toLowerCase();
      const relatedId = item.related_id || item.id;
      if (relatedId) {
        let entityEndpoint = '';
        if (actionLower.includes('conversion')) entityEndpoint = `/egg-conversions/${relatedId}/`;
        else if (actionLower.includes('paiement vente') || actionLower.includes('payment')) entityEndpoint = `/sale-payments/${relatedId}/`;
        else if (actionLower.includes('vente')) entityEndpoint = `/sales/${relatedId}/`;
        else if (actionLower.includes('salaire')) entityEndpoint = `/payrolls/${relatedId}/`;
        else if (actionLower.includes('prime')) entityEndpoint = `/bonuses/${relatedId}/`;
        else if (actionLower.includes('dépense') || actionLower.includes('depense') || actionLower.includes('expense')) entityEndpoint = `/expenses/${relatedId}/`;
        else if (actionLower.includes('production') || actionLower.includes('casiers')) entityEndpoint = `/productions/${relatedId}/`;
        else if (actionLower.includes('achat aliment')) entityEndpoint = `/feed-purchases/${relatedId}/`;
        else if (actionLower.includes('préparation') || actionLower.includes('preparation')) entityEndpoint = `/feed-preparations/${relatedId}/`;
        else if (actionLower.includes('aliment') || actionLower.includes('nutrition')) entityEndpoint = `/feeds/${relatedId}/`;
        else if (actionLower.includes('achat santé') || actionLower.includes('achat sante')) entityEndpoint = `/health-purchases/${relatedId}/`;
        else if (actionLower.includes('santé') || actionLower.includes('sante') || actionLower.includes('traitement') || actionLower.includes('soin')) entityEndpoint = `/health-records/${relatedId}/`;
        else if (actionLower.includes('mouvement') || actionLower.includes('movement')) entityEndpoint = `/movements/${relatedId}/`;

        if (entityEndpoint) {
          const res = await repositoryProvider.api.get(entityEndpoint).catch(() => null);
          const entity = res?.data;
          if (entity && (entity.status === 'ANNULEE' || entity.status === 'ANNULÉ' || entity.status === 'ANNULE')) {
            if (Platform.OS === 'web') {
              toast.error(t('common.info') || 'Info', 'Cette action a déjà été annulée.');
            } else {
              Alert.alert(t('common.info') || 'Info', 'Cette action a déjà été annulée. Impossible de modifier ou annuler à nouveau.');
            }
            return;
          }
        }
      }
    } catch { /* best-effort */ }


    Alert.alert(
      "Options de l'action",
      "Que souhaitez-vous faire ?",
      [
        { text: "Fermer", style: "cancel" },
        {
          text: "Modifier",
          onPress: () => handleEditAction(item)
        },
        {
          text: "Annuler l'opération",
          style: 'destructive',
          onPress: () => handleCancelAction(item)
        }
      ]
    );
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  useEffect(() => {
    fetchHistory();
  }, [lotId, filterPeriod]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchHistory();
    });
    return unsubscribe;
  }, [navigation]);

  const getIcon = (item: any) => {
    const action = item.action;
    const module = item.module;
    if (action.includes('PREPARATION')) return 'blender';
    if (action.includes('PURCHASE') || action.includes('Achat')) return 'shopping-basket';
    switch (module) {
      case 'Production': return 'egg';
      case 'Vente': return 'shopping-cart';
      case 'Alimentation': return 'restaurant';
      case 'Santé': return 'medication';
      case 'Mouvement': return 'sync-alt';
      case 'Finance': return 'payments';
      case 'Rappel': return 'notifications';
      default: return 'history';
    }
  };

  const getIconColor = (item: any) => {
    const module = item.module;
    const action = item.action;
    if (action.includes('PURCHASE') || action.includes('Achat')) return theme.colors.success;
    if (action.includes('PREPARATION')) return '#9C27B0';
    switch (module) {
      case 'Production': return '#FBC02D';
      case 'Vente': return '#4CAF50';
      case 'Alimentation': return '#03A9F4';
      case 'Santé': return '#E91E63';
      case 'Mouvement': return '#FF5722';
      case 'Finance': return '#607D8B';
      default: return theme.colors.primary;
    }
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique - {lotName}</Text>
        <TouchableOpacity onPress={toggleSortOrder} style={styles.sortButton}>
          <MaterialIcons
            name={sortOrder === 'desc' ? "arrow-downward" : "arrow-upward"}
            size={22}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { label: t('common.all'), value: 'all' },
            { label: t('common.day'), value: 'day' },
            { label: t('common.week'), value: 'week' },
            { label: t('common.month'), value: 'month' },
            { label: t('common.year'), value: 'year' },
          ].map((period) => (
            <TouchableOpacity
              key={period.value}
              style={[
                styles.filterChip,
                filterPeriod === period.value && { backgroundColor: theme.colors.primary }
              ]}
              onPress={() => setFilterPeriod(period.value as any)}
            >
              <Text style={[
                styles.filterChipText,
                filterPeriod === period.value && { color: '#fff', fontWeight: 'bold' }
              ]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={64} color={theme.colors.border} />
              <Text style={styles.emptyText}>{t('common.noData')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCancelled =
              item.action.toLowerCase().includes('annul') ||
              item.action.toLowerCase().includes('suppression');
            const isDesktop = Platform.OS === 'web';

            const CardWrapper = isDesktop ? View : TouchableOpacity;
            return (
              <CardWrapper
                {...(!isDesktop ? {
                  onPress: () => {
                    if (userRole === 'PROPRIETAIRE') {
                      handleActionPress(item);
                    }
                  },
                  activeOpacity: 0.7
                } : {})}
              >
                <View style={{ opacity: isCancelled ? 0.6 : 1 }}>
                  <Card style={[styles.historyCard, isCancelled && styles.cancelledCard]}>
                    <View style={[styles.iconContainer, { backgroundColor: getIconColor(item) + '15' }]}>
                       <MaterialIcons name={getIcon(item) as any} size={22} color={getIconColor(item)} />
                    </View>
                    <View style={styles.logContent}>
                      <View style={styles.historyHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Text style={[styles.historyType, isCancelled && styles.strike]}>
                            {getModuleLabel(item.module, item.action)} • {item.action}
                          </Text>
                          {isCancelled && (
                            <View style={styles.cancelledBadge}>
                              <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.historyDate}>{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>

                      <View style={styles.historyBody}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyDescMain, isCancelled && styles.strike]}>{item.description}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginLeft: 8, flexDirection: 'row' }}>
                           <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                             <MaterialIcons name="person" size={12} color={theme.colors.primary} style={{ marginRight: 2 }} />
                             <Text style={styles.historyUser}>{item.user_name}</Text>
                           </View>
                        </View>
                      </View>
                    </View>

                    {userRole === 'PROPRIETAIRE' && (
                      <View style={styles.desktopActions}>
                        {!isCancelled && (
                          <>
                            <Pressable
                              onPress={() => handleEditAction(item)}
                              style={({ pressed }) => [styles.actionIconButton, { opacity: pressed ? 0.6 : 1, cursor: 'pointer' } as any]}
                            >
                              <MaterialIcons name="edit" size={20} color={theme.colors.primary} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleCancelAction(item)}
                              style={({ pressed }) => [styles.actionIconButton, { opacity: pressed ? 0.6 : 1, cursor: 'pointer' } as any]}
                            >
                              <MaterialIcons name="undo" size={20} color={theme.colors.warning} />
                            </Pressable>
                          </>
                        )}
                      </View>
                    )}
                  </Card>
                </View>
              </CardWrapper>
            );
          }}
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
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  sortButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  filterContainer: { paddingVertical: 8, backgroundColor: theme.colors.background },
  filterScroll: { paddingHorizontal: theme.spacing.m },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: theme.colors.surface, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border,
  },
  filterChipText: { fontSize: 13, color: theme.colors.textSecondary },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  historyCard: {
    flexDirection: 'row', padding: theme.spacing.s, marginBottom: theme.spacing.s,
    borderRadius: theme.borderRadius.l, borderWidth: 0.5, borderColor: theme.colors.border,
  },
  cancelledCard: { borderColor: theme.colors.textSecondary + '40' },
  iconContainer: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.s,
  },
  logContent: { flex: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyType: { fontSize: 12, fontWeight: 'bold', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  historyDate: { fontSize: 10, color: theme.colors.textSecondary },
  historyDescMain: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text },
  historyUser: { fontSize: 10, color: theme.colors.primary, fontWeight: '600' },
  strike: { textDecorationLine: 'line-through' },
  cancelledBadge: {
    marginLeft: 8, backgroundColor: theme.colors.danger + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  cancelledText: { fontSize: 9, color: theme.colors.danger, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, opacity: 0.5 },
  emptyText: { marginTop: 10, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  deleteIconButton: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  desktopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border + '40',
    marginLeft: 8,
    paddingLeft: 4,
  },
  actionIconButton: {
    padding: 8,
    marginHorizontal: 2,
  }
});