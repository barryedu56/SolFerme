import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Pressable, Alert, Platform } from 'react-native';
import { toast } from '../utils/toast';
import { Card } from '../components/Card';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { exportProductionData } from '../utils/reportGenerator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatNumber, formatCurrency } from '../utils/formatters';
import { isNormalEgg, isBrokenEgg } from '../utils/inventory';
import { calculatePerformance, getPerformanceLabel } from '../utils/performance';
import { getErrorMessage } from '../utils/errors';
import { useAutoRefreshData } from '../hooks/useDataChange';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { space, radius, shadow } from '../components/ui/tokens';

export const LotDetailScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { lotName, lotId, farmId, farmName } = route.params || {};
  const { isDesktop, isTablet } = useBreakpoint();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lotData, setLotData] = useState<any>(null);
  const [performance, setPerformance] = useState(0);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [allProductions, setAllProductions] = useState<any[]>([]);
  const [conversions, setConversions] = useState<any[]>([]);

  const fetchLotData = async () => {
    if (!lotId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const emptyStats = {
        info: { id: lotId, farm_id: farmId, farm: farmId, name: lotName, animal_type: 'Pondeuses', status: 'ACTIF', breed: '', purchase_date: new Date().toISOString(), current_quantity: 0, initial_quantity: 0, supplier: '' },
        total_casiers: 0, total_oeufs: 0, total_oeufs_casses: 0, total_casiers_vendables: 0,
        available_stock: 0, available_casses: 0, revenues: 0, expenses: 0, profit: 0,
        dead_count: 0, current_sick: 0, recovered_count: 0, total_sick: 0,
        total_feed_consumed: 0, last_feed_date: null, last_preparation_date: null,
        raw_materials_detail: [], prepared_feeds_detail: [],
        health_stock: 0, health_detail: [], total_treatments: 0, last_health_record: null,
        performance: 0, prod_today: 0, prod_week: 0, feed_stock: 0, raw_material_stock: 0,
        production_by_period: [], sales_by_period: [],
      };

      const [statsRes, logsRes, remindersRes, productionsRes, conversionsRes] = await Promise.all([
        repositoryProvider.api.get(`/lots/${lotId}/statistics/`).catch(() => ({ data: emptyStats })),
        repositoryProvider.api.get(`/activity-logs/?lot=${lotId}&limit=20`).catch(() => ({ data: { results: [] } })),
        repositoryProvider.api.get(`/reminders/?lot=${lotId}`).catch(() => ({ data: { results: [] } })),
        repositoryProvider.api.get(`/productions/?lot=${lotId}&limit=1000`).catch(() => ({ data: { results: [] } })),
        repositoryProvider.api.get(`/egg-conversions/?lot=${lotId}`).catch(() => ({ data: { results: [] } })),
      ]);

      const stats = statsRes.data;
      const lotInfo = stats.info;
      const logs = Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data?.results || []);
      const productions = Array.isArray(productionsRes.data) ? productionsRes.data : (productionsRes.data?.results || []);
      const reminders = Array.isArray(remindersRes.data) ? remindersRes.data : (remindersRes.data?.results || []);
      const conversions = Array.isArray(conversionsRes.data) ? conversionsRes.data : (conversionsRes.data?.results || []);
      const lotReminders = reminders
        .filter((r: any) => r.lot === lotId && r.status === 'PENDING')
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const isEmployee = userRole === 'EMPLOYE';

      const mappedLogs = logs.map((log: any) => {
        let description = log.description;
        if (isEmployee && (log.module === 'Vente' || log.module === 'Finance' || log.action.includes('Achat'))) {
          description = description.replace(/(\d[\d\s]*\s*GNF|\d[\d\s]*\s*FG)/gi, '*** GNF');
        }

        return {
          ...log,
          description,
          // Pour LotDetailScreen, on mappe module sur type si besoin par le composant
          type: log.module === 'Production' ? t('actions.production') :
                log.module === 'Vente' ? t('actions.sale') :
                log.module === 'Alimentation' ? t('actions.nutrition') :
                log.module === 'Santé' ? t('actions.health') :
                log.module === 'Mouvement' ? t('actions.movement') : log.module
        };
      });

      // 🔧 Ne dédupliquer que les doublons exacts (même id), pas toutes les actions liées au même entity/related_id.
      // Cela permet de conserver l'historique complet des opérations sur un même lot.
      const seenLogs = new Map<number, any>();
      for (const log of mappedLogs) {
        const existing = seenLogs.get(log.id);
        if (!existing) {
          seenLogs.set(log.id, log);
        } else if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
          if (log.id > 0 && existing.id < 0) {
            seenLogs.set(log.id, log);
          }
        }
      }
      const dedupLogs = Array.from(seenLogs.values()).slice(0, 5);

      setPerformance(stats.performance);
      setAllProductions(productions);
      setConversions(conversions);
      setRecentLogs(dedupLogs);

      setLotData({
        info: lotInfo,
        totalCasiers: stats.total_casiers,
        totalOeufs: stats.total_oeufs,
        totalOeufsCasses: stats.total_oeufs_casses,
        totalCasiersVendables: stats.total_casiers_vendables,
        revenues: isEmployee ? 0 : stats.revenues,
        expenses: isEmployee ? 0 : stats.expenses,
        profit: isEmployee ? 0 : stats.profit,
        deadCount: stats.dead_count,
        currentSick: stats.current_sick,
        recoveredCount: stats.recovered_count,
        totalSick: stats.total_sick,
        availableStock: stats.available_stock,
        availableCasses: stats.available_casses,
        prodToday: stats.prod_today,
        prodWeek: stats.prod_week,
        feedStock: stats.feed_stock,
        rawMaterialStock: stats.raw_material_stock,
        rawMaterialsDetail: stats.raw_materials_detail || [],
        preparedFeedsDetail: stats.prepared_feeds_detail || [],
        lastPreparationDate: stats.last_preparation_date,
        totalFeedConsumed: stats.total_feed_consumed,
        lastFeedDate: stats.last_feed_date,
        healthStock: stats.health_stock,
        health_detail: stats.health_detail || [],
        totalTreatments: stats.total_treatments,
        lastHealthRecord: stats.last_health_record,
        reminders: lotReminders,
        recentActions: mappedLogs
      });

    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStockStatus = (quantity: number, type: 'raw' | 'prep' | 'health') => {
    let lowThreshold = 50; // default for kg
    if (type === 'health') {
        lowThreshold = 5;
    }

    if (quantity <= 0) return { label: 'Rupture', color: theme.colors.danger };
    if (quantity < lowThreshold) return { label: 'Stock faible', color: theme.colors.warning };
    return { label: 'Stock normal', color: theme.colors.success };
  };

  useAutoRefreshData(
    ['lots', 'activity_logs', 'reminders', 'productions', 'egg_conversions'],
    fetchLotData,
    200
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchLotData();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLotData();
  };

  const handleDeleteLot = () => {
    Alert.alert(
      t('common.delete') || 'Supprimer',
      t('lots.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await repositoryProvider.api.delete(`/lots/${lotId}/`);
              toast.success(t('common.success'), t('lots.deleteSuccess'));
              navigation.goBack();
            } catch (error: any) {
              toast.error(t('common.error'), getErrorMessage(error, t('lots.deleteError')));
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleArchiveLot = () => {
    console.log('[TEST SOLFERME] ARCHIVE LOT CLICK');

    const executeArchive = async () => {
      console.log('[TEST SOLFERME] ARCHIVE LOT CONFIRMED');
      try {
        setLoading(true);
        await repositoryProvider.api.post(`/lots/${lotId}/archive/`);
        toast.success(t('common.success') || 'Succès', t('lots.archiveSuccess') || 'Le lot a été archivé avec succès.');
        fetchLotData();
      } catch (error: any) {
        console.error('[TEST SOLFERME] ARCHIVE LOT ERROR:', error);
        toast.error(t('common.error'), getErrorMessage(error, 'Erreur lors de l\'archivage du lot.'));
        setLoading(false);
      }
    };

    // Sur web, exécuter directement sans Alert.alert
    if (Platform.OS === 'web') {
      console.log('[TEST SOLFERME] ARCHIVE LOT: web path - executing directly');
      executeArchive();
      return;
    }

    // Sur native, utiliser Alert.alert pour confirmation
    Alert.alert(
      'Archiver le lot',
      'Voulez-vous vraiment archiver ce lot ? Les données seront conservées mais le lot ne sera plus actif.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Archiver',
          style: 'default',
          onPress: executeArchive
        }
      ]
    );
  };

  const handleReactivateLot = () => {
    const executeReactivate = async () => {
      try {
        console.log('[TEST SOLFERME] REACTIVATE LOT: calling API', { lotId, lotStatus: lotData?.status });
        setLoading(true);
        const response = await repositoryProvider.api.post(`/lots/${lotId}/reactivate/`);
        console.log('[TEST SOLFERME] REACTIVATE LOT: API response', response);
        toast.success(t('common.success') || 'Succès', t('lots.reactivateSuccess') || 'Le lot a été réactivé avec succès.');
        fetchLotData();
      } catch (error: any) {
        console.error('[TEST SOLFERME] REACTIVATE LOT ERROR:', error);
        console.error('[TEST SOLFERME] REACTIVATE LOT ERROR RESPONSE:', error.response?.data);
        toast.error(t('common.error'), getErrorMessage(error, 'Erreur lors de la réactivation du lot.'));
        setLoading(false);
      }
    };

    // Sur web, exécuter directement sans Alert.alert
    if (Platform.OS === 'web') {
      console.log('[TEST SOLFERME] REACTIVATE LOT: web path - executing directly');
      executeReactivate();
      return;
    }

    // Sur native, utiliser Alert.alert pour confirmation
    Alert.alert(
      'Réactiver le lot',
      'Voulez-vous vraiment réactiver ce lot ? Les actions métier redeviendront disponibles.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Réactiver',
          style: 'default',
          onPress: executeReactivate
        }
      ]
    );
  };

  const handleExportProduction = async () => {
    console.log('[TEST SOLFERME] EXPORT LOT PRODUCTION CLICK');
    if (allProductions.length === 0) {
      toast.info(t('common.info') || 'Info', t('lots.exportNoData'));
      return;
    }
    try {
      await exportProductionData(allProductions, lotName, t);
    } catch (error) {
      console.error('[TEST SOLFERME] EXPORT LOT PRODUCTION ERROR:', error);
      toast.error(t('common.error'), t('lots.exportError'));
    }
  };

  const handleCancelAction = (item: any) => {
    console.log('[TEST SOLFERME] CANCEL HISTORY CLICK (LotDetail)', item);

    const executeCancel = async () => {
      console.log('[TEST SOLFERME] CANCEL HISTORY CONFIRMED (LotDetail)', item);
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

          toast.success(t('common.success'), t('common.cancelSuccess'));
          fetchLotData();
        } else {
          toast.error(t('common.error'), t('common.actionImpossible'));
        }
      } catch (error: any) {
        toast.error(t('common.actionImpossible'), getErrorMessage(error, t('common.cancelError')));
      }
    };

    // Sur web, utiliser window.confirm() — Alert.alert avec boutons est ignoré par le navigateur
    if (Platform.OS === 'web') {
      if (window.confirm(t('finance.confirmCancelMsg'))) {
        executeCancel();
      }
      return;
    }

    // Sur native (Android/iOS), utiliser Alert.alert
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
        farmId: item.farm || originalItem.farm || farmId,
      };

      if (screen === 'ActionReminder') {
        navParams.reminderId = relatedId;
      } else if (screen === 'Purchase') {
        navParams.type = actionLower.includes('santé') || actionLower.includes('sante') ? 'health' : 'feed';
      }

      navigation.navigate(finalScreen, navParams);
      
    } catch (error: any) {
      console.log('Erreur modification:', error);
      if (Platform.OS === 'web') { toast.error(t('common.error'), "Impossible de récupérer les détails de l'action."); }
      else { Alert.alert(t('common.error'), "Impossible de récupérer les détails de l'action."); }
    } finally {
      setLoading(false);
    }
  };

  const handleActionPress = async (item: any) => {
    if (item.action.toLowerCase().includes('annul') || item.action.toLowerCase().includes('suppression')) {
      if (Platform.OS === 'web') { toast.info(t('common.info'), 'Cette action est déjà annulée.'); }
      else { Alert.alert(t('common.info') || 'Info', 'Cette action est déjà annulée.'); }
      return;
    }

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
            if (Platform.OS === 'web') { toast.info(t('common.info') || 'Info', 'Cette action a déjà été annulée.'); }
            else { Alert.alert(t('common.info') || 'Info', 'Cette action a déjà été annulée. Impossible de modifier ou annuler à nouveau.'); }
            return;
          }
        }
      }
    } catch { /* best-effort */ }

    Alert.alert(
      t('common.info'),
      t('common.chooseAction') || "Options",
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.edit'),
          onPress: () => handleEditAction(item)
        },
        {
          text: t('common.cancel') || 'Annuler l\'opération',
          style: 'destructive',
          onPress: () => handleCancelAction(item)
        }
      ]
    );
  };

  const allActions = [
    { title: t('actions.sale'), screen: 'ActionVente', icon: 'add-shopping-cart', iconType: 'MaterialIcons', ownerOnly: true },
    { title: "Vente Poules", screen: 'ActionVentePoules', icon: 'shopping-basket', iconType: 'MaterialIcons', ownerOnly: true },
    { title: t('actions.production'), screen: 'ActionProduction', icon: 'egg', iconType: 'MaterialCommunityIcons', ownerOnly: false },
    { title: t('actions.feed'), screen: 'ActionAlimentation', icon: 'restaurant', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.health'), screen: 'ActionSante', icon: 'medication', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.movement'), screen: 'ActionMouvement', icon: 'outbound', iconType: 'MaterialIcons', ownerOnly: false },
    { title: t('actions.reminder'), screen: 'ActionReminder', icon: 'notifications-active', iconType: 'MaterialIcons', ownerOnly: true },
  ];

  const actions = allActions.filter(a => !a.ownerOnly || userRole !== 'EMPLOYE');

  const isArchived = lotData?.info?.status === 'ARCHIVE';

  // ─── Conversions d'œufs : agrégats par production (EN_ATTENTE → VENDABLE) ───
  // Les valeurs sont TOUJOURS calculées (jamais stockées) :
  //   En attente actuel  = max(0, produits − vendables initiaux − ∑conversions EN_ATTENTE→…)
  //   Vendables actuels  = vendables initiaux + ∑conversions → VENDABLE
  const productionsWithConv = useMemo(() => {
    return allProductions
      .filter((p: any) => String(p.status || 'ACTIF').toUpperCase() !== 'ANNULEE')
      .map((p: any) => {
        const pId = Number(p.id);
        const prodConvs = conversions.filter((c: any) =>
          Number(c.production || c.production_id) === pId && String(c.status || 'ACTIF').toUpperCase() !== 'ANNULEE'
        );
        const fromPending = prodConvs
          .filter((c: any) => (c.from_state || '').toUpperCase() === 'EN_ATTENTE')
          .reduce((s: number, c: any) => s + (Number(c.quantity) || 0), 0);
        const converted = prodConvs
          .filter((c: any) => (c.to_state || '').toUpperCase() === 'VENDABLE')
          .reduce((s: number, c: any) => s + (Number(c.quantity) || 0), 0);
        const casiersProduits = Number(p.casiers_produits) || 0;
        const casiersVendables = Number(p.casiers_vendables) || 0;
        const enAttenteInitial = Math.max(0, casiersProduits - casiersVendables);
        const enAttenteActuel = Math.max(0, enAttenteInitial - fromPending);
        const vendablesActuels = casiersVendables + converted;
        return {
          production: p,
          casiersProduits,
          casiersVendables,
          enAttenteInitial,
          enAttenteActuel,
          vendablesActuels,
          history: [...prodConvs].sort(
            (a: any, b: any) =>
              new Date(b.conversion_date || b.date || 0).getTime() -
              new Date(a.conversion_date || a.date || 0).getTime()
          ),
        };
      })
      .filter((item: any) => item.casiersProduits > 0 || item.history.length > 0);
  }, [allProductions, conversions]);

  const goToConvert = (item: any) => {
    navigation.navigate('ProductionConvert', {
      lotId,
      lotName,
      production: item.production,
      // en-attente ACTUEL (déduit des conversions déjà effectuées) pour piloter la limite UI
      pendingActual: item.enAttenteActuel,
    });
  };

  // ─── Vue agrégée : UNE seule carte pour toutes les productions du lot ───
  // La section n'apparaît QUE s'il reste des casiers "En attente" à convertir.
  const convertibleProductions = productionsWithConv.filter((it: any) => it.enAttenteActuel > 0);
  const hasPending = convertibleProductions.length > 0;

  const totals = productionsWithConv.reduce(
    (acc: any, it: any) => {
      acc.produits += it.casiersProduits;
      acc.vendablesInit += it.casiersVendables;
      acc.enAttente += it.enAttenteActuel;
      acc.vendablesActuels += it.vendablesActuels;
      return acc;
    },
    { produits: 0, vendablesInit: 0, enAttente: 0, vendablesActuels: 0 }
  );

  const allConversionHistory = productionsWithConv
    .flatMap((it: any) => it.history)
    .sort(
      (a: any, b: any) =>
        new Date(b.conversion_date || b.date || 0).getTime() -
        new Date(a.conversion_date || a.date || 0).getTime()
    );

  const isConvertibleUser = !isArchived && userRole !== 'EMPLOYE';

  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet), [theme, isDesktop, isTablet]);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

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

  const calculateAge = (purchaseDate: string) => {
    const diffTime = Math.abs(new Date().getTime() - new Date(purchaseDate).getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return { value: diffDays, unit: 'days' };
    } else {
      const diffWeeks = Math.floor(diffDays / 7);
      return { value: diffWeeks, unit: 'weeks' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIF': return t('lots.status.active') || 'Actif';
      case 'TERMINE': return t('lots.status.finished') || 'Terminé';
      case 'ARCHIVE': return t('lots.status.archived') || 'Archivé';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIF': return theme.colors.success;
      case 'TERMINE': return theme.colors.warning;
      case 'ARCHIVE': return theme.colors.danger;
      default: return theme.colors.primary;
    }
  };

  const lotHasData = (data: any) => {
    // Check if lot has any business data (productions, sales, feeds, health records, movements, etc.)
    return (
      data.totalCasiers > 0 ||
      data.totalOeufs > 0 ||
      data.deadCount > 0 ||
      data.totalSick > 0 ||
      data.revenues > 0 ||
      data.expenses > 0 ||
      data.reminders?.length > 0 ||
      data.recentActions?.length > 0 ||
      data.totalFeedConsumed > 0 ||
      data.totalTreatments > 0
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>{lotName}</Text>
          <View style={styles.badgeContainer}>
             <View style={[styles.statusDot, { backgroundColor: lotData?.info ? getStatusColor(lotData.info.status) : theme.colors.border }]} />
             <Text style={styles.subtitle}>
               {lotData?.info ? getStatusLabel(lotData.info.status) : '...'}
               {lotData?.info && ` • ${t(calculateAge(lotData.info.purchase_date).unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: calculateAge(lotData.info.purchase_date).value })}`}
             </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {userRole !== 'EMPLOYE' && lotData && (
            <>
              {!isArchived && (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { marginRight: 10 }]}
                  onPress={() => navigation.navigate('CreateLot', { farmId, farmName, lot: lotData.info, lotId })}
                >
                  <MaterialIcons name="edit" size={22} color={theme.colors.text} />
                </TouchableOpacity>
              )}
              {isArchived ? (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { marginRight: 10 }]}
                  onPress={handleReactivateLot}
                >
                  <MaterialIcons name="restore" size={22} color={theme.colors.success} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { marginRight: 10 }]}
                  onPress={handleArchiveLot}
                >
                  <MaterialIcons name="archive" size={22} color={theme.colors.warning} />
                </TouchableOpacity>
              )}
              {lotData && !lotHasData(lotData) && (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { marginRight: 10 }]}
                  onPress={handleDeleteLot}
                >
                  <MaterialIcons name="delete" size={22} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </>
          )}
          {userRole === 'PROPRIETAIRE' && (
            <TouchableOpacity style={styles.headerActionBtn} onPress={handleExportProduction}>
               <MaterialIcons name="file-download" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <ScrollView 
        contentContainerStyle={[styles.scroll, (isDesktop || isTablet) && styles.scrollDesktop]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {lotData && (
          <>
          {userRole === 'EMPLOYE' ? (
            <>
            <Card style={styles.infoDetailsCard}>
              <View style={styles.infoRow}>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.breed')}</Text>
                    <Text style={styles.infoValue}>{lotData.info.breed}</Text>
                 </View>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.statusLabel')}</Text>
                    <Text style={[styles.infoValue, { color: getStatusColor(lotData.info.status) }]}>
                      {getStatusLabel(lotData.info.status)}
                      {lotData.info.status === 'TERMINE' && lotData.info.motif_fin && ` (${lotData.info.motif_fin})`}
                    </Text>
                 </View>
              </View>
              <View style={styles.infoRow}>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.age')}</Text>
                    <Text style={styles.infoValue}>{t(calculateAge(lotData.info.purchase_date).unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: calculateAge(lotData.info.purchase_date).value })}</Text>
                 </View>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.alive')}</Text>
                    <Text style={[styles.infoValue, { color: theme.colors.primary, fontWeight: 'bold' }]}>{formatNumber(lotData.info.current_quantity)} {t('lots.heads')}</Text>
                 </View>
              </View>
            </Card>

            <View style={styles.statsContainer}>
              {/* Bloc Production */}
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialCommunityIcons name="egg-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.statsTitle}>{t('lots.statsProduction')}</Text>
                </View>
                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.eggsProduced')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalOeufs)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersProduced')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalCasiers)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersVendables')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.success }]}>{formatNumber(lotData.availableStock)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersCasses')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.warning }]}>{formatNumber(lotData.availableCasses)}</Text>
                  </View>
                </View>
              </Card>

            {/* ALIMENTATION */}
            <View style={styles.section}>
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialCommunityIcons name="food-apple" size={20} color={theme.colors.primary} />
                  <Text style={styles.statsTitle}>Alimentation</Text>
                </View>
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Matières premières</Text>
                  {lotData.rawMaterialsDetail.length > 0 && (
                    <View style={[styles.totalBadge, { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: theme.colors.primary + '20' }]}>
                      <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold' }}>
                        {formatNumber(lotData.rawMaterialsDetail.reduce((s: number, i: any) => s + (i.total || 0), 0))} kg
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.rawMaterialsDetail.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.rawMaterialsDetail.map((item: any, idx: number) => (
                      <View key={`raw-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.feed_type}: <Text style={styles.ingredientQty}>{formatNumber(item.total)}kg</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucune matière première enregistrée</Text>
                )}

                <View style={{ height: 12 }} />

                {/* Aliment préparé */}
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Aliment préparé</Text>
                  {lotData.preparedFeedsDetail?.length > 0 && (
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: theme.colors.warning + '30' }]}>
                      <Text style={{ color: theme.colors.warning, fontSize: 12, fontWeight: 'bold' }}>
                        {formatNumber(lotData.preparedFeedsDetail.reduce((s: number, i: any) => s + (i.total || 0), 0))} kg
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.preparedFeedsDetail?.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.preparedFeedsDetail.map((item: any, idx: number) => (
                      <View key={`prep-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.feed_name}: <Text style={styles.ingredientQty}>{formatNumber(item.total)}kg</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucun aliment préparé enregistré</Text>
                )}

                <View style={{ height: 12, borderTopWidth: 0.8, borderTopColor: '#00000010', marginTop: 8 }} />

                {/* Stats consommation */}
                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.consommationAliment')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalFeedConsumed)} kg</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.derniereDistribution')}</Text>
                    <Text style={styles.statsValue}>
                      {lotData.lastFeedDate ? new Date(lotData.lastFeedDate).toLocaleDateString(t('common.dateLocale')) : '-'}
                    </Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.dernierePreparation')}</Text>
                    <Text style={styles.statsValue}>
                      {lotData.lastPreparationDate ? new Date(lotData.lastPreparationDate).toLocaleDateString(t('common.dateLocale')) : '-'}
                    </Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* SANTÉ */}
            <View style={styles.section}>
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialIcons name="medical-services" size={20} color="#E91E63" />
                  <Text style={[styles.statsTitle, { color: '#E91E63' }]}>Santé</Text>
                </View>
                {/* Stock médicaments */}
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Stock médicaments</Text>
                  {lotData.health_detail?.length > 0 && (
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: '#E91E6320' }]}>
                      <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: 'bold' }}>
                        {lotData.health_detail.reduce((s: number, i: any) => s + (i.quantity || 0), 0)}
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.health_detail?.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.health_detail.map((item: any, idx: number) => (
                      <View key={`health-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.product_name}
                        </Text>
                        <Text style={[styles.ingredientQty, { color: theme.colors.primary }]}>
                          {formatNumber(item.quantity)} {item.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucun médicament enregistré</Text>
                )}

                <View style={{ height: 12, borderTopWidth: 0.8, borderTopColor: '#00000010', marginTop: 8 }} />

                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesMalades')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.warning }]}>{formatNumber(lotData.currentSick)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesGueries')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.success }]}>{formatNumber(lotData.recoveredCount)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesMortes')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.danger }]}>{formatNumber(lotData.deadCount)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.traitementsEffectues')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalTreatments)}</Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* COÛT D'ACQUISITION (Ne pas afficher pour les employés) */}
            {userRole !== 'EMPLOYE' && (
              <View style={styles.section}>
                <Card style={styles.statsCard}>
                  <View style={styles.statsHeader}>
                    <MaterialIcons name="account-balance-wallet" size={20} color={theme.colors.primary} />
                    <Text style={[styles.statsTitle, { color: theme.colors.primary }]}>Coût d'acquisition</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={styles.statsItem}>
                      <Text style={styles.statsLabel}>Prix unitaire</Text>
                      <Text style={styles.statsValue}>{formatNumber(lotData.info?.unit_price || 0)} GNF</Text>
                    </View>
                    <View style={styles.statsItem}>
                      <Text style={styles.statsLabel}>Frais supp.</Text>
                      <Text style={styles.statsValue}>{formatNumber(lotData.info?.extra_expenses || 0)} GNF</Text>
                    </View>
                    <View style={styles.statsItem}>
                      <Text style={styles.statsLabel}>Coût Total</Text>
                      <Text style={[styles.statsValue, { color: theme.colors.primary }]}>{formatNumber(lotData.info?.purchase_price || 0)} GNF</Text>
                    </View>
                    <View style={styles.statsItem}>
                      <Text style={styles.statsLabel}>Coût / Sujet</Text>
                      <Text style={[styles.statsValue, { color: theme.colors.primary }]}>{formatNumber(lotData.info?.real_cost_per_subject || 0)} GNF</Text>
                    </View>
                  </View>
                </Card>
              </View>
            )}

              {/* Performance */}
              <Card style={styles.perfCardCompact}>
                <View style={styles.perfHeader}>
                   <MaterialIcons name={performance >= 90 ? "trending-up" : performance >= 70 ? "trending-flat" : "trending-down"} size={24} color={getPerformanceLabel(performance, t).color} />
                   <View style={{ marginLeft: 12, flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.perfLabel}>{t('lots.lotPerformance')}</Text>
                      <Text style={[styles.perfValueCompact, {color: getPerformanceLabel(performance, t).color}]}>{performance}%</Text>
                   </View>
                </View>
              </Card>
            </View>

            {lotData.reminders.length > 0 && (
              <>
              <Text style={styles.sectionTitle}>{t('lots.lotReminders')}</Text>
              {lotData.reminders.slice(0, 3).map((reminder: any, index: number) => (
                <Card key={index} style={styles.reminderCard}>
                  <MaterialIcons name="notifications-active" size={20} color={theme.colors.warning} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.reminderText}>{reminder.title}</Text>
                    <Text style={styles.reminderDate}>
                      {new Date(reminder.date).toLocaleDateString(t('common.dateLocale'))} {reminder.time || ''}
                    </Text>
                  </View>
                </Card>
              ))}
              </>
            )}
            </>
          ) : (
            <>
            <Card style={styles.infoDetailsCard}>
              <View style={styles.infoRow}>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.strain')}</Text>
                    <Text style={styles.infoValue}>{lotData.info.breed}</Text>
                 </View>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.supplier')}</Text>
                    <Text style={styles.infoValue}>{lotData.info.supplier || '-'}</Text>
                 </View>
              </View>
              <View style={styles.infoRow}>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.creationDate')}</Text>
                    <Text style={styles.infoValue}>{new Date(lotData.info.purchase_date).toLocaleDateString(t('common.dateLocale'))}</Text>
                 </View>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.statusLabel')}</Text>
                    <Text style={[styles.infoValue, { color: getStatusColor(lotData.info.status) }]}>
                      {getStatusLabel(lotData.info.status)}
                      {lotData.info.status === 'TERMINE' && lotData.info.motif_fin && ` (${lotData.info.motif_fin})`}
                    </Text>
                 </View>
              </View>
              <View style={styles.infoRow}>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.age')}</Text>
                    <Text style={styles.infoValue}>{t(calculateAge(lotData.info.purchase_date).unit === 'days' ? 'farms.age_days' : 'farms.age_weeks', { count: calculateAge(lotData.info.purchase_date).value })}</Text>
                 </View>
                 <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>{t('lots.alive')}</Text>
                    <Text style={[styles.infoValue, { color: theme.colors.primary, fontWeight: 'bold' }]}>{formatNumber(lotData.info.current_quantity)} {t('lots.heads')}</Text>
                 </View>
              </View>
            </Card>

            <View style={styles.statsContainer}>
              {/* Bloc Production */}
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialCommunityIcons name="egg-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.statsTitle}>{t('lots.statsProduction')}</Text>
                </View>
                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.eggsProduced')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalOeufs)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersProduced')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalCasiers)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersVendables')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.success }]}>{formatNumber(lotData.availableStock)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.casiersCasses')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.warning }]}>{formatNumber(lotData.availableCasses)}</Text>
                  </View>
                </View>
              </Card>

            {/* ALIMENTATION */}
            <View style={styles.section}>
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialCommunityIcons name="food-apple" size={20} color={theme.colors.primary} />
                  <Text style={styles.statsTitle}>Alimentation</Text>
                </View>
                {/* Matières premières */}
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Matières premières</Text>
                  {lotData.rawMaterialsDetail.length > 0 && (
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: theme.colors.primary + '20' }]}>
                      <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold' }}>
                        {formatNumber(lotData.rawMaterialsDetail.reduce((s: number, i: any) => s + (i.total || 0), 0))} kg
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.rawMaterialsDetail.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.rawMaterialsDetail.map((item: any, idx: number) => (
                      <View key={`raw-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.feed_type}: <Text style={styles.ingredientQty}>{formatNumber(item.total)}kg</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucune matière première enregistrée</Text>
                )}

                <View style={{ height: 12 }} />

                {/* Aliment préparé */}
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Aliment préparé</Text>
                  {lotData.preparedFeedsDetail?.length > 0 && (
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: theme.colors.warning + '30' }]}>
                      <Text style={{ color: theme.colors.warning, fontSize: 12, fontWeight: 'bold' }}>
                        {formatNumber(lotData.preparedFeedsDetail.reduce((s: number, i: any) => s + (i.total || 0), 0))} kg
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.preparedFeedsDetail?.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.preparedFeedsDetail.map((item: any, idx: number) => (
                      <View key={`prep-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.feed_name}: <Text style={styles.ingredientQty}>{formatNumber(item.total)}kg</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucun aliment préparé enregistré</Text>
                )}

                <View style={{ height: 12, borderTopWidth: 0.8, borderTopColor: '#00000010', marginTop: 8 }} />

                {/* Stats consommation */}
                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.consommationAliment')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalFeedConsumed)} kg</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.derniereDistribution')}</Text>
                    <Text style={styles.statsValue}>
                      {lotData.lastFeedDate ? new Date(lotData.lastFeedDate).toLocaleDateString(t('common.dateLocale')) : '-'}
                    </Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.dernierePreparation')}</Text>
                    <Text style={styles.statsValue}>
                      {lotData.lastPreparationDate ? new Date(lotData.lastPreparationDate).toLocaleDateString(t('common.dateLocale')) : '-'}
                    </Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* SANTÉ */}
            <View style={styles.section}>
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <MaterialIcons name="medical-services" size={20} color="#E91E63" />
                  <Text style={[styles.statsTitle, { color: '#E91E63' }]}>Santé</Text>
                </View>
                {/* Stock médicaments */}
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>Stock médicaments</Text>
                  {lotData.health_detail?.length > 0 && (
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: '#E91E6320' }]}>
                      <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: 'bold' }}>
                        {lotData.health_detail.reduce((s: number, i: any) => s + (i.quantity || 0), 0)}
                      </Text>
                    </View>
                  )}
                </View>
                {lotData.health_detail?.length > 0 ? (
                  <View style={styles.ingredientGrid}>
                    {lotData.health_detail.map((item: any, idx: number) => (
                      <View key={`health-${idx}`} style={styles.ingredientItem}>
                        <Text style={styles.ingredientName}>
                          {item.product_name}
                        </Text>
                        <Text style={[styles.ingredientQty, { color: theme.colors.primary }]}>
                          {formatNumber(item.quantity)} {item.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucun médicament enregistré</Text>
                )}

                <View style={{ height: 12, borderTopWidth: 0.8, borderTopColor: '#00000010', marginTop: 8 }} />

                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesMalades')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.warning }]}>{formatNumber(lotData.currentSick)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesGueries')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.success }]}>{formatNumber(lotData.recoveredCount)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.poulesMortes')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.danger }]}>{formatNumber(lotData.deadCount)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('lots.traitementsEffectues')}</Text>
                    <Text style={styles.statsValue}>{formatNumber(lotData.totalTreatments)}</Text>
                  </View>
                </View>
              </Card>
            </View>

              {/* Finance Compact */}
              <Card style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="account-balance" size={20} color={theme.colors.success} />
                    <Text style={styles.statsTitle}>Bénéfice Net</Text>
                  </View>
                  <Text style={[styles.statsValue, { color: lotData.profit >= 0 ? theme.colors.success : theme.colors.danger, fontSize: 18 }]}>
                    {formatNumber(lotData.profit)}
                  </Text>
                </View>
                <View style={[styles.statsGrid, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border + '20' }]}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('finance.income')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.success, fontSize: 14 }]}>{formatNumber(lotData.revenues)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>{t('finance.expenses')}</Text>
                    <Text style={[styles.statsValue, { color: theme.colors.danger, fontSize: 14 }]}>{formatNumber(lotData.expenses)}</Text>
                  </View>
                </View>
              </Card>

              {/* Performance Compact */}
              <Card style={styles.perfCardCompact}>
                <View style={styles.perfHeader}>
                   <MaterialIcons name={performance >= 90 ? "trending-up" : performance >= 70 ? "trending-flat" : "trending-down"} size={24} color={getPerformanceLabel(performance, t).color} />
                   <View style={{ marginLeft: 12, flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.perfLabel}>{t('lots.lotPerformance')}</Text>
                      <Text style={[styles.perfValueCompact, {color: getPerformanceLabel(performance, t).color}]}>{performance}%</Text>
                   </View>
                </View>
              </Card>
            </View>
            </>
          )}
          </>
        )}

        {hasPending && !loading && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>{t('production.conversionsTitle') || t('conversion.title')}</Text>
            <Card style={styles.infoDetailsCard}>
              <View style={styles.statsGrid}>
                <View style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{t('production.stats.produced')}</Text>
                  <Text style={styles.statsValue}>{formatNumber(totals.produits)}</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{t('production.initialSalable')}</Text>
                  <Text style={styles.statsValue}>{formatNumber(totals.vendablesInit)}</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{t('production.pendingCrates')}</Text>
                  <Text style={[styles.statsValue, { color: theme.colors.warning }]}>{formatNumber(totals.enAttente)}</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{t('production.currentSalable')}</Text>
                  <Text style={[styles.statsValue, { color: theme.colors.success }]}>{formatNumber(totals.vendablesActuels)}</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{t('production.availableSalable')}</Text>
                  <Text style={[styles.statsValue, { color: theme.colors.primary }]}>{formatNumber(lotData.availableStock)}</Text>
                </View>
              </View>

              {/* Productions ayant encore des casiers en attente → conversion possible */}
              {isConvertibleUser && convertibleProductions.length > 0 && (
                <View style={{ marginTop: 8, borderTopWidth: 0.8, borderTopColor: theme.colors.border + '30', paddingTop: 8 }}>
                  {convertibleProductions.map((it: any) => (
                    <View key={`conv-${it.production.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={[styles.historyDate, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
                        {it.production.date ? new Date(it.production.date).toLocaleDateString(t('common.dateLocale')) : '-'}
                        {'  ·  '}{formatNumber(it.enAttenteActuel)} en attente
                      </Text>
                      <TouchableOpacity
                        style={[styles.headerActionBtn, { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary + '18' }]}
                        onPress={() => goToConvert(it)}
                      >
                        <MaterialIcons name="swap-vert" size={16} color={theme.colors.primary} />
                        <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                          {t('conversion.convertAction')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {allConversionHistory.length > 0 && (
                <View style={{ marginTop: 8, borderTopWidth: 0.8, borderTopColor: theme.colors.border + '30', paddingTop: 8 }}>
                  <Text style={styles.stockSectionTitle}>{t('production.conversionHistory')}</Text>
                  {allConversionHistory.map((h: any, hIdx: number) => (
                    <View key={`ch-${hIdx}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
                      <Text style={styles.historyDate}>
                        {h.conversion_date || h.date ? new Date(h.conversion_date || h.date).toLocaleDateString(t('common.dateLocale')) : '-'}
                        {' · '}{String(h.from_state || 'EN_ATTENTE')} → {String(h.to_state || 'VENDABLE')}
                      </Text>
                      <Text style={[styles.historyDesc, { color: theme.colors.success }]}>+{formatNumber(Number(h.quantity) || 0)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
        )}

        {!isArchived && (
          <>
            <Text style={styles.sectionTitle}>{t('lots.quickActions')}</Text>
            {isDesktop || isTablet ? (
              <View style={styles.actionRowDesktop}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.actionCircleDesktop}
                    onPress={() => navigation.navigate(action.screen, {
                      lotId,
                      lotName,
                      farmId,
                      lotPurchaseDate: lotData?.info?.purchase_date,
                      currentQuantity: lotData?.info?.current_quantity
                    })}
                  >
                    <View style={styles.iconContainer}>
                      {action.iconType === 'MaterialCommunityIcons' ? (
                        <MaterialCommunityIcons name={action.icon as any} size={26} color="#000000" />
                      ) : (
                        <MaterialIcons name={action.icon as any} size={26} color="#000000" />
                      )}
                    </View>
                    <Text style={styles.actionLabel}>{action.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionRow}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.actionCircle}
                    onPress={() => navigation.navigate(action.screen, {
                      lotId,
                      lotName,
                      farmId,
                      lotPurchaseDate: lotData?.info?.purchase_date,
                      currentQuantity: lotData?.info?.current_quantity
                    })}
                  >
                    <View style={styles.iconContainer}>
                      {action.iconType === 'MaterialCommunityIcons' ? (
                        <MaterialCommunityIcons name={action.icon as any} size={26} color="#000000" />
                      ) : (
                        <MaterialIcons name={action.icon as any} size={26} color="#000000" />
                      )}
                    </View>
                    <Text style={styles.actionLabel}>{action.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {isArchived && (
          <Card style={[styles.statsCard, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger, borderWidth: 1, marginTop: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="info-outline" size={24} color={theme.colors.danger} />
              <Text style={{ marginLeft: 10, color: theme.colors.danger, fontWeight: 'bold', flex: 1 }}>
                Ce lot est ARCHIVÉ. Aucune nouvelle donnée ne peut être ajoutée.
              </Text>
            </View>
          </Card>
        )}

        {lotData && lotData.recentActions.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>{t('lots.history')}</Text>
              {lotData.recentActions.length > 3 && (
                <TouchableOpacity onPress={() => navigation.navigate('LotHistory', { lotId, lotName })}>
                  <Text style={styles.seeAll}>{t('lots.seeAll')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {lotData.recentActions.slice(0, 3).map((act: any, i: number) => {
              const isCancelled = act.action.toLowerCase().includes('annul') || act.action.toLowerCase().includes('suppression');
              const isDesktop = Platform.OS === 'web';
                const CardWrapper = isDesktop ? View : TouchableOpacity;
                return (
                  <View key={i}>
                  <CardWrapper
                    {...(!isDesktop ? {
                      onPress: () => {
                        if (userRole === 'PROPRIETAIRE') {
                          handleActionPress(act);
                        }
                      },
                      disabled: userRole === 'EMPLOYE' || isCancelled,
                      activeOpacity: 0.7
                    } : {})}
                    style={{ opacity: isCancelled ? 0.6 : 1 }}
                  >
                  <Card style={[styles.historyCard, isCancelled && { borderColor: theme.colors.textSecondary + '40' }]}>
                    <View style={styles.historyLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={[styles.historyType, isCancelled && { textDecorationLine: 'line-through' }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {getModuleLabel(act.module, act.action)} • {act.action}
                        </Text>
                        <Text style={styles.historyUser} numberOfLines={1} ellipsizeMode="tail"> • {act.user_name}</Text>
                        {isCancelled && (
                          <View style={{ marginLeft: 8, backgroundColor: theme.colors.danger + '20', paddingHorizontal: 6, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: theme.colors.danger, fontWeight: 'bold' }}>{t('common.cancelled')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.historyDate}>{new Date(act.date).toLocaleDateString(t('common.dateLocale'))} {new Date(act.date).toLocaleTimeString(t('common.dateLocale'), { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: isDesktop ? '60%' : '40%', justifyContent: 'flex-end' }}>
                      <Text
                        style={[styles.historyDesc, isCancelled && { textDecorationLine: 'line-through' }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {act.description}
                      </Text>
                      {!isCancelled && userRole === 'PROPRIETAIRE' && !isDesktop && (
                        <MaterialIcons name="undo" size={20} color={theme.colors.warning} style={{ marginLeft: 8 }} />
                      )}
                      {userRole === 'PROPRIETAIRE' && isDesktop && (
                        <View style={styles.desktopActions}>
                          {!isCancelled && (
                            <>
                              <Pressable
                                onPress={() => handleEditAction(act)}
                                style={({ pressed }) => [styles.actionIconButton, { opacity: pressed ? 0.6 : 1, cursor: 'pointer' } as any]}
                              >
                                <MaterialIcons name="edit" size={18} color={theme.colors.primary} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleCancelAction(act)}
                                style={({ pressed }) => [styles.actionIconButton, { opacity: pressed ? 0.6 : 1, cursor: 'pointer' } as any]}
                              >
                                <MaterialIcons name="undo" size={18} color={theme.colors.warning} />
                              </Pressable>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  </Card>
                  </CardWrapper>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false, isTablet: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: (isDesktop || isTablet) ? space.xl : space.md,
    paddingVertical: space.md,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
    marginLeft: space.sm,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: radius.pill,
    ...(shadow.xs as any),
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  subtitle: { fontSize: 12.5, color: theme.colors.textSecondary, fontWeight: '600' },
  editButton: {
    padding: 8,
  },
  scroll: { padding: space.md, paddingBottom: 48 },
  scrollDesktop: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: space.xl,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  kpiItem: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    padding: space.md,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  kpiValue: { fontSize: 21, fontWeight: '800', color: theme.colors.text, marginVertical: 4 },
  kpiLabel: { fontSize: 10.5, color: theme.colors.textSecondary, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.3 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: space.sm, marginTop: space.xs, letterSpacing: 0.1 },
  section: { marginBottom: space.lg },
  mainSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  mainSectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.primary, marginLeft: 0, textTransform: 'uppercase', letterSpacing: 0.4 },
  stockSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    marginBottom: space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    marginBottom: space.xs,
    borderRadius: radius.md,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '800' },
  itemValueContainer: { alignItems: 'flex-end' },
  itemValue: { fontSize: 17, fontWeight: '800' },
  itemUnit: { fontSize: 11.5, fontWeight: '600', color: theme.colors.textSecondary },
  actionRow: { marginBottom: space.lg, marginHorizontal: -space.md, paddingLeft: space.md },
  actionCircle: { alignItems: 'center', marginRight: 14, width: 82 },
  actionRowDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: space.lg,
    gap: 10,
  },
  actionCircleDesktop: {
    alignItems: 'center',
    width: 92,
  },
  iconContainer: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...(shadow.sm as any),
  },
  actionLabel: { fontSize: 11.5, color: theme.colors.text, fontWeight: '700', textAlign: 'center' },
  historySection: { marginTop: space.xs },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  seeAll: { color: theme.colors.primary, fontSize: 12.5, fontWeight: '700' },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
    marginBottom: space.xs,
    borderRadius: radius.md,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  historyLeft: { flex: 1, minWidth: 0 },
  historyType: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text },
  historyUser: { fontSize: 11.5, color: theme.colors.textSecondary },
  historyDate: { fontSize: 11.5, color: theme.colors.textSecondary, marginTop: 2 },
  historyDesc: { fontSize: 14.5, fontWeight: '800' },
  healthStatsMini: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  healthStatMiniItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  healthStatMiniDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: theme.colors.border,
    marginHorizontal: 6,
  },
  miniStatText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '700',
  },
  miniStatLabel: {
    fontSize: 9,
    color: theme.colors.textSecondary,
  },
  infoDetailsCard: {
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  statsContainer: {
    width: '100%',
  },
  statsCard: {
    padding: space.md,
    borderRadius: radius.lg,
    marginBottom: space.sm,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  statsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginLeft: 8,
    color: theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statsItem: {
    width: '48%',
    marginBottom: 12,
  },
  statsLabel: {
    fontSize: 10.5,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 3,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statsValue: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '800',
  },
  subSection: { marginTop: 4 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subTitle: { fontSize: 12.5, fontWeight: '700', color: theme.colors.textSecondary },
  totalBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.colors.primary + '20', color: theme.colors.primary, fontSize: 11.5, fontWeight: '800' },
  ingredientGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  ingredientItem: { width: '48%' },
  ingredientName: { fontSize: 11.5, color: theme.colors.text },
  ingredientQty: { fontWeight: '800' },
  noDataText: { fontSize: 11.5, color: theme.colors.textSecondary, fontStyle: 'italic' },
  perfCardCompact: {
    padding: space.md,
    borderRadius: radius.lg,
    marginBottom: space.sm,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  perfValueCompact: {
    fontSize: 17,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: 12,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 10.5,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 3,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  infoValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '700',
  },
  healthDetailCard: {
    padding: space.md,
    borderRadius: radius.lg,
    marginBottom: space.sm,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  healthTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginLeft: 8,
    color: theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  healthContent: {
    paddingLeft: 32,
  },
  healthRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  healthLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    width: 80,
    fontWeight: '600',
  },
  healthValue: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '600',
  },
  perfCard: {
    padding: space.md,
    borderRadius: radius.lg,
    marginBottom: space.sm,
    backgroundColor: theme.colors.surface,
    ...(shadow.xs as any),
  },
  perfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perfValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  perfLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    marginBottom: space.xs,
    borderRadius: radius.md,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
    ...(shadow.xs as any),
  },
  reminderText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: theme.colors.text,
  },
  reminderDate: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  desktopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.colors.border,
    paddingLeft: 8,
    gap: 4,
  },
  actionIconButton: {
    padding: 6,
  }
});