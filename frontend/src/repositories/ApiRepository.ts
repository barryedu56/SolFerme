import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { apiClient, fetchAll } from '../api/client';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { buildLocalResponse, getLocalData, handleOfflineWrite, CANCELLABLE_TABLES } from './dataSources/LocalApiFallback';
import { deleteRow, fetchRow, queryAll, queryOne, updateRow } from '../database/localDatabase';
import { getEndpointId, getTableNameFromEndpoint, parseEndpoint } from '../utils/offlineSyncUtils';
import { syncManager } from '../utils/syncManager';
import { formatCurrency } from '../utils/formatters';

/**
 * Fusionne les items non-synchronisés locaux avec la réponse API.
 * Les items locaux déjà synchronisés (mapping local_id→server_id) sont retirés.
 * Les items non-synchronisés sont ajoutés en tête de liste.
 */
function mergeApiWithLocal(apiData: any, localUnsynced: any[]): any {
  // Déterminer le format de la réponse API
  const isArray = Array.isArray(apiData);
  const apiItems = isArray ? apiData : (apiData?.results || []);
  const isPaginated = !isArray && apiData && 'results' in apiData;

  // Filtrer les items locaux : garder ceux non-synchronisés ou modifiés localement
  const trulyUnsynced = localUnsynced.filter((item: any) => item.id < 0 || item._needs_sync === 1);

  // Pour les items modifiés (id > 0), ils priment sur la version API.
  // On utilise un Set des IDs locaux pour filtrer l'API.
  const localIds = new Set(trulyUnsynced.map((item: any) => item.id));

  // Retirer de l'API les items qui ont une version locale plus récente
  const filteredApiItems = apiItems.filter((item: any) => !localIds.has(item.id));

  if (trulyUnsynced.length === 0) {
    return apiData;
  }

  // Fusionner : items locaux (les plus récents en premier) puis items API restants
  // BUG-15 FIX : trier par updated_at DESC
  const sortedUnsynced = trulyUnsynced.sort((a: any, b: any) => {
    const dA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const dB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return dB - dA;
  });
  const mergedItems = [...sortedUnsynced, ...filteredApiItems];

  if (isPaginated) {
    return { ...apiData, results: mergedItems };
  }
  return mergedItems;
}

export class ApiRepository {

  get defaults() {
    return apiClient.defaults;
  }

  /**
   * Extrait les paramètres de requête d'un URL intégré au format ?key=value&...
   * Utilisé quand config.params n'est pas fourni (ex: StatisticsScreen passe l'URL entière).
   */
  private parseUrlParams(endpoint: string): Record<string, string> {
    const match = endpoint.match(/\?(.+)/);
    if (!match) return {};
    const params: Record<string, string> = {};
    for (const part of match[1].split('&')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const key = part.substring(0, eq);
        const value = part.substring(eq + 1);
        params[key] = decodeURIComponent(value);
      }
    }
    return params;
  }

  /** Merge config.params et params extraits de l'URL — config.params prioritaire */
  private resolveParams(endpoint: string, config?: AxiosRequestConfig): Record<string, any> {
    const endpointParams = this.parseUrlParams(endpoint);
    if (config?.params) {
      return { ...endpointParams, ...config.params };
    }
    return endpointParams;
  }

  private async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    if (Platform.OS === 'web') {
      // Sur web, navigator.onLine est plus fiable que NetInfo pour détecter
      // la déconnexion réseau totale. NetInfo retourne souvent isConnected=true
      // même quand le réseau est coupé sur certains navigateurs.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
      return Boolean(state.isConnected);
    }
    return Boolean(state.isConnected && state.isInternetReachable);
  }

  private isSyncable(endpoint: string): boolean {
    return Boolean(getTableNameFromEndpoint(endpoint));
  }

  /** Un endpoint avec une action est un computed endpoint — pas d'équivalent SQLite */
  private isComputedEndpoint(endpoint: string): boolean {
    const parsed = parseEndpoint(endpoint);
    return Boolean(parsed.action);
  }

  /** Pour un endpoint d'action, extraire le endpoint parent (ex: /health-alerts/27/mark_as_viewed/ → /health-alerts/) */
  private getParentEndpoint(endpoint: string): string {
    const parsed = parseEndpoint(endpoint);
    if (parsed.action && parsed.resource) {
      return `/${parsed.resource}/`;
    }
    return endpoint;
  }

  /**
 * Calcule les statistiques d'un lot depuis les données SQLite locales.
 * Agrège productions, ventes, alimentation, santé, mouvements.
 * Utilisé en mode offline pour afficher les vraies données locales.
 */
  private async computeLocalLotStatistics(lotId: number): Promise<any> {
    try {
      const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
      if (!lot) {
        return {
          info: { id: lotId, farm_id: 0, farm: 0, name: '', animal_type: 'Pondeuses', status: 'ACTIF', breed: '', purchase_date: new Date().toISOString(), current_quantity: 0, initial_quantity: 0, supplier: '' },
          total_casiers: 0, total_oeufs: 0, total_oeufs_casses: 0, total_casiers_vendables: 0,
          available_stock: 0, available_casses: 0, revenues: 0, expenses: 0, profit: 0,
          dead_count: 0, current_sick: 0, recovered_count: 0, total_sick: 0,
          total_treatments: 0, total_feed_consumed: 0,
          last_feed_date: null, last_preparation_date: null,
          raw_materials_detail: [], prepared_feeds_detail: [],
          health_stock: 0, health_detail: [], last_health_record: null,
          performance: 0, prod_today: 0, prod_week: 0,
          feed_stock: 0, raw_material_stock: 0,
          production_by_period: [], sales_by_period: [],
        };
      }

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const getLocalStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const today = getLocalStr(now);
      const weekAgo = getLocalStr(new Date(now.getTime() - 7 * 86400000));

      // Productions actives du lot
      const productions = await queryAll<any>(
        `SELECT * FROM productions WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const totalCasiers = productions.reduce((s: number, p: any) => s + (p.casiers_produits || 0), 0);
      const totalOeufs = productions.reduce((s: number, p: any) => s + (p.casiers_vendables || 0), 0);
      const totalOeufsCasses = productions.reduce((s: number, p: any) => s + (p.oeufs_casses || 0), 0);
      const prodToday = productions.filter((p: any) => p.date === today).reduce((s: number, p: any) => s + (p.casiers_vendables || 0), 0);
      const prodWeek = productions.filter((p: any) => p.date >= weekAgo).reduce((s: number, p: any) => s + (p.casiers_vendables || 0), 0);

      // Ventes actives du lot
      const sales = await queryAll<any>(
        `SELECT * FROM sales WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const revenues = sales.reduce((s: number, sa: any) => s + (sa.total_amount || 0), 0);
      const encaissements = sales.reduce((s: number, sa: any) => s + (sa.amount_paid || 0), 0);
      const creances = revenues - encaissements;
      const eggRevenues = sales.filter((s: any) => s.product_type === 'NORMAL' || s.product_type === 'BROKEN')
        .reduce((s: number, sa: any) => s + (sa.total_amount || 0), 0);
      const chickenRevenues = sales.filter((s: any) => s.product_type === 'CHICKEN')
        .reduce((s: number, sa: any) => s + (sa.total_amount || 0), 0);
      const eggSalesQty = sales.filter((s: any) => s.product_type === 'NORMAL').reduce((s: number, sa: any) => s + (sa.quantity || 0), 0);
      const brokenEggSalesQty = sales.filter((s: any) => s.product_type === 'BROKEN').reduce((s: number, sa: any) => s + (sa.quantity || 0), 0);

      // Inclure les conversions d'œufs dans le stock vendable
      const conversions = await queryAll<any>(
        `SELECT * FROM egg_conversions WHERE lot_id = ? AND to_state = 'VENDABLE' AND status = 'ACTIF'`,
        [lotId]
      );
      const conversionSum = conversions.reduce((s: number, c: any) => s + (c.quantity || 0), 0);
      const availableStock = Math.max(0, (totalOeufs + conversionSum) - eggSalesQty);
      const availableCasses = Math.max(0, (totalOeufsCasses / 30.0) - brokenEggSalesQty);

      // Mouvements de poules
      const movements = await queryAll<any>(
        `SELECT * FROM chicken_movements WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const deadCount = movements.filter((m: any) => m.type === 'MORT').reduce((s: number, m: any) => s + (m.quantity || 0), 0);

      // Santé — mouvements de poules pour le comptage MALADE/GUERI (miroir du backend)
      const totalSick = movements.filter((m: any) => m.type === 'MALADE').reduce((s: number, m: any) => s + (m.quantity || 0), 0);
      const animalRecoveredCount = movements.filter((m: any) => m.type === 'GUERI').reduce((s: number, m: any) => s + (m.quantity || 0), 0);
      const currentSick = Math.max(0, totalSick - animalRecoveredCount);

      // Santé — traitements vétérinaires (health_records)
      const healthRecords = await queryAll<any>(
        `SELECT * FROM health_records WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const totalTreatments = healthRecords.length;
      const lastHealthRecord = healthRecords.length > 0 ? healthRecords[healthRecords.length - 1] : null;

      // Alimentation (feeds)
      const feeds = await queryAll<any>(
        `SELECT * FROM feeds WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const totalFeedConsumed = feeds.reduce((s: number, f: any) => s + (f.quantity_kg || 0), 0);
      const lastFeedDate = feeds.length > 0 ? feeds[feeds.length - 1].date : null;

      const feedPurchases = await queryAll<any>(
        `SELECT * FROM feed_purchases WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const healthPurchases = await queryAll<any>(
        `SELECT * FROM health_purchases WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date`,
        [lotId]
      );
      const totalFeedPurchaseCost = feedPurchases.reduce((s: number, p: any) => s + (p.total_price || 0), 0);
      const totalHealthPurchaseCost = healthPurchases.reduce((s: number, p: any) => s + (p.total_price || 0), 0);

      // Feed inventory (matières premières)
      const feedInventory = await queryAll<any>(
        `SELECT * FROM feed_inventory WHERE lot_id = ?`,
        [lotId]
      );
      const feedStock = feedInventory.reduce((s: number, fi: any) => s + (fi.quantity_kg || 0), 0);
      const rawMaterialStock = feedStock;
      const rawMaterialsDetail = feedInventory.map((fi: any) => ({
        feed_type: fi.feed_type, total: fi.quantity_kg
      }));

      // Prepared feed inventory
      const preparedFeedInventory = await queryAll<any>(
        `SELECT * FROM prepared_feed_inventory WHERE lot_id = ?`,
        [lotId]
      );
      const preparedFeedsDetail = preparedFeedInventory.map((pf: any) => ({
        feed_name: pf.feed_name, total: pf.quantity_kg
      }));
      const lastPreparations = await queryAll<any>(
        `SELECT * FROM feed_preparations WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date DESC LIMIT 1`,
        [lotId]
      );
      const lastPreparationDate = lastPreparations.length > 0 ? lastPreparations[0].date : null;

      // Health inventory
      const healthInventory = await queryAll<any>(
        `SELECT * FROM health_inventory WHERE lot_id = ?`,
        [lotId]
      );
      const healthStock = healthInventory.reduce((s: number, hi: any) => s + (hi.quantity || 0), 0);
      const healthDetail = healthInventory.map((hi: any) => ({
        product_name: hi.product_name, product_type: hi.product_type, quantity: hi.quantity, unit: hi.unit
      }));

      // Expenses: miroir exact du backend Django
      // total_expenses = SUM(feed_purchases.total_price) + SUM(health_purchases.total_price) + lot.purchase_price
      // NB: feeds.cost et health_records.cost ne sont PAS inclus dans les expenses backend
      const expenses = totalFeedPurchaseCost + totalHealthPurchaseCost + Number(lot.purchase_price || 0);
      const profit = revenues - expenses;

      // Performance
      const initialQty = lot.initial_quantity || 1;
      const performance = initialQty > 0 ? Math.round(((lot.current_quantity || 0) / initialQty) * 100) : 0;

      // 🔧 Agrégation des productions par période (par jour)
      const productionByPeriodMap = new Map<string, number>();
      for (const p of productions) {
        const day = p.date;
        productionByPeriodMap.set(day, (productionByPeriodMap.get(day) || 0) + (p.casiers_vendables || 0));
      }
      const productionByPeriod = Array.from(productionByPeriodMap.entries())
        .map(([day, value]) => ({ day, value }))
        .sort((a, b) => a.day.localeCompare(b.day));

      // 🔧 Agrégation des ventes par période (par jour)
      const salesByPeriodMap = new Map<string, number>();
      for (const s of sales) {
        const day = s.date;
        salesByPeriodMap.set(day, (salesByPeriodMap.get(day) || 0) + (s.total_amount || 0));
      }
      const salesByPeriod = Array.from(salesByPeriodMap.entries())
        .map(([day, value]) => ({ day, value }))
        .sort((a, b) => a.day.localeCompare(b.day));

      // Normaliser les FK pour que l'UI ait à la fois farm_id et farm
      // (le formulaire utilise 'farm', SQLite stocke 'farm_id')
      const normalizedLot = { ...lot };
      if (lot.farm_id && !lot.farm) normalizedLot.farm = lot.farm_id;

      return {
        info: normalizedLot,
        total_casiers: totalCasiers, total_oeufs: totalOeufs, total_oeufs_casses: totalOeufsCasses,
        total_casiers_vendables: totalOeufs + conversionSum, available_stock: availableStock, available_casses: availableCasses,
        revenues, encaissements, creances, egg_revenues: eggRevenues, chicken_revenues: chickenRevenues, expenses, profit,
        dead_count: deadCount, current_sick: currentSick, recovered_count: animalRecoveredCount, total_sick: totalSick,
        total_treatments: totalTreatments, total_feed_consumed: totalFeedConsumed,
        last_feed_date: lastFeedDate, last_preparation_date: lastPreparationDate,
        raw_materials_detail: rawMaterialsDetail, prepared_feeds_detail: preparedFeedsDetail,
        health_stock: healthStock, health_detail: healthDetail, last_health_record: lastHealthRecord,
        performance, prod_today: prodToday, prod_week: prodWeek,
        feed_stock: feedStock, raw_material_stock: rawMaterialStock,
        production_by_period: productionByPeriod, sales_by_period: salesByPeriod,
      };
    } catch (e: any) {
      console.warn('[ApiRepo] Erreur computeLocalLotStatistics:', e?.message);
      return {
        info: { id: lotId, farm_id: 0, farm: 0, name: '', animal_type: 'Pondeuses', status: 'ACTIF', breed: '', purchase_date: new Date().toISOString(), current_quantity: 0, initial_quantity: 0, supplier: '' },
        total_casiers: 0, total_oeufs: 0, total_oeufs_casses: 0, total_casiers_vendables: 0,
        available_stock: 0, available_casses: 0, revenues: 0, encaissements: 0, creances: 0, expenses: 0, profit: 0,
        dead_count: 0, current_sick: 0, recovered_count: 0, total_sick: 0,
        total_treatments: 0, total_feed_consumed: 0,
        last_feed_date: null, last_preparation_date: null,
        raw_materials_detail: [], prepared_feeds_detail: [],
        health_stock: 0, health_detail: [], last_health_record: null,
        performance: 0, prod_today: 0, prod_week: 0,
        feed_stock: 0, raw_material_stock: 0,
        production_by_period: [], sales_by_period: [],
      };
    }
  }

  /**
   * Calcule les statistiques globales de ferme depuis les données SQLite locales.
   * Supporte le paramètre `period` pour les graphiques et tendances.
   * 🔧 Supporte le filtrage par farmId et lotId pour la parité Offline = Online.
   */
  private async computeLocalFarmStatistics(period?: string, farmId?: number, lotId?: number): Promise<any> {
    try {
      // --- 🔧 Construction des filtres ferme / lot ---
      let lotIds: number[] = [];
      let hasLotFilter = false;
      let effectiveFarmId: number | null = farmId ?? null;

      if (lotId) {
        lotIds = [lotId];
        hasLotFilter = true;
        if (!effectiveFarmId) {
          const lotRow = await fetchRow<any>('lots', 'id = ?', [lotId]);
          if (lotRow) effectiveFarmId = lotRow.farm_id ?? null;
        }
      } else if (farmId) {
        const farmLots = await queryAll<any>(`SELECT id FROM lots WHERE farm_id = ?`, [farmId]);
        lotIds = farmLots.map((l: any) => l.id);
        hasLotFilter = true;
      }

      // Clauses SQL réutilisables — s'ajoutent après un WHERE existant via "AND ..."
      const lotIn = hasLotFilter
        ? (lotIds.length > 0 ? `AND lot_id IN (${lotIds.map(() => '?').join(',')})` : 'AND 1=0')
        : '';
      const lotP = hasLotFilter ? lotIds : [];
      const farmW = effectiveFarmId ? 'AND farm_id = ?' : '';
      const farmP: any[] = effectiveFarmId ? [effectiveFarmId] : [];
      // Filtre employés via ferme (pour payrolls/bonuses)
      const empW = effectiveFarmId
        ? 'AND employee_id IN (SELECT id FROM employees WHERE farm_id = ?)'
        : '';
      const empP: any[] = effectiveFarmId ? [effectiveFarmId] : [];

      const farmsCount = effectiveFarmId
        ? await queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM farms WHERE status = ? AND id = ?`, ['ACTIF', effectiveFarmId])
        : await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM farms WHERE status = ?', ['ACTIF']);
      const lotsCount = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM lots WHERE status = ? ${farmW}`, ['ACTIF', ...farmP]
      );
      const totalChickens = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(current_quantity), 0) as cnt FROM lots WHERE status = ? ${farmW}`, ['ACTIF', ...farmP]
      );
      const nowRef = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const today = `${nowRef.getFullYear()}-${pad(nowRef.getMonth() + 1)}-${pad(nowRef.getDate())}`;
      const todayProd = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(casiers_vendables), 0) as cnt FROM productions WHERE date = ? AND status = 'ACTIF' ${lotIn}`,
        [today, ...lotP]
      );
      const totalRevenues = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as cnt FROM sales WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );
      const totalEncaissements = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as cnt FROM sales WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );
      const totalStandaloneExpenses = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(amount), 0) as cnt FROM expenses 
         WHERE status = 'ACTIF'
           AND id NOT IN (SELECT expense_id FROM feed_purchases WHERE expense_id IS NOT NULL)
           AND id NOT IN (SELECT expense_id FROM health_purchases WHERE expense_id IS NOT NULL)
           AND id NOT IN (SELECT expense_id FROM payrolls WHERE expense_id IS NOT NULL)
           AND category != 'PRIME'
           ${farmW}`,
        [...farmP]
      );
      const feedPurchasesCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_price), 0) as cnt FROM feed_purchases WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );
      const healthPurchasesCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_price), 0) as cnt FROM health_purchases WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );
      const lotPurchasesCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(purchase_price), 0) as cnt FROM lots WHERE status != 'ANNULEE' ${farmW}`,
        [...farmP]
      ).catch(() => ({ cnt: 0 }));
      const payrollCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as cnt FROM payrolls WHERE status = 'ACTIF' ${empW}`,
        [...empP]
      ).catch(() => ({ cnt: 0 }));
      
      const totalExpensesAmount = (totalStandaloneExpenses?.cnt || 0) + 
                                  (feedPurchasesCost?.cnt || 0) + 
                                  (healthPurchasesCost?.cnt || 0) + 
                                  (lotPurchasesCost?.cnt || 0) + 
                                  (payrollCost?.cnt || 0);
      const alertsCount = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM health_alerts WHERE is_viewed = 0 ${farmW}`,
        [...farmP]
      );
      const totalBonuses = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(amount), 0) as cnt FROM bonuses WHERE status = 'ACTIF' ${empW}`,
        [...empP]
      );
      const employeesWithBonuses = await queryOne<{ cnt: number }>(
        `SELECT COUNT(DISTINCT employee_id) as cnt FROM bonuses WHERE status = 'ACTIF' ${empW}`,
        [...empP]
      );
      const initialAllQty = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(initial_quantity), 0) as cnt FROM lots WHERE status = ? ${farmW}`, ['ACTIF', ...farmP]
      );
      const currentAllQty = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(current_quantity), 0) as cnt FROM lots WHERE status = ? ${farmW}`, ['ACTIF', ...farmP]
      );
      const performance = initialAllQty?.cnt && initialAllQty.cnt > 0
        ? Math.round((currentAllQty?.cnt || 0) / initialAllQty.cnt * 100)
        : 0;

      // --- Statistiques volailles : mouvements (malades, morts, guérisons) ---
	      const sickBirds = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(quantity), 0) as cnt FROM chicken_movements WHERE type = 'MALADE' AND status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const recoveredBirds = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(quantity), 0) as cnt FROM chicken_movements WHERE type = 'GUERI' AND status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const deadBirds = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(quantity), 0) as cnt FROM chicken_movements WHERE type = 'MORT' AND status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const currentSickBirds = Math.max(0, (sickBirds?.cnt || 0) - (recoveredBirds?.cnt || 0));

	      // --- Statistiques production œufs ---
	      const productionTotal = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(casiers_produits), 0) as cnt FROM productions WHERE status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const productionSalable = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(casiers_vendables), 0) as cnt FROM productions WHERE status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const productionBroken = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(oeufs_casses), 0) as cnt FROM productions WHERE status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const productionSold = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(quantity), 0) as cnt FROM sales WHERE product_type = 'NORMAL' AND status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );

		const conversionSalable = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(quantity), 0) as cnt FROM egg_conversions WHERE status = 'ACTIF' AND to_state = 'VENDABLE' ${lotIn}`,
	      [...lotP]
	    );

      // --- Alimentation détaillée ---
	      const feedingConsumed = await queryOne<{ cnt: number }>(
          `SELECT COALESCE(SUM(quantity_kg), 0) as cnt FROM feeds WHERE status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const lastDistribution = await queryOne<{ date: string }>(
          `SELECT date FROM feeds WHERE status = 'ACTIF' ${lotIn} ORDER BY date DESC LIMIT 1`,
	        [...lotP]
	      );
	      const rawMaterials = await queryAll<any>(
	        `SELECT feed_type, SUM(quantity_kg) as total FROM feed_inventory WHERE 1=1 ${lotIn} GROUP BY feed_type`,
	        [...lotP]
	      );
	      const rawMaterialsDetail = rawMaterials.map((m: any) => ({
	        feed_type: m.feed_type,
	        total: m.total || 0,
	      }));
	      const preparedFeeds = await queryAll<any>(
	        `SELECT feed_name, SUM(quantity_kg) as total FROM prepared_feed_inventory WHERE 1=1 ${lotIn} GROUP BY feed_name`,
	        [...lotP]
	      );
	      const preparedFeedsDetail = preparedFeeds.map((m: any) => ({
	        feed_name: m.feed_name,
	        total: m.total || 0,
	      }));

	      // --- Santé ---
	      const healthTreatments = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM health_records WHERE type = 'TRAITEMENT' AND status = 'ACTIF' ${lotIn}`,
	        [...lotP]
	      );
	      const healthInventory = await queryAll<any>(
	        `SELECT product_name, SUM(quantity) as quantity, unit FROM health_inventory WHERE 1=1 ${lotIn} GROUP BY product_name, unit`,
	        [...lotP]
	      );
	      const healthInventoryDetail = healthInventory.map((h: any) => ({
	        product_name: h.product_name,
	        quantity: h.quantity || 0,
	        unit: h.unit || 'unité',
	      }));

	      // --- Graphiques : production par période ---
      const effectivePeriod = period || 'week';
      let startDate: string;
      const todayStr = today;
      const getLocalStr = (d: Date) => {
        const pad2 = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      };
      
      switch (effectivePeriod) {
        case 'day': startDate = todayStr; break;
        case 'week': startDate = getLocalStr(new Date(nowRef.getTime() - 7 * 86400000)); break;
        case 'month': startDate = getLocalStr(new Date(nowRef.getTime() - 30 * 86400000)); break;
        case 'quarter': startDate = getLocalStr(new Date(nowRef.getTime() - 90 * 86400000)); break;
        case 'year': startDate = getLocalStr(new Date(nowRef.getTime() - 365 * 86400000)); break;
        default: startDate = todayStr;
      }

      // Production agrégée par période (ou par heure pour 'day')
      let chartProduction: any[];
      if (effectivePeriod === 'day') {
        // 🔧 Segmentation horaire pour le mode 'day' (miroir du backend)
        // Matin (heure < 11), Midi (11 <= heure < 16), Soir (heure >= 16)
        const prodRows = await queryAll<any>(
          `SELECT SUBSTR(created_at, 12, 2) as heure, SUM(casiers_vendables) as value FROM productions WHERE date = ? AND status = 'ACTIF' ${lotIn} GROUP BY heure`,
          [todayStr, ...lotP]
        );
        const matinProd = prodRows.filter((r: any) => parseInt(r.heure || '0', 10) < 11).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const midiProd = prodRows.filter((r: any) => { const h = parseInt(r.heure || '0', 10); return h >= 11 && h < 16; }).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const soirProd = prodRows.filter((r: any) => parseInt(r.heure || '0', 10) >= 16).reduce((s: number, r: any) => s + (r.value || 0), 0);
        chartProduction = [
          { label: 'Matin', value: matinProd },
          { label: 'Midi', value: midiProd },
          { label: 'Soir', value: soirProd },
        ];
      } else {
        const prodByPeriod = await queryAll<any>(
          `SELECT date, SUM(casiers_vendables) as value FROM productions WHERE date >= ? AND status = 'ACTIF' ${lotIn} GROUP BY date ORDER BY date`,
          [startDate, ...lotP]
        );
        chartProduction = prodByPeriod.map((r: any) => ({ day: r.date, value: r.value || 0 }));
      }

      // Alimentation agrégée par jour
      const feedingByDay = await queryAll<any>(
        `SELECT date, SUM(quantity_kg) as value FROM feeds WHERE date >= ? AND status = 'ACTIF' ${lotIn} GROUP BY date ORDER BY date`,
        [startDate, ...lotP]
      );
      const chartFeeding = feedingByDay.map((r: any) => ({ day: r.date, value: r.value || 0 }));

      // Tendance financière : comparaison période courante vs période précédente
      const prevStartDate = (() => {
        const daysDiff = Math.round((nowRef.getTime() - new Date(startDate).getTime()) / 86400000);
        const endPrev = getLocalStr(new Date(new Date(startDate).getTime() - 86400000));
        const startPrev = getLocalStr(new Date(new Date(endPrev).getTime() - daysDiff * 86400000));
        return startPrev;
      })();

      const currentRev = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as cnt FROM sales WHERE date >= ? AND status = 'ACTIF' ${lotIn}`,
        [startDate, ...lotP]
      );
      const prevRev = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as cnt FROM sales WHERE date >= ? AND date < ? AND status = 'ACTIF' ${lotIn}`,
        [prevStartDate, startDate, ...lotP]
      );
      const revenueTrend = prevRev?.cnt && prevRev.cnt > 0
        ? Math.round(((currentRev?.cnt || 0) - prevRev.cnt) / prevRev.cnt * 100)
        : 0;

      // --- Transactions récentes (avec montants réels depuis ventes et dépenses) ---
      const recentSalePayments = await queryAll<any>(
        `SELECT id, payment_date as date, amount, reference, lot_id, status FROM sale_payments WHERE status IN ('ACTIF', 'ANNULEE') ${lotIn} ORDER BY payment_date DESC LIMIT 5`,
        [...lotP]
      );
      const recentExpenses = await queryAll<any>(
        `SELECT id, date, amount, category, description, status FROM expenses WHERE status IN ('ACTIF', 'ANNULEE') ${farmW} ORDER BY date DESC LIMIT 5`,
        [...farmP]
      );
      const recentFeedPurchases = await queryAll<any>(
        `SELECT id, date, total_price as amount, feed_type, lot_id, status FROM feed_purchases WHERE status IN ('ACTIF', 'ANNULEE') ${lotIn} ORDER BY date DESC LIMIT 5`,
        [...lotP]
      );
      const recentHealthPurchases = await queryAll<any>(
        `SELECT id, date, total_price as amount, product_name, lot_id, status FROM health_purchases WHERE status IN ('ACTIF', 'ANNULEE') ${lotIn} ORDER BY date DESC LIMIT 5`,
        [...lotP]
      );

      const transactionItems: any[] = [];
      for (const p of recentSalePayments) {
        transactionItems.push({
          id: `payment-${p.id}`,
          title: `Paiement Vente - ${formatCurrency(p.amount)}`,
          amount: p.amount || 0,
          date: p.date,
          type: 'income',
          status: p.status,
        });
      }
      for (const e of recentExpenses) {
        transactionItems.push({
          id: `expense-${e.id}`,
          title: e.description || e.category || 'Dépense',
          amount: e.amount || 0,
          date: e.date,
          type: 'expense',
          status: e.status,
        });
      }
      for (const fp of recentFeedPurchases) {
        transactionItems.push({
          id: `feed-${fp.id}`,
          title: `Achat d'aliment - ${fp.feed_type}`,
          amount: -(fp.amount || 0),
          date: fp.date,
          type: 'expense',
          status: fp.status,
        });
      }
      for (const hp of recentHealthPurchases) {
        transactionItems.push({
          id: `health-${hp.id}`,
          title: `Achat santé - ${hp.product_name}`,
          amount: -(hp.amount || 0),
          date: hp.date,
          type: 'expense',
          status: hp.status,
        });
      }
      // Trier par date décroissante, garder les 10 plus récentes
      transactionItems.sort((a, b) => b.date.localeCompare(a.date));
      const recentTransactions = transactionItems.slice(0, 10);

      // 🔧 Coûts spécifiques (alimentation, santé) depuis les tables d'achats
      const feedingCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_price), 0) as cnt FROM feed_purchases WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );
      const healthCost = await queryOne<{ cnt: number }>(
        `SELECT COALESCE(SUM(total_price), 0) as cnt FROM health_purchases WHERE status = 'ACTIF' ${lotIn}`,
        [...lotP]
      );

      // 🔧 Graphiques financiers : agrégation par tranche horaire (jour) ou par date (autres périodes)
      let chartSales: any[];
      let chartExpenses: any[];
      let chartFinance: any[];

      if (effectivePeriod === 'day') {
        // Mode 'day' : agréger par tranches horaires comme le backend
        // Matin (heure < 11), Midi (11 <= heure < 16), Soir (heure >= 16)
        const salesRows = await queryAll<any>(
          `SELECT SUBSTR(created_at, 12, 2) as heure, SUM(amount_paid) as value FROM sales WHERE date = ? AND status = 'ACTIF' ${lotIn} GROUP BY heure`,
          [todayStr, ...lotP]
        );
        const matinSales = salesRows.filter((r: any) => parseInt(r.heure || '0', 10) < 11).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const midiSales = salesRows.filter((r: any) => { const h = parseInt(r.heure || '0', 10); return h >= 11 && h < 16; }).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const soirSales = salesRows.filter((r: any) => parseInt(r.heure || '0', 10) >= 16).reduce((s: number, r: any) => s + (r.value || 0), 0);
        chartSales = [
          { label: 'Matin', value: matinSales },
          { label: 'Midi', value: midiSales },
          { label: 'Soir', value: soirSales },
        ];

        const expensesRows = await queryAll<any>(
          `SELECT SUBSTR(created_at, 12, 2) as heure, SUM(amount) as value FROM expenses WHERE date = ? AND status = 'ACTIF' ${farmW} GROUP BY heure`,
          [todayStr, ...farmP]
        );
        const feedPurchasesRows = await queryAll<any>(
          `SELECT SUBSTR(created_at, 12, 2) as heure, SUM(total_price) as value FROM feed_purchases WHERE date = ? AND status = 'ACTIF' ${lotIn} GROUP BY heure`,
          [todayStr, ...lotP]
        );
        const healthPurchasesRows = await queryAll<any>(
          `SELECT SUBSTR(created_at, 12, 2) as heure, SUM(total_price) as value FROM health_purchases WHERE date = ? AND status = 'ACTIF' ${lotIn} GROUP BY heure`,
          [todayStr, ...lotP]
        );
        const allExpRows = [...expensesRows, ...feedPurchasesRows, ...healthPurchasesRows];
        const matinExp = allExpRows.filter((r: any) => parseInt(r.heure || '0', 10) < 11).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const midiExp = allExpRows.filter((r: any) => { const h = parseInt(r.heure || '0', 10); return h >= 11 && h < 16; }).reduce((s: number, r: any) => s + (r.value || 0), 0);
        const soirExp = allExpRows.filter((r: any) => parseInt(r.heure || '0', 10) >= 16).reduce((s: number, r: any) => s + (r.value || 0), 0);
        chartExpenses = [
          { label: 'Matin', value: matinExp },
          { label: 'Midi', value: midiExp },
          { label: 'Soir', value: soirExp },
        ];

        chartFinance = [
          { label: 'Matin', income: matinSales, expense: matinExp, balance: matinSales - matinExp },
          { label: 'Midi', income: midiSales, expense: midiExp, balance: midiSales - midiExp },
          { label: 'Soir', income: soirSales, expense: soirExp, balance: soirSales - soirExp },
        ];
      } else {
        // Autres périodes : agrégation par date
        const salesByDay = await queryAll<any>(
          `SELECT date, SUM(amount_paid) as value FROM sales WHERE date >= ? AND status = 'ACTIF' ${lotIn} GROUP BY date ORDER BY date`,
          [startDate, ...lotP]
        );
        const expensesByDay = await queryAll<any>(
          `SELECT date, SUM(amount) as value FROM expenses WHERE date >= ? AND status = 'ACTIF' ${farmW} GROUP BY date ORDER BY date`,
          [startDate, ...farmP]
        );
        const feedPurchasesByDay = await queryAll<any>(
          `SELECT date, SUM(total_price) as value FROM feed_purchases WHERE date >= ? AND status = 'ACTIF' ${lotIn} GROUP BY date ORDER BY date`,
          [startDate, ...lotP]
        );
        const healthPurchasesByDay = await queryAll<any>(
          `SELECT date, SUM(total_price) as value FROM health_purchases WHERE date >= ? AND status = 'ACTIF' ${lotIn} GROUP BY date ORDER BY date`,
          [startDate, ...lotP]
        );
        chartSales = salesByDay.map((r: any) => ({ day: r.date, value: r.value || 0 }));

        const dailyExpenses = new Map<string, number>();
        for (const row of [...expensesByDay, ...feedPurchasesByDay, ...healthPurchasesByDay]) {
          const day = row.date;
          const value = Number(row.value || 0);
          dailyExpenses.set(day, (dailyExpenses.get(day) || 0) + value);
        }
        chartExpenses = Array.from(dailyExpenses.entries())
          .map(([day, value]) => ({ day, value }))
          .sort((a, b) => a.day.localeCompare(b.day));

        // Fusion ventes+dépenses par jour
        const financeByDay = new Map<string, { income: number; expense: number }>();
        for (const s of chartSales) {
          const entry = financeByDay.get(s.day) || { income: 0, expense: 0 };
          entry.income = (entry.income || 0) + s.value;
          financeByDay.set(s.day, entry);
        }
        for (const e of chartExpenses) {
          const entry = financeByDay.get(e.day) || { income: 0, expense: 0 };
          entry.expense = (entry.expense || 0) + e.value;
          financeByDay.set(e.day, entry);
        }
        chartFinance = Array.from(financeByDay.entries())
          .map(([day, { income, expense }]) => ({ day, income, expense, balance: income - expense }))
          .sort((a, b) => a.day.localeCompare(b.day));
      }

      return {
        summary: {
          farms_count: farmsCount?.cnt || 0,
          lots_count: lotsCount?.cnt || 0,
          total_chickens: totalChickens?.cnt || 0,
          today_production: todayProd?.cnt || 0,
          revenues: totalRevenues?.cnt || 0,
          encaissements: totalEncaissements?.cnt || 0,
          creances: (totalRevenues?.cnt || 0) - (totalEncaissements?.cnt || 0),
          expenses: totalExpensesAmount,
          alerts_count: alertsCount?.cnt || 0,
          performance,
          total_bonuses: totalBonuses?.cnt || 0,
          employees_with_bonuses: employeesWithBonuses?.cnt || 0,
          revenue_trend: revenueTrend,
          feeding_cost: feedingCost?.cnt || 0,
          health_cost: healthCost?.cnt || 0,
          current_birds: totalChickens?.cnt || 0,
          sick_birds: currentSickBirds,
          dead_birds: deadBirds?.cnt || 0,
          recovered_birds: recoveredBirds?.cnt || 0,
          production_total: productionTotal?.cnt || 0,
          production_salable: (productionSalable?.cnt || 0) + (conversionSalable?.cnt || 0),
          production_sold: productionSold?.cnt || 0,
          production_broken: productionBroken?.cnt || 0,
          raw_material_stock: rawMaterials.reduce((s: number, m: any) => s + (m.total || 0), 0),
          raw_materials_detail: rawMaterialsDetail,
          feed_stock: preparedFeeds.reduce((s: number, m: any) => s + (m.total || 0), 0),
          prepared_feeds_detail: preparedFeedsDetail,
          feeding_consumed: feedingConsumed?.cnt || 0,
          last_distribution_date: lastDistribution?.date || null,
          health_treatments: healthTreatments?.cnt || 0,
          health_inventory: healthInventoryDetail,
        },
        charts: {
          production: chartProduction,
          feeding: chartFeeding,
          sales: chartSales,
          expenses: chartExpenses,
          finance: chartFinance,
        },
        recent_transactions: recentTransactions,
      };
    } catch (e: any) {
      console.warn('[ApiRepo] Erreur computeLocalFarmStatistics:', e?.message);
      return {
        summary: {
          farms_count: 0, lots_count: 0, total_chickens: 0, current_birds: 0,
          today_production: 0, revenues: 0, encaissements: 0, creances: 0, expenses: 0, alerts_count: 0,
          performance: 0, total_bonuses: 0, employees_with_bonuses: 0,
          revenue_trend: 0, feeding_cost: 0, health_cost: 0,
          sick_birds: 0, dead_birds: 0, recovered_birds: 0,
          production_total: 0, production_salable: 0, production_sold: 0,
          production_broken: 0, raw_material_stock: 0, raw_materials_detail: [],
          feed_stock: 0, prepared_feeds_detail: [],
          feeding_consumed: 0, last_distribution_date: null,
          health_treatments: 0, health_inventory: [],
        },
        charts: { production: [], feeding: [], sales: [], expenses: [], finance: [] },
        recent_transactions: [],
      };
    }
  }

  /**
   * Calcule le résumé de paie depuis SQLite locale (miroir du backend PayrollViewSet.summary).
   * Retourne { total_paid, count_paid, count_pending, period } pour le mois courant.
   */
  private async computeLocalPayrollSummary(): Promise<any> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

    try {
      const employees = await queryAll<any>('SELECT id FROM employees', []);
      const payrolls = await queryAll<any>(
        `SELECT * FROM payrolls WHERE status = ? AND date >= ? AND date <= ?`,
        ['ACTIF', monthStart, monthEnd]
      );
      const totalPaid = payrolls.reduce((s: number, p: any) => s + (Number(p.amount_paid) || 0), 0);
      const paidEmployeeIds = new Set(payrolls.map((p: any) => p.employee_id).filter(Boolean));
      const countPaid = paidEmployeeIds.size;
      const countPending = Math.max(0, employees.length - countPaid);

      return {
        total_paid: totalPaid,
        count_paid: countPaid,
        count_pending: countPending,
        period: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
      };
    } catch {
      return { total_paid: 0, count_paid: 0, count_pending: 0, period: '' };
    }
  }

  /**
   * Récupère le profil employé courant depuis SQLite locale
   * (miroir du backend EmployeeViewSet.me).
   * Cherche l'employee dont le user_id correspond au current user.
   */
  private async computeLocalEmployeeMe(): Promise<any | null> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return null;

      const employees = await queryAll<any>(
        `SELECT * FROM employees WHERE user_id = ? LIMIT 1`,
        [parseInt(userId)]
      );
      if (employees.length === 0) return null;

      const employee = employees[0];
      // Appliquer les normalisations FK (farm_id → farm, lots_json → lots_detail, etc.)
      const result = { ...employee };
      if (employee.farm_id && !result.farm) {
        result.farm = employee.farm_id;
      }
      // lots_json → lots_detail + lots (champ dénormalisé SQLite → attendu par l'UI)
      if (typeof employee.lots_json === 'string') {
        try {
          const parsed = JSON.parse(employee.lots_json);
          if (Array.isArray(parsed)) {
            result.lots_detail = parsed;
            // 🔧 Dashboard attend employee.lots (raw M2M ids) pour compter mes lots
            result.lots = parsed.map((l: any) => l.id);
          }
        } catch { /* ignore */ }
      }
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Calcule les statistiques employés depuis SQLite locale (miroir du backend EmployeeViewSet.stats).
   * Retourne { total, active, payroll_mass, present_today }.
   */
  private async computeLocalEmployeeStats(): Promise<any> {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    try {
      const employees = await queryAll<any>('SELECT * FROM employees', []);
      const total = employees.length;
      const active = employees.filter((e: any) => e.status === 'ACTIF').length;
      const payrollMass = employees
        .filter((e: any) => e.status === 'ACTIF')
        .reduce((s: number, e: any) => s + (Number(e.salary) || 0), 0);
      const attendances = await queryAll<any>(
        `SELECT DISTINCT employee_id FROM attendances WHERE date = ? AND status = 'PRESENT'`,
        [today]
      );
      const presentToday = attendances.length;

      return { total, active, payroll_mass: payrollMass, present_today: presentToday };
    } catch {
      return { total: 0, active: 0, payroll_mass: 0, present_today: 0 };
    }
  }

  /**
   * Calcule localement la réponse d'un endpoint « calculé » (statistiques, résumés)
   * à partir des données SQLite. Renvoie null si l'endpoint n'est pas reconnu.
   * Utilisé aussi bien hors-ligne que lorsque le serveur est injoignable alors que
   * l'appareil se croit en ligne (Internet actif mais backend KO).
   */
  private async computeLocalComputedResponse<T>(endpoint: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T> | null> {
    try {
      const endpointId = getEndpointId(endpoint);

      // /farms/statistics/ (niveau collection, pas d'ID)
      if (endpoint.includes('/farms/statistics') && typeof endpointId !== 'number') {
        const params = this.resolveParams(endpoint, config);
        const period = params.period as string | undefined;
        const farmId = params.farm ? Number(params.farm) : undefined;
        const lotId = params.lot ? Number(params.lot) : undefined;
        const farmStats = await this.computeLocalFarmStatistics(period, farmId, lotId);
        console.info(`[ApiRepo] Statistiques ferme calculées localement pour ${endpoint}`);
        return buildLocalResponse<T>(farmStats as unknown as T);
      }

      // /lots/{id}/statistics/ (avec ID)
      if (endpoint.includes('/statistics') && typeof endpointId === 'number') {
        const lotStats = await this.computeLocalLotStatistics(endpointId);
        console.info(`[ApiRepo] Statistiques lot calculées localement pour ${endpoint}`);
        return buildLocalResponse<T>(lotStats as unknown as T);
      }

      // /payrolls/summary/ — résumé de paie
      if (endpoint.includes('/payrolls/summary')) {
        const summary = await this.computeLocalPayrollSummary();
        return buildLocalResponse<T>(summary as unknown as T);
      }
      // /employees/stats/ — statistiques employés
      if (endpoint.includes('/employees/stats')) {
        const stats = await this.computeLocalEmployeeStats();
        return buildLocalResponse<T>(stats as unknown as T);
      }
      // /employees/me/ — profil employé courant
      if (endpoint.includes('/employees/me')) {
        const meData = await this.computeLocalEmployeeMe();
        if (meData !== null) return buildLocalResponse<T>(meData as unknown as T);
        return buildLocalResponse<T>({ detail: 'Non trouvé.' } as unknown as T);
      }
    } catch (e: any) {
      console.warn(`[ApiRepo] Échec calcul local pour ${endpoint}:`, e?.message || e);
    }
    return null;
  }

  async get<T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const syncable = this.isSyncable(endpoint) && !this.isComputedEndpoint(endpoint);

    // Les IDs négatifs sont des créations offline — ils n'existent pas côté serveur.
    // On les sert directement depuis SQLite sans tenter l'API.
    const endpointId = getEndpointId(endpoint);
    const hasNegativeId = typeof endpointId === 'number' && endpointId < 0;

    // Tout endpoint avec un ID négatif → local uniquement (n'existe pas côté serveur)
    if (hasNegativeId && syncable) {
      try {
        const localData = await getLocalData<T>(endpoint, config?.params as Record<string, any> | undefined);
        if (localData !== null) return buildLocalResponse<T>(localData);
      } catch {}
      return buildLocalResponse<T>([] as unknown as T);
    }

    // 🔧 FINDING 1 — Endpoints « calculés » (statistiques, résumés) : ils n'ont pas
    // de table SQLite directe et n'étaient traités qu'en mode strictement hors-ligne.
    // Quand l'Internet est actif mais le serveur injoignable, `isOnline()` renvoie
    // `true` : l'ancien code tombait alors sur `apiClient.get()` en fin de méthode et
    // levait une erreur réseau (→ écrans avec stats à 0 et `purchase_date` = now()).
    // On tente désormais l'API en ligne PUIS on retombe systématiquement sur le
    // calcul local dès que le serveur ne répond pas.
    if (this.isComputedEndpoint(endpoint) && this.isSyncable(endpoint) && !hasNegativeId) {
      if (await this.isOnline()) {
        try {
          return await apiClient.get<T>(endpoint, config);
        } catch (apiError: any) {
          console.warn(`[ApiRepo] Endpoint calculé ${endpoint} : serveur injoignable, calcul local.`, apiError?.message || apiError);
          const local = await this.computeLocalComputedResponse<T>(endpoint, config);
          if (local) return local;
          throw apiError;
        }
      }
      const local = await this.computeLocalComputedResponse<T>(endpoint, config);
      if (local) return local;
      return buildLocalResponse<T>([] as unknown as T);
    }

    // En ligne : essayer l'API en premier pour obtenir les données les plus récentes
    // (sauf si l'ID est négatif — création offline)
    if (syncable && (await this.isOnline())) {
      try {
        const response = await apiClient.get<T>(endpoint, config);
        // Persister immédiatement dans SQLite pour le prochain accès hors-ligne
        const tableName = getTableNameFromEndpoint(endpoint);
        if (tableName && response.data) {
          const items = Array.isArray(response.data) ? response.data : [response.data];
          for (const item of items) {
            await syncManager.persistRemoteItem(tableName, item).catch(() => {});
          }
        }

        // 🔧 Fusionner les items locaux non-synchronisés avec la réponse API
        // pour que les créations offline soient visibles même quand le serveur
        // ne les a pas encore (sync pas encore effectuée ou en cours)
        if (tableName && typeof endpointId !== 'number') {
          // Endpoint collection (liste) — on merge
          try {
            let localUnsynced = await queryAll<any>(
              `SELECT * FROM ${tableName} WHERE (_needs_sync = 1 OR id < 0)`,
              []
            );
            // 🔒 Le merge de la réponse API avec les items locaux non-synchronisés
            // doit respecter les filtres demandés (ex: ?sale=10). Sans cela, des
            // paiements d'AUTRES ventes (créés offline) étaient injectés dans
            // l'historique d'une vente ciblée — mélange de créances.
            const params = (config?.params || {}) as Record<string, any>;
            const paramKeys = Object.keys(params).filter(
              (k) => params[k] !== undefined && params[k] !== null && params[k] !== ''
            );
            if (paramKeys.length > 0) {
              localUnsynced = localUnsynced.filter((item: any) =>
                paramKeys.every((k) => Number(item[k] ?? item[k + '_id']) === Number(params[k]))
              );
            }
            if (localUnsynced.length > 0) {
              const merged = mergeApiWithLocal(response.data, localUnsynced);
              return {
                ...response,
                data: merged as unknown as T,
                config: response.config,
                headers: response.headers,
                status: response.status,
                statusText: response.statusText,
              };
            }
          } catch { /* best-effort merge */ }
        }

        return response;
      } catch (apiError: any) {
        // API échoue (401, 500, réseau...) → fallback local
        console.warn(`[ApiRepo] API GET failed for ${endpoint}, trying local:`, apiError?.message || apiError);
        // 🔧 Même en ligne si l'API échoue, servir les données locales (inclut les items offline).
        // NB : les endpoints « calculés » sont interceptés plus haut (voir FINDING 1).
        if (syncable) {
          try {
            const localData = await getLocalData<T>(endpoint, config?.params as Record<string, any> | undefined);
            if (localData !== null) {
              console.info(`[ApiRepo] Serving local data for ${endpoint} (API failed)`);
              return buildLocalResponse<T>(localData);
            }
          } catch {}
        }
      }
    }

    // Hors-ligne ou API échouée : utiliser les données locales
    if (syncable) {
      try {
        const localData = await getLocalData<T>(endpoint, config?.params as Record<string, any> | undefined);
        if (localData !== null) {
          console.info(`[ApiRepo] Serving local data for ${endpoint}`);
          return buildLocalResponse<T>(localData);
        }
      } catch (dbError: any) {
        console.warn(`[ApiRepo] Local SQLite access failed for ${endpoint}:`, dbError?.message || dbError);
      }

      // Hors-ligne + pas de données locales → retourner tableau vide
      if (!(await this.isOnline())) {
        console.info(`[ApiRepo] Offline — no local data for ${endpoint}, returning empty.`);
        return buildLocalResponse<T>([] as unknown as T);
      }
    }

    // Computed endpoints (ex: /farms/statistics/, /lots/{id}/statistics/) en mode offline
    // → agrège les données SQLite locales pour refléter les actions hors-ligne
    if (!hasNegativeId && this.isComputedEndpoint(endpoint) && !(await this.isOnline())) {
      // /farms/statistics/ (niveau collection, pas d'ID)
      if ((endpoint.includes('/farms/statistics') || endpoint.includes('/farms/statistics/')) && typeof endpointId !== 'number') {
        const params = this.resolveParams(endpoint, config);
        const period = params.period as string | undefined;
        const farmId = params.farm ? Number(params.farm) : undefined;
        const lotId = params.lot ? Number(params.lot) : undefined;
        const farmStats = await this.computeLocalFarmStatistics(period, farmId, lotId);
        return buildLocalResponse<T>(farmStats as unknown as T);
      }

      // /lots/{id}/statistics/ (avec ID)
      if (endpoint.includes('/statistics') && typeof endpointId === 'number') {
        const lotStats = await this.computeLocalLotStatistics(endpointId);
        return buildLocalResponse<T>(lotStats as unknown as T);
      }

      // 🔧 /payrolls/summary/ — résumé de paie offline
      if (endpoint.includes('/payrolls/summary')) {
        const summary = await this.computeLocalPayrollSummary();
        return buildLocalResponse<T>(summary as unknown as T);
      }
      // 🔧 /employees/stats/ — statistiques employés offline
      if (endpoint.includes('/employees/stats')) {
        const stats = await this.computeLocalEmployeeStats();
        return buildLocalResponse<T>(stats as unknown as T);
      }
      // 🔧 /employees/me/ — profil employé courant offline
      if (endpoint.includes('/employees/me')) {
        const meData = await this.computeLocalEmployeeMe();
        if (meData !== null) {
          return buildLocalResponse<T>(meData as unknown as T);
        }
        return buildLocalResponse<T>({ detail: "Non trouvé." } as unknown as T);
      }

      // Pour les autres computed endpoints offline → réponse vide
      return buildLocalResponse<T>([] as unknown as T);
    }

    // Les computed endpoints avec ID négatif → agréger les données locales
    if (hasNegativeId) {
      if (endpoint.includes('/statistics')) {
        const tableName = getTableNameFromEndpoint(endpoint);
        if (tableName === 'lots' && typeof endpointId === 'number') {
          const lotStats = await this.computeLocalLotStatistics(endpointId);
          return buildLocalResponse<T>(lotStats as unknown as T);
        }
        // Fallback vide pour les autres ressources
        return buildLocalResponse<T>([] as unknown as T);
      }
      return buildLocalResponse<T>([] as unknown as T);
    }

    // Fallback final : appel réseau même si non syncable ou si tout a échoué
    // 🔧 Si /employees/me/ échoue alors qu'on est en ligne, tenter le fallback SQLite
    if (endpoint.includes('/employees/me')) {
      try {
        const meData = await this.computeLocalEmployeeMe();
        if (meData !== null) {
          return buildLocalResponse<T>(meData as unknown as T);
        }
      } catch { /* fallback impossible */ }
    }
    return apiClient.get<T>(endpoint, config);
  }

  async post<T = any>(endpoint: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.isSyncable(endpoint)) {
      if (!(await this.isOnline())) {
        try {
          const row = await handleOfflineWrite<T>('POST', endpoint, body);
          return buildLocalResponse<T>(row);
        } catch (offlineError: any) {
          console.error('[ApiRepo] Offline write failed:', offlineError?.message || offlineError);
          throw offlineError;
        }
      }

      try {
        const response = await apiClient.post<T>(endpoint, body, config);
        const tableName = getTableNameFromEndpoint(endpoint);
        if (tableName && response.data) {
          await syncManager.persistRemoteItem(tableName, response.data).catch(() => {});
        }
        // Si l'endpoint a une action (ex: /health-alerts/27/mark_as_viewed/),
        // on ne peut pas GET dessus → puller le endpoint parent à la place
        if (this.isComputedEndpoint(endpoint)) {
          syncManager.pullEndpoint(this.getParentEndpoint(endpoint)).catch(() => undefined);
        } else {
          syncManager.pullEndpoint(endpoint).catch(() => undefined);
        }
        return response;
      } catch (error: any) {
        // Basculer en Offline-First UNIQUEMENT si le serveur n'a pas répondu
        // (réseau coupé / timeout). Une réponse HTTP du serveur — 4xx comme 5xx —
        // signifie que le backend a traité et REFUSÉ l'opération : on ne doit pas
        // fabriquer un faux succès local (risque de divergence SQLite ↔ MySQL).
        if (!error.response) {
          try {
            const row = await handleOfflineWrite<T>('POST', endpoint, body);
            return buildLocalResponse<T>(row);
          } catch (offlineFallbackError: any) {
            // 🔧 FINDING 2 — Ne PAS relancer l'erreur réseau : elle masquerait la
            // vraie cause (validation métier, contrainte SQLite…) derrière un
            // trompeur « Impossible de contacter le serveur ».
            console.error('[ApiRepo] Offline fallback write failed:', offlineFallbackError?.message);
            throw offlineFallbackError;
          }
        }
        throw error;
      }
    }

    if (!(await this.isOnline())) {
      throw new Error("Cette action nécessite une connexion internet active.");
    }

    return apiClient.post<T>(endpoint, body, config);
  }

  async put<T = any>(endpoint: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.isSyncable(endpoint)) {
      if (!(await this.isOnline())) {
        try {
          const row = await handleOfflineWrite<T>('PUT', endpoint, body);
          return buildLocalResponse<T>(row);
        } catch (offlineError: any) {
          console.error('[ApiRepo] Offline write failed:', offlineError?.message || offlineError);
          throw offlineError;
        }
      }

      try {
        const response = await apiClient.put<T>(endpoint, body, config);
        const tableName = getTableNameFromEndpoint(endpoint);
        if (tableName && response.data) {
          await syncManager.persistRemoteItem(tableName, response.data).catch(() => {});
        }
        if (this.isComputedEndpoint(endpoint)) {
          syncManager.pullEndpoint(this.getParentEndpoint(endpoint)).catch(() => undefined);
        } else {
          syncManager.pullEndpoint(endpoint).catch(() => undefined);
        }
        return response;
      } catch (error: any) {
        // Voir commentaire dans post() : fallback Offline uniquement si aucune
        // réponse serveur. Un refus HTTP (4xx/5xx) ne doit pas devenir un faux succès.
        if (!error.response) {
          try {
            const row = await handleOfflineWrite<T>('PUT', endpoint, body);
            return buildLocalResponse<T>(row);
          } catch (offlineFallbackError: any) {
            // 🔧 FINDING 2 — propager la vraie erreur offline, pas l'erreur réseau.
            console.error('[ApiRepo] Offline fallback write failed:', offlineFallbackError?.message);
            throw offlineFallbackError;
          }
        }
        throw error;
      }
    }

    if (!(await this.isOnline())) {
      throw new Error("Cette action nécessite une connexion internet active.");
    }

    return apiClient.put<T>(endpoint, body, config);
  }

  async patch<T = any>(endpoint: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.isSyncable(endpoint)) {
      if (!(await this.isOnline())) {
        const row = await handleOfflineWrite<T>('PATCH', endpoint, body);
        return buildLocalResponse<T>(row);
      }

      try {
        const response = await apiClient.patch<T>(endpoint, body, config);
        if (this.isComputedEndpoint(endpoint)) {
          syncManager.pullEndpoint(this.getParentEndpoint(endpoint)).catch(() => undefined);
        } else {
          syncManager.pullEndpoint(endpoint).catch(() => undefined);
        }
        return response;
      } catch (error: any) {
        // Voir commentaire dans post() : fallback Offline uniquement si aucune
        // réponse serveur. Un refus HTTP (4xx/5xx) ne doit pas devenir un faux succès.
        if (!error.response) {
          const row = await handleOfflineWrite<T>('PATCH', endpoint, body);
          return buildLocalResponse<T>(row);
        }
        throw error;
      }
    }

    if (!(await this.isOnline())) {
      throw new Error("Cette action nécessite une connexion internet active.");
    }

    return apiClient.patch<T>(endpoint, body, config);
  }

  async delete<T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.isSyncable(endpoint)) {
      if (!(await this.isOnline())) {
        const row = await handleOfflineWrite<T>('DELETE', endpoint, null);
        return buildLocalResponse<T>(row);
      }

      try {
        const response = await apiClient.delete<T>(endpoint, config);
        // 1. Miroir SQLite local — « annuler » ne doit jamais « supprimer ».
        //    Pour les tables annulables (ventes, tâches…), le serveur a réalisé
        //    un soft-delete (status='ANNULEE') : on reflète cet état localement
        //    au lieu de détruire physiquement la ligne (sinon la vente disparaît
        //    temporairement de l'historique et définitivement si le pull échoue).
        const tableName = getTableNameFromEndpoint(endpoint);
        const id = getEndpointId(endpoint);
        if (tableName && typeof id === 'number' && id > 0) {
          try {
            if (CANCELLABLE_TABLES.has(tableName)) {
              const current = await fetchRow<any>(tableName, 'id = ?', [id]);
              if (current) {
                await updateRow(tableName, id, {
                  ...current,
                  status: 'ANNULEE',
                  _needs_sync: 0,
                  updated_at: new Date().toISOString(),
                });
              }
            } else {
              await deleteRow(tableName, id);
            }
          } catch { /* silencieux — le pullEndpoint ci-dessous nettoiera */ }
        }
        // 2. Puller le endpoint parent (liste) pour rafraîchir le miroir SQLite
        syncManager.pullEndpoint(this.getParentEndpoint(endpoint)).catch(() => undefined);
        return response;
      } catch (error: any) {
        // 🔧 404 = déjà supprimé côté serveur. Succès fonctionnel : nettoyer localement.
        if (error.response?.status === 404) {
          const tableName = getTableNameFromEndpoint(endpoint);
          const id = getEndpointId(endpoint);
          if (tableName && typeof id === 'number') {
            try { await deleteRow(tableName, id); } catch {}
          }
          console.info(`[ApiRepo] DELETE ${endpoint} → 404 (déjà supprimé), nettoyage local`);
          return buildLocalResponse<T>({} as unknown as T);
        }
        // 400 = peut être une erreur métier (stock) ou déjà annulé.
        if (error.response?.status === 400) {
          const detail = error.response?.data?.detail || '';
          if (typeof detail === 'string' && (detail.toLowerCase().includes('déjà annulé') || detail.toLowerCase().includes('deja annule'))) {
            console.info(`[ApiRepo] DELETE ${endpoint} → 400 (déjà annulé), considéré comme succès`);
            return buildLocalResponse<T>({} as unknown as T);
          }
          // Si c'est une autre erreur 400 (ex: "Impossible d'annuler cette vente..."), on doit la jeter !
          throw error;
        }
        if (!error.response) {
          const row = await handleOfflineWrite<T>('DELETE', endpoint, null);
          return buildLocalResponse<T>(row);
        }
        throw error;
      }
    }

    if (!(await this.isOnline())) {
      throw new Error("Cette action nécessite une connexion internet active.");
    }

    return apiClient.delete<T>(endpoint, config);
  }

  async fetchAll<T = any>(endpoint: string): Promise<T[]> {
    const syncable = this.isSyncable(endpoint);
    if (syncable) {
      const isOnline = await this.isOnline();
      if (isOnline) {
        try {
          const results = await fetchAll(endpoint) as T[];
          // Persister dans le cache local pour le prochain accès hors-ligne
          const tableName = getTableNameFromEndpoint(endpoint);
          if (tableName && Array.isArray(results)) {
            for (const row of results) {
              await syncManager.persistRemoteItem(tableName, row).catch(() => {});
            }
          }
          return results;
        } catch (apiError: any) {
          console.warn(`[ApiRepo] fetchAll API failed for ${endpoint}, falling back to local:`, apiError?.message || apiError);
        }
      }
      // Hors-ligne ou API échouée → utiliser le cache local
      try {
        const localData = await getLocalData<T[]>(endpoint);
        if (Array.isArray(localData)) {
          console.info(`[ApiRepo] Serving local fetchAll for ${endpoint} (${localData.length} items)`);
          return localData;
        }
      } catch (dbError: any) {
        console.warn(`[ApiRepo] Local SQLite access failed for fetchAll ${endpoint}:`, dbError?.message || dbError);
      }
      // Hors-ligne sans cache → retourner vide
      if (!isOnline) {
        return [] as T[];
      }
    }
    return fetchAll(endpoint) as Promise<T[]>;
  }
}
