import { AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteRow,
  deleteSyncQueueItem,
  enqueueSyncQueue,
  fetchRow,
  fetchRows,
  getNextOfflineId,
  getServerIdForLocalId,
  getSyncQueueItemByLocalId,
  getTableInfo,
  insertRow,
  insertOrReplaceRow,
  queryAll,
  runInTransaction,
  runSqlAsync,
  updateRow,
  updateSyncQueueItem,
} from '../../database/localDatabase';
import { emitDataChange } from '../../utils/dataEvents';
import { ENDPOINT_TABLE_MAP, mapForeignKeyFields } from '../../utils/offlineSyncUtils';

// Paramètres API qui ne correspondent PAS à des colonnes SQLite
// (agrégation, pagination, filtrage côté serveur uniquement)
const NON_COLUMN_PARAMS = new Set([
  'period', 'include_archived', 'include_archived_farms',
  'ordering', 'search', 'page', 'page_size', 'limit',
  'format', 'export',
]);

const localResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as any,
  request: {} as any,
});

const normalizeEndpoint = (endpoint: string): string => {
  return endpoint.replace(/\s+/g, '').replace(/\/+/g, '/');
};

const parseEndpoint = (endpoint: string, configParams?: Record<string, any>) => {
  const normalized = normalizeEndpoint(endpoint);
  const [pathPart, queryPart] = normalized.split('?');
  const rawPath = pathPart.replace(/^\//, '').replace(/\/$/, '');
  const pathSegments = rawPath ? rawPath.split('/') : [];

  const queryParams: Record<string, any> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
  }
  if (configParams) {
    if (configParams.params) {
      Object.assign(queryParams, configParams.params);
    } else {
      Object.assign(queryParams, configParams);
    }
  }

  const result: { tableName?: string; id?: number; action?: string; params: Record<string, any> } = {
    params: queryParams,
  };

  if (pathSegments.length >= 1) {
    result.tableName = ENDPOINT_TABLE_MAP[pathSegments[0]];
  }

  // Détection de l'ID et de l'action
  if (pathSegments.length >= 2) {
    if (/^-?\d+$/.test(pathSegments[1])) {
      // Pattern: /resource/{id}/ ou /resource/{id}/action/
      result.id = Number(pathSegments[1]);
      if (pathSegments.length > 2) {
        result.action = pathSegments.slice(2).join('/');
      }
    } else {
      // Pattern: /resource/action/ (pas d'ID, action directement)
      // Ex: /attendances/clock_in/, /attendances/clock_out/
      result.action = pathSegments.slice(1).join('/');
    }
  }

  return result;
};

/**
 * Construit une clause WHERE SQLite à partir des paramètres de requête API.
 * Utilise les colonnes réelles de la table (via getTableInfo) pour mapper
 * les noms FK Django (ex: 'farm') vers les colonnes SQLite (ex: 'farm_id').
 */
const buildWhereClause = async (tableName: string, params: Record<string, any>) => {
  const conditions: string[] = [];
  const values: any[] = [];
  let limitClause = '';

  // Obtenir les colonnes réelles de la table pour le mapping FK
  let columnNames = new Set<string>();
  try {
    const columns = await getTableInfo(tableName);
    columnNames = new Set(columns.map(c => c.name));
  } catch { /* table inexistante, on continue sans mapping */ }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'limit') {
      const limit = parseInt(String(value), 10);
      if (!Number.isNaN(limit)) limitClause = ` LIMIT ${limit}`;
      continue;
    }

    // Ignorer les paramètres d'agrégation/pagination qui n'ont pas de colonne SQLite
    if (NON_COLUMN_PARAMS.has(key)) continue;

    // Résoudre le nom de colonne : d'abord chercher la colonne exacte,
    // puis le mapping FK (farm → farm_id si la table a farm_id mais pas farm)
    let column = key;
    if (!columnNames.has(key)) {
      const idKey = key + '_id';
      if (columnNames.has(idKey)) {
        column = idKey;
      } else {
        // La colonne n'existe ni avec ni sans _id → paramètre non filtrable localement.
        // On le saute (ex: ?farm=51 sur feed_inventory qui n'a que lot_id).
        // Le filtrage exact se fera côté serveur lors de la synchro.
        continue;
      }
    }

    // Si la valeur est une string contenant des virgules (ex: '1,2,3' depuis URL params),
    // la traiter comme un IN pour supporter les multi-valeurs
    const strValue = String(value);
    if (typeof value === 'string' && strValue.includes(',')) {
      const ids = strValue.split(',').map((s: string) => {
        const n = Number(s.trim());
        return Number.isNaN(n) ? s.trim() : n;
      });
      const placeholders = ids.map(() => '?').join(', ');
      conditions.push(`${column} IN (${placeholders})`);
      values.push(...ids);
    } else if (Array.isArray(value)) {
      const placeholders = value.map(() => '?').join(', ');
      conditions.push(`${column} IN (${placeholders})`);
      values.push(...value);
    } else {
      // Tenter de convertir en nombre si c'est une chaîne purement numérique
      // (important pour les IDs négatifs venant des query params)
      let finalValue = value;
      if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        finalValue = Number(value);
      }
      conditions.push(`${column} = ?`);
      values.push(finalValue);
    }
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  return { where, values, limitClause };
};

/**
 * Normalise les colonnes SQLite (_id) vers les noms de champ Django attendus par l'UI.
 * Ex: {farm_id: 51, lot_id: 48} → {farm: 51, farm_id: 51, lot: 48, lot_id: 48}
 * Sans cela, les filtres JS comme `l.farm === farmId` échouent sur les données locales.
 */
const normalizeFkFields = (row: any): any => {
  if (!row || typeof row !== 'object') return row;
  const result = { ...row };
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('_id') && value !== null && value !== undefined) {
      const baseKey = key.replace(/_id$/, '');
      if (!(baseKey in result)) {
        result[baseKey] = value;
      }
    }
  }
  // 🔧 Convertir lots_json (colonne SQLite) → lots_detail + lots (attendu par l'UI)
  if (typeof result.lots_json === 'string') {
    try {
      const parsed = JSON.parse(result.lots_json);
      if (Array.isArray(parsed)) {
        if (!result.lots_detail) result.lots_detail = parsed;
        // 🔧 lots (raw M2M ids) attendu par Dashboard -> lots.length
        if (!result.lots) {
          result.lots = parsed.map((l: any) => l.id);
        }
      }
    } catch { /* ignore parse error */ }
  }
  // 🔧 Convertir last_bonus_json → last_bonus (attendu par l'UI)
  if (typeof result.last_bonus_json === 'string' && !result.last_bonus) {
    try {
      result.last_bonus = JSON.parse(result.last_bonus_json);
    } catch { /* ignore parse error */ }
  }
  // 🔧 Normaliser les valeurs de statut entre le backend (FR: 'ACTIF')
  // et les anciennes valeurs locales ('ACTIVE'). On unifie en 'ACTIF' ici.
  if (typeof result.status === 'string') {
    const up = result.status.toUpperCase();
    if (up === 'ACTIVE') result.status = 'ACTIF';
  }
  return result;
};

export const getLocalData = async <T>(endpoint: string, configParams?: Record<string, any>): Promise<T | null> => {
  const parsed = parseEndpoint(endpoint, configParams);
  const { tableName, id, params } = parsed;
  if (!tableName) return null;

  if (typeof id === 'number') {
    const row = await fetchRow<T>(tableName, 'id = ?', [id]);
    // Normaliser les FK : SQLite stocke farm_id → l'UI attend farm (nom Django)
    return normalizeFkFields(row) as T | null;
  }

  const { where, values, limitClause } = await buildWhereClause(tableName, params);
  
  let sql = `SELECT * FROM ${tableName} WHERE ${where}`;
  // 🔧 Filter out empty stocks for inventories (unless include_zero=true is passed)
  if (tableName === 'feed_inventory' || tableName === 'prepared_feed_inventory') {
    if (String(params.include_zero).toLowerCase() !== 'true') {
      sql += ` AND quantity_kg > 0`;
    }
  } else if (tableName === 'health_inventory') {
    if (String(params.include_zero).toLowerCase() !== 'true') {
      sql += ` AND quantity > 0`;
    }
  }

  // 🔧 ORDER BY id DESC pour que les enregistrements les plus récents apparaissent en premier.
  sql += ` ORDER BY id DESC${limitClause}`;
  const rows = await queryAll<T>(sql, values);
  // Normaliser les FK pour chaque ligne
  return rows.map((r: any) => normalizeFkFields(r)) as unknown as T;
};

// Reverse mapping: table_name → API resource name (path segment)
const TABLE_TO_RESOURCE: Record<string, string> = {};
for (const [resource, table] of Object.entries(ENDPOINT_TABLE_MAP)) {
  TABLE_TO_RESOURCE[table] = resource;
}

const normalizeEndpointForSync = (endpoint: string, tableName?: string, localId?: number): string => {
  if (!tableName || typeof localId !== 'number') return endpoint;
  // Utiliser le nom de ressource API (ex: 'movements'), pas le nom de table SQLite (ex: 'chicken_movements')
  const apiResource = TABLE_TO_RESOURCE[tableName] || tableName.replace(/_/g, '-');
  const normalized = normalizeEndpoint(endpoint);
  const pattern = new RegExp(`(/${apiResource}/)-?\\d+(/|$)`);
  if (pattern.test(normalized)) {
    return normalized.replace(pattern, `$1${localId}$2`);
  }
  return normalized;
};

const replaceLocalIdInEndpoint = async (endpoint: string, tableName: string, localId: number) => {
  const serverId = await getServerIdForLocalId(localId, tableName);
  if (!serverId) return endpoint;
  const normalized = normalizeEndpoint(endpoint);
  return normalized.replace(new RegExp(`/${localId}(/|$)`), `/${serverId}$1`);
};

const actionStatusMap: Record<string, Record<string, any>> = {
  archive: { status: 'ARCHIVE' },
  // Use French status tokens consistent with Django ('ACTIF')
  reactivate: { status: 'ACTIF' },
  complete: { status: 'COMPLETED' },
  mark_as_viewed: { is_viewed: 1 },
  approve: { status: 'APPROVED' },
  reject: { status: 'REJECTED' },
};

const deactivateLotRemindersLocally = async (lotId: number): Promise<void> => {
  try {
    const reminders = await queryAll<any>(
      `SELECT id FROM reminders WHERE lot_id = ? AND status = 'PENDING'`,
      [lotId]
    );
    const todayIso = new Date().toISOString();
    for (const r of reminders) {
      await updateRow('reminders', r.id, { status: 'INACTIVE', _needs_sync: 1, updated_at: todayIso });
    }
    if (reminders.length > 0) {
      console.info(`[Offline] ${reminders.length} rappel(s) désactivé(s) pour le lot #${lotId}`);
    }
  } catch (e: any) {
    console.warn(`[Offline] Impossible de désactiver les rappels du lot #${lotId}:`, e?.message);
  }
};

const applyActionLocally = async (tableName: string, id: number | undefined, action?: string, data?: any): Promise<void> => {
  if (!action) return;

  // --- Actions simples : mise à jour de statut ---
  const updates = actionStatusMap[action];
  if (updates && typeof id === 'number') {
    const current = await fetchRow<any>(tableName, 'id = ?', [id]);
    if (!current) return;

    // 🔧 Point 6 : Validation réactivation lot — interdit si la ferme est archivée
    if (tableName === 'lots' && action === 'reactivate') {
      try {
        const farm = await fetchRow<any>('farms', 'id = ?', [current.farm_id]);
        if (farm && farm.status === 'ARCHIVE') {
          throw new Error('Impossible de réactiver ce lot car sa ferme est archivée. Réactivez d\'abord la ferme.');
        }
      } catch (e) {
        // Propagate validation error
        if (e instanceof Error && e.message.includes('Impossible de réactiver ce lot')) throw e;
      }

      // Interdit si aucune poule vivante
      const qty = Number(current.current_quantity || 0);
      if (qty <= 0) {
        throw new Error(
          `Impossible de réactiver ce lot : il n'a plus de poules vivantes. Veuillez d'abord ajouter des sujets via un mouvement d'ajout.`
        );
      }
    }

    await updateRow(tableName, id, { ...current, ...updates, _needs_sync: 1, updated_at: new Date().toISOString() });

    // 🔧 Point 5 : Effets de bord d'archivage du lot (miroir du signal Django)
    if (tableName === 'lots' && action === 'archive') {
      const now = new Date();
      const todayIso = now.toISOString();

      // Désactiver les rappels liés à ce lot (miroir du signal Django)
      await deactivateLotRemindersLocally(id);

      // Retirer le lot du lots_json des employés assignés (miroir de lot.employees.clear())
      try {
        const employees = await queryAll<any>(
          `SELECT id, lots_json FROM employees WHERE lots_json IS NOT NULL AND lots_json != '[]'`,
          []
        );
        for (const emp of employees) {
          try {
            const lotsList: any[] = JSON.parse(emp.lots_json || '[]');
            const filtered = lotsList.filter((l: any) => l.id !== id && l !== id);
            if (filtered.length !== lotsList.length) {
              await updateRow('employees', emp.id, {
                ...emp,
                lots_json: JSON.stringify(filtered),
                _needs_sync: 1,
                updated_at: todayIso,
              });
            }
          } catch { /* ignore parsing error for this employee */ }
        }
      } catch (e: any) {
        console.warn(`[Offline] Impossible de nettoyer lots_json employés pour lot #${id}:`, e?.message);
      }
    }

    // 🔧 Effets de bord d'archivage/réactivation d'un employé (miroir du signal Django pour User)
    if (tableName === 'employees' && (action === 'archive' || action === 'reactivate')) {
      const isActive = action === 'reactivate' ? 1 : 0;
      if (current.user_id) {
        try {
          const user = await fetchRow<any>('users', 'id = ?', [current.user_id]);
          if (user) {
            await updateRow('users', user.id, {
              ...user,
              is_active: isActive,
              _needs_sync: 1,
              updated_at: new Date().toISOString()
            });
          }
        } catch (e: any) {
          console.warn(`[Offline] Impossible de mettre à jour is_active du user pour employee #${id}:`, e?.message);
        }
      }
    }

    return;
  }

  // --- Actions complexes ---

  // clock_in: Crée ou met à jour un pointage d'arrivée pour aujourd'hui
  if (action === 'clock_in') {
    // Résoudre les FK avec les deux formes possibles (formulaire envoie 'lot', SQLite a 'lot_id')
    const lot_id = data?.lot_id || data?.lot;
    const employee_id = data?.employee_id || data?.employee;
    if (!lot_id) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 8);
    const rows = await queryAll<any>(
      `SELECT * FROM attendances WHERE date = ? AND lot_id = ? LIMIT 1`,
      [today, lot_id]
    );
    if (rows.length > 0 && !rows[0].clock_in) {
      const attendance = rows[0];
      await updateRow(tableName, attendance.id, {
        ...attendance,
        clock_in: timeStr,
        _needs_sync: 1,
        updated_at: now.toISOString(),
      });
    } else if (rows.length === 0) {
      const localId = await getNextOfflineId();
      let row: Record<string, any> = {
        id: localId,
        employee_id: employee_id || 0,
        lot_id,
        date: today,
        clock_in: timeStr,
        status: 'PRESENT',
        _needs_sync: 1,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      // Mapper les FK pour être sûr que les bons noms de colonnes sont utilisés
      try {
        const cols = await getTableInfo(tableName);
        row = mapForeignKeyFields(new Set(cols.map(c => c.name)), row);
      } catch { /* continue */ }
      await insertRow(tableName, row);
    }
    return;
  }

  // clock_out: Met à jour le pointage d'aujourd'hui avec l'heure de départ
  if (action === 'clock_out') {
    // Résoudre les FK avec les deux formes possibles
    const lot_id = data?.lot_id || data?.lot;
    if (!lot_id) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 8);
    const rows = await queryAll<any>(
      `SELECT * FROM attendances WHERE date = ? AND lot_id = ? LIMIT 1`,
      [today, lot_id]
    );
    if (rows.length > 0 && !rows[0].clock_out) {
      const attendance = rows[0];
      await updateRow(tableName, attendance.id, {
        ...attendance,
        clock_out: timeStr,
        _needs_sync: 1,
        updated_at: now.toISOString(),
      });
    }
    return;
  }

  // 🔧 convert_to_vendable (DÉSACTIVÉ — miroir du backend).
  // L'ancienne implémentation mutait directement casiers_vendables de la production,
  // risquant un double comptage avec le système officiel egg_conversions.
  // Désormais refusé : on lève une erreur qui redirige vers /egg-conversions/.
  if (action === 'convert_to_vendable') {
    throw new Error("Cet endpoint de conversion est obsolète. Utilisez POST /egg-conversions/ pour rendre des casiers vendables.");
  }
};

// --- Validations métier pour le mode offline ---

/**
 * Vérifie que la création d'un lot ne dépasse pas la capacité de la ferme.
 * Utilise les données SQLite locales (fonctionne offline).
 */
export const validateFarmCapacity = async (data?: any, existingLotId?: number): Promise<void> => {
  if (!data) return;
  // Accepter les deux formes de FK (formulaire envoie 'farm', SQLite a 'farm_id')
  const farmId = data.farm || data.farm_id;
  const quantity = Number(data.current_quantity || data.initial_quantity || 0);
  if (typeof farmId !== 'number' || quantity <= 0) return;

  try {
    const farm = await fetchRow<any>('farms', 'id = ?', [farmId]);
    if (!farm || !farm.capacity || farm.capacity <= 0) return; // Pas de limite configurée
    const capacity = Number(farm.capacity);

    const activeLots = await queryAll<any>(
      `SELECT id, COALESCE(current_quantity, 0) as qty FROM lots WHERE farm_id = ? AND status = 'ACTIF'`,
      [farmId]
    );
    const currentTotal = activeLots.reduce((sum: number, lot: any) => {
      if (existingLotId && lot.id === existingLotId) return sum;
      return sum + lot.qty;
    }, 0);

    if (currentTotal + quantity > capacity) {
      throw new Error(
        `Capacité ferme dépassée : ${currentTotal} poules existantes + ${quantity} = ${currentTotal + quantity} > capacité ${capacity}.`
      );
    }
  } catch (e: any) {
    // Relayer l'erreur de capacité ; ignorer les autres (ferme pas encore sync, etc.)
    if (e.message?.includes('Capacité ferme dépassée')) throw e;
  }
};

const LOT_DEPENDENT_TABLES = [
  'lots', 'productions', 'sales', 'feeds', 'health_records',
  'chicken_movements', 'feed_inventory', 'health_inventory',
  'prepared_feed_inventory', 'feed_preparations', 'feed_preparation_ingredients',
  'attendances', 'tasks', 'egg_conversions',
];

const validateLotNotArchived = async (tableName: string, data?: any, existingRecord?: any): Promise<void> => {
  // Ne vérifie que pour les entités liées à un lot
  if (!LOT_DEPENDENT_TABLES.includes(tableName)) return;

  const lotId = data?.lot_id ?? data?.lot ?? existingRecord?.lot_id ?? existingRecord?.lot ?? undefined;
  if (typeof lotId !== 'number') return;

  const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
  if (lot && lot.status === 'ARCHIVE') {
    throw new Error(`Impossible d'effectuer cette opération : le lot (id=${lotId}) est archivé.`);
  }
  if (lot && lot.status === 'TERMINE' && tableName !== 'chicken_movements' && tableName !== 'lots') {
    // Les mouvements (AJOUT/GUERI) peuvent réactiver un lot terminé.
    // La modification du lot lui-même (nom, statut, etc.) est aussi autorisée
    // même en statut TERMINE (ex: le remettre en ACTIF, modifier son nom).
    throw new Error(`Impossible d'effectuer cette opération : le lot (id=${lotId}) est terminé. Réactivez-le d'abord.`);
  }
};

/**
 * 🔧 Validation métier mouvements de poules (GUERI ≤ MALADE, MORT ≤ cheptel, etc.)
 * Reflète la logique backend validate_health_integrity et validate_bird_stock_integrity.
 */
const validateChickenMovement = async (data?: any, existingRecord?: any): Promise<void> => {
  if (!data) return;
  const mvtType = data.type || existingRecord?.type;
  if (!mvtType) return;
  const mvtQty = Number(data.quantity || 0);
  if (mvtQty <= 0) return;

  const lotId = data.lot_id || data.lot || existingRecord?.lot_id;
  if (typeof lotId !== 'number') return;

  const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
  if (!lot) return;

  // 1. Validation GUERI ≤ MALADE (health integrity)
  if (mvtType === 'GUERI') {
    const allMovements = await queryAll<any>(
      `SELECT type, SUM(quantity) as total FROM chicken_movements WHERE lot_id = ? AND status = 'ACTIF' GROUP BY type`,
      [lotId]
    );
    const maladeTotal = Number(allMovements.find((m: any) => m.type === 'MALADE')?.total || 0);
    const gueriTotal = Number(allMovements.find((m: any) => m.type === 'GUERI')?.total || 0);
    // Exclure l'enregistrement en cours de modification
    const existingGueri = existingRecord?.type === 'GUERI' ? Number(existingRecord.quantity || 0) : 0;
    const currentGueri = gueriTotal - existingGueri;
    const currentMalade = maladeTotal;
    if (currentGueri + mvtQty > currentMalade) {
      throw new Error(
        `Guérison refusée : vous tentez de guérir ${mvtQty} sujet(s), mais seulement ${currentMalade - currentGueri} sont encore malades (${maladeTotal} déclarés malades − ${currentGueri} déjà guéris). Réduisez la quantité à ${currentMalade - currentGueri} maximum.`
      );
    }
  }

  // 2. Validation MORT/VENTE ≤ cheptel (bird stock integrity)
  if (mvtType === 'MORT' || mvtType === 'VENTE') {
    const currentQty = lot.current_quantity || 0;
    if (mvtQty > currentQty) {
      throw new Error(
        `Stock de poules insuffisant : ${currentQty} disponibles, ${mvtQty} demandées.`
      );
    }
  }

  // 3. Validation MALADE ≤ cheptel actuel
  if (mvtType === 'MALADE') {
    const currentQty = lot.current_quantity || 0;
    // Compter les poules déjà malades
    const allMovements = await queryAll<any>(
      `SELECT type, SUM(quantity) as total FROM chicken_movements WHERE lot_id = ? AND status = 'ACTIF' GROUP BY type`,
      [lotId]
    );
    const maladeTotal = Number(allMovements.find((m: any) => m.type === 'MALADE')?.total || 0);
    const gueriTotal = Number(allMovements.find((m: any) => m.type === 'GUERI')?.total || 0);
    const currentSick = maladeTotal - gueriTotal;
    const healthy = currentQty - currentSick;
    if (mvtQty > healthy) {
      throw new Error(
        `Impossible de déclarer ${mvtQty} malades : seulement ${healthy} poules saines disponibles (${currentQty} total - ${currentSick} déjà malades).`
      );
    }
  }
};

const validateChickenStockForSale = async (data?: any): Promise<void> => {
  // Valide que le stock de poules est suffisant pour une vente de poules
  if (!data || data.product_type !== 'CHICKEN') return;
  // Récupérer lot_id quelle que soit la forme envoyée par le formulaire
  const lotId = data.lot_id || data.lot;
  if (typeof lotId !== 'number') return;

  const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
  if (!lot) return;

  const currentStock = lot.current_quantity || 0;
  const saleQty = Number(data.quantity || 0);
  // En modification, on vérifie la différence
  if (saleQty > 0 && currentStock < saleQty) {
    throw new Error(
      `Stock de poules insuffisant pour cette vente : ${currentStock} disponibles, ${saleQty} requis.`
    );
  }
};

const validateEggStockIntegrity = async (data?: any, existingRecord?: any): Promise<void> => {
  // Validation chronologique du stock d'œufs (miroir du backend validate_egg_stock_integrity)
  // Pour les ventes d'œufs et les productions, vérifie que le stock ne devient jamais négatif
  if (!data) return;

  const isSale = data.product_type === 'NORMAL' || data.product_type === 'BROKEN';
  const isProduction = data.casiers_produits !== undefined;
  if (!isSale && !isProduction) return;

  // Accepter les deux formes de FK (formulaire envoie 'lot', SQLite a 'lot_id')
  const lotId = data.lot_id || data.lot || existingRecord?.lot_id || existingRecord?.lot;
  if (typeof lotId !== 'number') return;

  const productType = isSale ? data.product_type : 'NORMAL';

  // Collecter toutes les productions et ventes actives du lot
  const productions = await queryAll<any>(
    `SELECT * FROM productions WHERE lot_id = ? AND status = 'ACTIF' ORDER BY date, id`,
    [lotId]
  );
  const sales = await queryAll<any>(
    `SELECT * FROM sales WHERE lot_id = ? AND product_type = ? AND status = 'ACTIF' ORDER BY date, id`,
    [lotId, productType]
  );
  // Inclure les conversions d'œufs (to_state='VENDABLE') dans le calcul du stock
  const conversions = await queryAll<any>(
    `SELECT * FROM egg_conversions WHERE lot_id = ? AND to_state = 'VENDABLE' AND status = 'ACTIF' ORDER BY conversion_date, id`,
    [lotId]
  );

  // Exclure l'enregistrement en cours d'édition (si UPDATE)
  const excludeId = existingRecord?.id;

  // Construire la timeline chronologique.
  // 🔧 FINDING 8 — toute date est normalisée en chaîne (`String(x || '')`) : une
  // ligne locale sans `date`/`conversion_date` faisait planter `a.date.localeCompare`
  // (TypeError), erreur relancée comme bloquante → écriture offline refusée avec un
  // message obscur (lui-même masqué en « Impossible de contacter le serveur »).
  const timeline: Array<{ date: string; type: string; qty: number }> = [];
  const asDate = (v: any): string => String(v ?? '');

  for (const p of productions) {
    if (excludeId !== undefined && p.id === excludeId) continue;
    const qty = productType === 'NORMAL'
      ? Number(p.casiers_vendables || 0)
      : Number(p.oeufs_casses || 0) / 30.0;
    timeline.push({ date: asDate(p.date), type: 'PROD', qty });
  }

  for (const c of conversions) {
    if (excludeId !== undefined && c.id === excludeId) continue;
    if (productType === 'NORMAL') {
      timeline.push({ date: asDate(c.conversion_date || c.date), type: 'CONV', qty: Number(c.quantity || 0) });
    }
  }

  for (const s of sales) {
    if (excludeId !== undefined && s.id === excludeId) continue;
    timeline.push({ date: asDate(s.date), type: 'SALE', qty: Number(s.quantity || 0) });
  }

  // Ajouter l'opération en cours (mock)
  if (isProduction) {
    const qty = productType === 'NORMAL'
      ? Number(data.casiers_vendables || 0)
      : Number(data.oeufs_casses || 0) / 30.0;
    timeline.push({ date: asDate(data.date), type: 'PROD', qty });
  } else if (isSale) {
    timeline.push({ date: asDate(data.date), type: 'SALE', qty: Number(data.quantity || 0) });
  }

  // Trier chronologiquement (PROD avant CONV avant SALE pour une même date)
  timeline.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const typeOrder = { PROD: 0, CONV: 1, SALE: 2 } as Record<string, number>;
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });

  // Vérifier que le stock ne devient jamais négatif
  let stock = 0;
  for (const it of timeline) {
    if (it.type === 'PROD' || it.type === 'CONV') stock += it.qty;
    else stock -= it.qty;
    if (stock < -0.001) {
      const label = productType === 'NORMAL' ? 'normaux' : 'cassés';
      throw new Error(
        `Le ${it.date}, stock de casiers ${label} insuffisant pour valider cette opération.`
      );
    }
  }
};

const validatePayrollUniqueness = async (data?: any, existingRecord?: any): Promise<void> => {
  // Vérifie qu'il n'y a pas déjà une paie pour le même employé et la même période
  if (!data) return;
  // Accepter les deux formes de FK (formulaire envoie 'employee', SQLite a 'employee_id')
  const employeeId = data.employee_id || data.employee || existingRecord?.employee_id;
  const periodKey = data.period_key || existingRecord?.period_key;
  if (typeof employeeId !== 'number' || !periodKey) return;
  
  const excludeId = existingRecord?.id;

  let query = `SELECT id FROM payrolls WHERE employee_id = ? AND period_key = ? AND status = 'ACTIF'`;
  let params: any[] = [employeeId, periodKey];
  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }
  query += ` LIMIT 1`;

  const existing = await queryAll<any>(query, params);
  if (existing.length > 0) {
    throw new Error(
      `Une paie existe déjà pour cet employé pour cette période (${periodKey}).`
    );
  }
};

const validateFeedStockIntegrity = async (data?: any, existingRecord?: any): Promise<void> => {
  if (!data || data.quantity_kg === undefined || data.feed_type === undefined) return;

  const lotId = data.lot_id || data.lot || existingRecord?.lot_id;
  if (typeof lotId !== 'number') return;

  const feedType = data.feed_type;
  const qty = Number(data.quantity_kg || 0);
  const excludeId = existingRecord?.id;

  const allDistributions = await queryAll<any>(
    `SELECT id, quantity_kg FROM feeds WHERE lot_id = ? AND feed_type = ? AND status = 'ACTIF'`,
    [lotId, feedType]
  );
  let totalDistributed = 0;
  for (const d of allDistributions) {
    if (d.id !== excludeId) totalDistributed += Number(d.quantity_kg || 0);
  }
  totalDistributed += qty;

  const purchases = await queryAll<any>(
    `SELECT SUM(quantity_kg) as total FROM feed_purchases WHERE lot_id = ? AND feed_type = ? AND status = 'ACTIF'`,
    [lotId, feedType]
  );
  const preparations = await queryAll<any>(
    `SELECT SUM(quantity_produced_kg) as total FROM feed_preparations WHERE lot_id = ? AND feed_name = ? AND status = 'ACTIF'`,
    [lotId, feedType]
  );

  const totalAvailable = Number(purchases[0]?.total || 0) + Number(preparations[0]?.total || 0);

  if (totalDistributed > totalAvailable) {
    throw new Error(`Stock d'aliment insuffisant : ${totalAvailable} kg disponibles, ${totalDistributed} kg demandés au total.`);
  }
};

const validateHealthStockIntegrity = async (data?: any, existingRecord?: any): Promise<void> => {
  if (!data || data.quantity === undefined || data.product_name === undefined) return;

  const lotId = data.lot_id || data.lot || existingRecord?.lot_id;
  if (typeof lotId !== 'number') return;

  const productName = data.product_name;
  const qty = Number(data.quantity || 0);
  const excludeId = existingRecord?.id;

  const allTreatments = await queryAll<any>(
    `SELECT id, quantity FROM health_records WHERE lot_id = ? AND product_name = ? AND status = 'ACTIF'`,
    [lotId, productName]
  );
  let totalUsed = 0;
  for (const t of allTreatments) {
    if (t.id !== excludeId) totalUsed += Number(t.quantity || 0);
  }
  totalUsed += qty;

  const purchases = await queryAll<any>(
    `SELECT SUM(quantity) as total FROM health_purchases WHERE lot_id = ? AND product_name = ? AND status = 'ACTIF'`,
    [lotId, productName]
  );
  const totalAvailable = Number(purchases[0]?.total || 0);

  if (totalUsed > totalAvailable) {
    throw new Error(`Stock de santé insuffisant : ${totalAvailable} disponibles, ${totalUsed} demandés au total.`);
  }
};

/**
 * Validation métier pour les conversions d'œufs en mode offline.
 * Vérifie que la quantité ne dépasse pas le stock en attente disponible.
 */
const validateEggConversion = async (data?: any): Promise<void> => {
  if (!data) return;
  const productionId = data.production_id || data.production;
  const quantity = Number(data.quantity || 0);

  if (quantity <= 0) {
    throw new Error('La quantité à convertir doit être supérieure à zéro.');
  }
  if (!Number.isInteger(quantity)) {
    throw new Error('La quantité doit être un nombre entier.');
  }

  if (typeof productionId === 'number') {
    const production = await fetchRow<any>('productions', 'id = ?', [productionId]);
    if (!production) return;
    if (production.status === 'ANNULEE') {
      throw new Error('Cette production est annulée. Impossible d\'effectuer des conversions.');
    }

    const alreadyConverted = await queryAll<any>(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM egg_conversions WHERE production_id = ? AND status = 'ACTIF'`,
      [productionId]
    );
    const convertedSum = Number(alreadyConverted[0]?.total || 0);
    const pending = Number(production.casiers_produits || 0) - Number(production.casiers_vendables || 0) - convertedSum;
    if (quantity > pending) {
      throw new Error(`Quantité insuffisante en attente. Disponible : ${pending} casier(s), demandé : ${quantity}.`);
    }
  }
};

/**
 * 🔒 Validation métier d'un paiement de vente en mode OFFLINE (miroir du backend
 * SalePaymentSerializer.validate). Garantit que le montant encaissé ne dépasse
 * jamais la créance restante (#7/#8), même sans connexion :
 *   - montant strictement positif ;
 *   - vente non annulée ;
 *   - somme des paiements ACTIFS (hors celui modifié) + ce montant ≤ total vente.
 */
const validateSalePayment = async (data?: any, existingRecord?: any): Promise<void> => {
  if (!data) return;
  const amount = Number(data.amount === undefined ? existingRecord?.amount : data.amount);
  if (data.amount !== undefined && Number(data.amount) <= 0) {
    throw new Error('Le montant encaissé doit être supérieur à zéro.');
  }

  const saleId = data.sale ?? data.sale_id ?? existingRecord?.sale_id;
  if (typeof saleId !== 'number') return;

  const sale = await fetchRow<any>('sales', 'id = ?', [saleId]).catch(() => null);
  if (!sale) return;
  if (sale.status === 'ANNULEE') {
    throw new Error("Cette vente est annulée. Impossible d'enregistrer un paiement.");
  }

  const total = Number(sale.total_amount || 0);
  const rows = await queryAll<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ? AND status = 'ACTIF'`,
    [saleId]
  );
  let alreadyPaid = Number(rows[0]?.total || 0);
  // En édition, ne pas compter le paiement en cours de modification.
  if (existingRecord && existingRecord.status === 'ACTIF') {
    alreadyPaid -= Number(existingRecord.amount || 0);
  }

  if (alreadyPaid + amount > total + 0.001) {
    const remaining = Math.max(0, total - alreadyPaid);
    throw new Error(
      `Impossible d'encaisser ${amount}: déjà payé ${alreadyPaid} sur ${total} (reste ${remaining} à encaisser).`
    );
  }
};

/** Effet signé d'un mouvement de poules sur `lots.current_quantity`. */
const movementQtyEffect = (m: any): number => {
  if (!m || m.status !== 'ACTIF') return 0;
  const q = Number(m.quantity || 0);
  if (m.type === 'AJOUT') return q;
  if (m.type === 'MORT' || m.type === 'VENTE') return -q;
  return 0; // MALADE / GUERI : statut sanitaire, pas de variation d'effectif
};

const updateLotQuantityForMovement = async (movement: any, previousMovement?: any): Promise<void> => {
  const lotId = movement?.lot_id ?? previousMovement?.lot_id;
  if (typeof lotId !== 'number') return;

  const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
  if (!lot) return;

  const currentQty = Number(lot.current_quantity || 0);

  // 🔧 Finding 4 — ajustement DELTA signé, jamais de recalcul absolu depuis
  // `initial_quantity` + un historique SQLite potentiellement tronqué (pull
  // partiel, état « serveur coupé » sans rechargement) : ce recalcul produisait
  // un `current_quantity` faussement bas → « stock insuffisant alors que j'en ai ».
  // `current_quantity` reste la valeur autoritaire du serveur ; on n'y applique
  // que l'effet de CE mouvement (en annulant d'abord celui de sa version
  // précédente). Cohérent avec updateLotQuantityForSale.
  const newQty = Math.max(
    0,
    currentQty - movementQtyEffect(previousMovement) + movementQtyEffect(movement)
  );

  let newStatus = lot.status;
  let newMotifFin = lot.motif_fin;

  if (newQty === 0 && lot.status === 'ACTIF') {
    newStatus = 'TERMINE';
    // motif_fin : heuristique best-effort à partir des mouvements locaux connus
    // (purement cosmétique — la resynchro serveur la corrige). N'entre PAS dans
    // le calcul de newQty.
    try {
      const totals = await queryAll<any>(
        `SELECT type, SUM(quantity) as total FROM chicken_movements WHERE lot_id = ? AND status = 'ACTIF' GROUP BY type`,
        [lotId]
      );
      const totalAdded = Number(totals.find((m: any) => m.type === 'AJOUT')?.total || 0);
      const totalDead = Number(totals.find((m: any) => m.type === 'MORT')?.total || 0);
      const totalSold = Number(totals.find((m: any) => m.type === 'VENTE')?.total || 0);
      const base = Number(lot.initial_quantity) + totalAdded;
      if (base > 0 && totalSold / base >= 0.5 && totalSold >= totalDead) {
        newMotifFin = 'VENTE_TOTALE';
      } else if (base > 0 && totalDead / base >= 0.7) {
        newMotifFin = 'MORTALITE_TOTALE';
      } else {
        newMotifFin = 'FIN_ELEVAGE';
      }
    } catch {
      newMotifFin = 'FIN_ELEVAGE';
    }
  } else if (newQty > 0 && lot.status === 'TERMINE') {
    newStatus = 'ACTIF';
    newMotifFin = null;
  }

  if (newQty !== currentQty || newStatus !== lot.status || newMotifFin !== lot.motif_fin) {
    await updateRow('lots', lotId, {
      ...lot,
      current_quantity: newQty,
      status: newStatus,
      motif_fin: newMotifFin,
      _needs_sync: 1,
      updated_at: new Date().toISOString(),
    });
    
    // Miroir signal Django : si le lot devient TERMINE, désactiver ses rappels
    if (newStatus === 'TERMINE' && lot.status === 'ACTIF') {
      await deactivateLotRemindersLocally(lotId);
    }
  }
};

/**
 * 🔧 Met à jour lots.current_quantity après création, modification ou annulation d'une vente de poules offline.
 * 🔧 Gère aussi la création/mise à jour du ChickenMovement miroir (signal Django).
 */
const updateLotQuantityForSale = async (sale: any, previousSale?: any): Promise<void> => {
  if (sale?.product_type !== 'CHICKEN' && previousSale?.product_type !== 'CHICKEN') return;

  const lotId = sale?.lot_id || previousSale?.lot_id;
  if (typeof lotId !== 'number') return;

  const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
  if (!lot) return;

  const currentQty = Number(lot.current_quantity || 0);
  let newQty = currentQty;

  // 1. Annuler l'effet de l'ancienne vente
  if (previousSale && previousSale.status === 'ACTIF' && previousSale.product_type === 'CHICKEN') {
    newQty += Number(previousSale.quantity || 0);
  }

  // 2. Appliquer le nouvel effet
  if (sale && sale.status === 'ACTIF' && sale.product_type === 'CHICKEN') {
    newQty -= Number(sale.quantity || 0);
  }

  newQty = Math.max(0, newQty);
  if (newQty !== currentQty) {
    const newStatus = newQty === 0 && lot.status === 'ACTIF' ? 'TERMINE' : lot.status;
    await updateRow('lots', lotId, {
      ...lot,
      current_quantity: newQty,
      status: newStatus,
      _needs_sync: 1,
      updated_at: new Date().toISOString(),
    });
    
    // Miroir signal Django : si le lot devient TERMINE, désactiver ses rappels
    if (newStatus === 'TERMINE' && lot.status === 'ACTIF') {
      await deactivateLotRemindersLocally(lotId);
    }
  }

  // 3. 🔧 Gérer le ChickenMovement miroir
  const now = new Date().toISOString();
  if (sale && sale.product_type === 'CHICKEN') {
    // Chercher le mouvement local existant
    const existingMvt = await fetchRow<any>('chicken_movements', 'sale_id = ?', [sale.id]);

    const mvtData = {
      lot_id: lotId,
      type: 'VENTE',
      quantity: sale.quantity,
      date: sale.date,
      reason: `Vente à ${sale.customer_name || 'Client'}. ${sale.note || ''}`.trim(),
      status: sale.status || 'ACTIF',
      sale_id: sale.id,
      _needs_sync: 0, // preview-only, le serveur créera le sien
      updated_at: now,
    };

    if (existingMvt) {
      await updateRow('chicken_movements', existingMvt.id, {
        ...existingMvt,
        ...mvtData,
      });
    } else if (sale.status === 'ACTIF') {
      const mvtId = await getNextOfflineId();
      await insertRow('chicken_movements', {
        ...mvtData,
        id: mvtId,
        created_at: now,
      });
    }
  }
};

// Helper: enqueue sans bloquer l'utilisateur si la table sync_queue est inaccessible
const safeEnqueue = async (operation: string, endpoint: string, payload: any, localId: number | null, tableName: string): Promise<void> => {
  try {
    await enqueueSyncQueue(operation, endpoint, payload, localId, tableName);
  } catch (e: any) {
    console.warn(`[Offline] Échec mise en queue sync pour ${operation} ${endpoint}:`, e?.message || e);
    // L'opération locale est déjà effectuée — on réessaiera au prochain sync
  }
};

// Tables où le DELETE backend = soft-delete (status → ANNULEE), pas une suppression réelle.
// Pour ces tables, le mode offline doit marquer ANNULEE au lieu de hard-delete la ligne,
// afin que l'item reste visible dans l'interface comme "annulé".
export const CANCELLABLE_TABLES = new Set([
  'productions', 'sales', 'feeds', 'health_records', 'chicken_movements',
  'expenses', 'feed_purchases', 'health_purchases', 'feed_preparations',
  'payrolls', 'bonuses', 'egg_conversions', 'sale_payments',
]);

// --- Handler principal d'écriture offline ---

// Mapping table → module et action pour les logs d'activité
export const TABLE_MODULE_MAP: Record<string, string> = {
  productions: 'Production',
  sales: 'Vente',
  feeds: 'Alimentation',
  health_records: 'Santé',
  chicken_movements: 'Mouvement',
  expenses: 'Finance',
  feed_purchases: 'Alimentation',
  health_purchases: 'Santé',
  feed_preparations: 'Alimentation',
  feed_inventory: 'Alimentation',
  health_inventory: 'Santé',
  prepared_feed_inventory: 'Alimentation',
  feed_preparation_ingredients: 'Alimentation',
  payrolls: 'Finance',
  bonuses: 'Finance',
  attendances: 'RH',
  tasks: 'Tâches',
  reminders: 'Rappels',
  employee_requests: 'RH',
  lots: 'Gestion',
  lot_expenses: 'Gestion Lot',
  egg_conversions: 'Production',
  farms: 'Gestion',
  employees: 'RH',
  health_alerts: 'Santé',
  activity_logs: 'Historique',
};

const getActionLabel = (method: string, tableName?: string): string => {
  switch (method) {
    case 'POST': return 'Création';
    case 'PUT':
    case 'PATCH': return 'Modification';
    case 'DELETE':
      // Pour les tables annulables, l'action est "Annulation" (miroir du comportement Django online)
      // Pour les autres tables, c'est une vraie suppression
      return (tableName && CANCELLABLE_TABLES.has(tableName)) ? 'Annulation' : 'Suppression';
    default: return 'Action';
  }
};

const buildDescription = (tableName: string, method: string, data?: any, action?: string): string => {
  if (action === 'archive') return 'Archivage effectué';
  if (action === 'reactivate') return 'Réactivation effectuée';
  if (action === 'clock_in') return 'Arrivée pointée';
  if (action === 'clock_out') return 'Départ pointé';
  if (action === 'complete') return 'Tâche complétée';
  if (action === 'approve') return 'Demande approuvée';
  if (action === 'reject') return 'Demande rejetée';
  if (action === 'mark_as_viewed') return 'Alerte consultée';
  if (action === 'convert_to_vendable') {
    const qty = data?.quantity || 0;
    return `${qty} casiers convertis en vendables`;
  }

  switch (tableName) {
    case 'productions': {
      const nb = data?.casiers_produits || 0;
      return `${nb} casiers produits`;
    }
    case 'sales': {
      const qty = data?.quantity || 0;
      const type = data?.product_type === 'CHICKEN' ? 'poules' : data?.product_type === 'BROKEN' ? 'casiers cassés' : 'casiers normaux';
      const amount = data?.total_amount || 0;
      return `Vente de ${qty} ${type} - ${amount} GNF`;
    }
    case 'feeds': {
      const kg = data?.quantity_kg || 0;
      return `Distribution de ${kg} kg d'aliment`;
    }
    case 'health_records': {
      const name = data?.product_name || '';
      const qty = data?.quantity || 0;
      return `Traitement: ${name} (${qty} ${data?.unit || 'unité(s)'})`;
    }
    case 'chicken_movements': {
      const type = data?.type || '';
      const qty = data?.quantity || 0;
      const typeLabelMap: Record<string, string> = { MORT: 'morts', MALADE: 'malades', GUERI: 'guérisons', AJOUT: 'ajouts', VENTE: 'vendues' };
      const typeLabel = typeLabelMap[type] || type;
      return `${qty} poules ${typeLabel}`;
    }
    case 'expenses': {
      const amount = data?.amount || 0;
      return `Dépense: ${data?.description || ''} - ${amount} GNF`;
    }
    case 'payrolls': {
      const amount = data?.amount_paid || 0;
      return `Paie de ${amount} GNF`;
    }
    case 'bonuses': {
      const amount = data?.amount || 0;
      return `Prime de ${amount} GNF`;
    }
    case 'lot_expenses': {
      const name = data?.name || 'Frais';
      const amount = data?.amount || 0;
      if (method === 'DELETE') return `Frais "${name}" supprimé (${amount} GNF)`;
      if (method === 'PUT' || method === 'PATCH') return `Frais "${name}" mis à jour: ${amount} GNF`;
      return `Frais "${name}" ajouté: ${amount} GNF`;
    }
    case 'lots':
      return data?.name ? `Lot "${data.name}" créé` : 'Lot modifié';
    case 'farms':
      return data?.name ? `Ferme "${data.name}" créée` : 'Ferme modifiée';
    case 'feed_purchases': {
      const kg = data?.quantity_kg || 0;
      const amount = data?.total_price || 0;
      return `Achat de ${kg} kg d'aliment - ${amount} GNF`;
    }
    case 'health_purchases': {
      const name = data?.product_name || 'Produit santé';
      const qty = data?.quantity || 0;
      const amount = data?.total_price || 0;
      return `Achat de ${qty} ${name} - ${amount} GNF`;
    }
    case 'feed_preparations': {
      const kg = data?.kg || 0;
      const name = data?.feed_name || 'Mélange';
      return `Préparation de ${kg} kg de ${name}`;
    }
    case 'egg_conversions': {
      const qty = data?.quantity || 0;
      return `Conversion: ${qty} casiers (${data?.from_state || 'EN_ATTENTE'}→${data?.to_state || 'VENDABLE'})`;
    }
    default:
      return `${method} sur ${tableName}`;
  }
};

// ─── Miroir des signaux Django pour le mode offline ───

/**
 * Recalcule les champs de coût d'un lot après ajout/modification/suppression d'un lot_expense.
 * Miroir du signal Django handle_lot_expense_change dans models.py.
 * Logique : SUM(amount) des lot_expenses → extra_expenses
 *           subjects_price + extra_expenses → purchase_price (coût total)
 *           purchase_price / initial_quantity → real_cost_per_subject
 */
const recalculateLotCostLocally = async (lotId: number): Promise<void> => {
  if (!lotId) return;
  try {
    const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
    if (!lot) return;

    // SUM de tous les frais liés au lot
    const expensesRows = await queryAll<{ amount: number }>(
      `SELECT amount FROM lot_expenses WHERE lot_id = ?`,
      [lotId]
    );
    const totalExpenses = expensesRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const subjectsPrice = Number(lot.subjects_price) || Number(lot.purchase_price) || 0;
    const purchasePrice = subjectsPrice + totalExpenses;
    const qty = Number(lot.initial_quantity) || 1;
    const realCostPerSubject = purchasePrice / qty;

    await updateRow('lots', lotId, {
      extra_expenses: totalExpenses,
      purchase_price: purchasePrice,
      real_cost_per_subject: realCostPerSubject,
      _needs_sync: 1,
      updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn('[Offline] recalculateLotCostLocally error:', e?.message || e);
  }
};

/**
 * Recalcule l'inventaire d'aliments préparés (prepared_feed_inventory) après
 * une préparation, une distribution, une modification ou une annulation.
 * Miroir du signal Django recalculate_prepared_feed_inventory.
 * Logique : SUM(quantity_produced_kg) des feed_preparations ACTIVE
 *           - SUM(quantity_kg) des feeds ACTIVE (distributions)
 */
const recalculatePreparedFeedInventoryLocally = async (lotId?: number): Promise<void> => {
  if (!lotId) return;
  try {
    // Préparations actives par nom d'aliment
    const preparations = await queryAll<any>(
      `SELECT feed_name, SUM(quantity_produced_kg) as produced FROM feed_preparations WHERE lot_id = ? AND status = 'ACTIF' GROUP BY feed_name`,
      [lotId]
    );
    // Distributions actives par type d'aliment
    const distributions = await queryAll<any>(
      `SELECT feed_type, SUM(quantity_kg) as consumed FROM feeds WHERE lot_id = ? AND status = 'ACTIF' GROUP BY feed_type`,
      [lotId]
    );
    const consumedMap = new Map<string, number>();
    for (const d of distributions) {
      consumedMap.set(d.feed_type, Number(d.consumed || 0));
    }

    await runSqlAsync(`DELETE FROM prepared_feed_inventory WHERE lot_id = ?`, [lotId]);
    emitDataChange({ tableName: 'prepared_feed_inventory', action: 'DELETE' });
    for (const p of preparations) {
      const consumed = consumedMap.get(p.feed_name) || 0;
      const net = Math.max(0, Number(p.produced || 0) - consumed);
      if (p.feed_name && net > 0) {
        await insertOrReplaceRow('prepared_feed_inventory', {
          lot_id: lotId,
          feed_name: p.feed_name,
          quantity_kg: net,
          updated_at: new Date().toISOString(),
          _needs_sync: 0,
        });
      }
    }
    console.info(`[Offline] Prepared feed inventory recalculé pour lot #${lotId}: ${preparations.length} type(s)`);
  } catch (e: any) {
    console.warn(`[Offline] Échec recalcul prepared_feed_inventory lot #${lotId}:`, e?.message);
  }
};

/**
 * Recalcule l'inventaire de matières premières (feed_inventory) après un achat,
 * une modification ou une annulation de feed_purchase.
 * Miroir du signal Django recalculate_feed_inventory.
 * Logique : SUM(quantity_kg) des feed_purchases ACTIVE par feed_type pour le lot.
 */
const recalculateFeedInventoryLocally = async (lotId?: number): Promise<void> => {
  if (!lotId) return;
  try {
    // Somme des achats actifs par type d'aliment (matières premières achetées)
    const purchases = await queryAll<any>(
      `SELECT feed_type, SUM(quantity_kg) as total FROM feed_purchases WHERE lot_id = ? AND status = 'ACTIF' GROUP BY feed_type`,
      [lotId]
    );

    // Somme des ingrédients utilisés dans les préparations actives (consommation matières premières)
    // Miroir exact du signal Django: total_used_in_preparations via FeedPreparationIngredient
    const ingredientsUsed = await queryAll<any>(
      `SELECT fpi.material_name, SUM(fpi.quantity_used_kg) as used
       FROM feed_preparation_ingredients fpi
       JOIN feed_preparations fp ON fpi.preparation_id = fp.id
      WHERE fp.lot_id = ? AND fp.status = 'ACTIF'
       GROUP BY fpi.material_name`,
      [lotId]
    );
    const ingredientsMap = new Map<string, number>();
    for (const ing of ingredientsUsed) {
      ingredientsMap.set(ing.material_name, Number(ing.used || 0));
    }

    // Remplacer l'inventaire existant pour ce lot
    await runSqlAsync(`DELETE FROM feed_inventory WHERE lot_id = ?`, [lotId]);
    emitDataChange({ tableName: 'feed_inventory', action: 'DELETE' });
    for (const p of purchases) {
      if (p.feed_type && p.total > 0) {
        const usedInPreparations = ingredientsMap.get(p.feed_type) || 0;
        const net = Math.max(0, Number(p.total || 0) - usedInPreparations);
        if (net > 0) {
          await insertOrReplaceRow('feed_inventory', {
            lot_id: lotId,
            feed_type: p.feed_type,
            quantity_kg: net,
            updated_at: new Date().toISOString(),
            _needs_sync: 0,
          });
        }
      }
    }
    console.info(`[Offline] Feed inventory recalculé pour lot #${lotId}: ${purchases.length} type(s)`);
  } catch (e: any) {
    console.warn(`[Offline] Échec recalcul feed_inventory lot #${lotId}:`, e?.message);
  }
};


/**
 * Recalcule l'inventaire de produits de santé (health_inventory) après un achat,
 * un traitement, une modification ou une annulation.
 * Miroir du signal Django recalculate_health_inventory.
 * Logique : SUM(quantity) health_purchases ACTIVE - SUM(quantity) health_records ACTIVE
 */
const recalculateHealthInventoryLocally = async (lotId?: number): Promise<void> => {
  if (!lotId) return;
  try {
    // Achats par produit
    const purchases = await queryAll<any>(
      `SELECT product_name, product_type, unit, SUM(quantity) as total FROM health_purchases WHERE lot_id = ? AND status = 'ACTIF' GROUP BY product_name, product_type, unit`,
      [lotId]
    );
    // Traitements par produit
    const treatments = await queryAll<any>(
      `SELECT product_name, SUM(quantity) as used FROM health_records WHERE lot_id = ? AND status = 'ACTIF' GROUP BY product_name`,
      [lotId]
    );
    const usedMap = new Map<string, number>();
    for (const t of treatments) {
      usedMap.set(t.product_name, Number(t.used || 0));
    }

    await runSqlAsync(`DELETE FROM health_inventory WHERE lot_id = ?`, [lotId]);
    emitDataChange({ tableName: 'health_inventory', action: 'DELETE' });
    for (const p of purchases) {
      const used = usedMap.get(p.product_name) || 0;
      const net = Math.max(0, Number(p.total || 0) - used);
      if (p.product_name && net > 0) {
        await insertOrReplaceRow('health_inventory', {
          lot_id: lotId,
          product_name: p.product_name,
          product_type: p.product_type || 'Autre',
          quantity: net,
          unit: p.unit || 'Flacon',
          updated_at: new Date().toISOString(),
          _needs_sync: 0,
        });
      }
    }
    console.info(`[Offline] Health inventory recalculé pour lot #${lotId}: ${purchases.length} produit(s)`);
  } catch (e: any) {
    console.warn(`[Offline] Échec recalcul health_inventory lot #${lotId}:`, e?.message);
  }
};

/**
 * Crée une alerte santé (health_alert) locale après un mouvement de poules.
 * Miroir du signal Django handle_chicken_movement_change (get_or_create HealthAlert).
 * Gère tous les types : MORT, MALADE, GUERI, AJOUT, VENTE.
 */
const createHealthAlertLocally = async (movement: any): Promise<void> => {
  if (!movement || !movement.lot_id) return;
  const mvtType = movement.type;

  const alertTypeMap: Record<string, string> = {
    MORT: 'MORTALITE',
    MALADE: 'MALADIE',
    GUERI: 'GUERISON',
    AJOUT: 'AJOUT',
    VENTE: 'VENTE',
  };
  const colorMap: Record<string, string> = {
    MORT: 'RED',
    MALADE: 'ORANGE',
    GUERI: 'GREEN',
    AJOUT: 'BLUE',
    VENTE: 'PURPLE',
  };

  const alertType = alertTypeMap[mvtType];
  const color = colorMap[mvtType];
  if (!alertType || !color) return; // type de mouvement inconnu

  try {
    const lot = await fetchRow<any>('lots', 'id = ?', [movement.lot_id]);
    if (!lot) return;

    const localId = await getNextOfflineId();
    const now = new Date().toISOString();

    await insertRow('health_alerts', {
      id: localId,
      farm_id: lot.farm_id,
      farm_name: null,
      lot_id: movement.lot_id,
      lot_name: lot.name,
      type: alertType,
      color,
      quantity: movement.quantity,
      date: movement.date || now.split('T')[0],
      created_by_name: null,
      is_viewed: 0,
      created_at: now,
      _needs_sync: 0, // preview-only — sera remplacé par la version serveur
    });
    console.info(`[Offline] Health alert créée localement: ${alertType} lot #${movement.lot_id} (${movement.quantity} sujets)`);
  } catch (e: any) {
    console.warn(`[Offline] Échec création health_alert locale:`, e?.message);
  }
};

/**
 * 🔧 Marque la health_alert locale comme lue lors de l'annulation d'un mouvement
 * Miroir de handle_chicken_movement_change (status='ANNULEE').
 */
const cancelHealthAlertLocally = async (movement: any): Promise<void> => {
  if (!movement || !movement.lot_id) return;
  const alertTypeMap: Record<string, string> = { MORT: 'MORTALITE', MALADE: 'MALADIE', GUERI: 'GUERISON', AJOUT: 'AJOUT', VENTE: 'VENTE' };
  const alertType = alertTypeMap[movement.type];
  if (!alertType) return;
  
  try {
    const alerts = await queryAll<any>(
      `SELECT * FROM health_alerts WHERE lot_id = ? AND type = ? AND quantity = ? AND is_viewed = 0`,
      [movement.lot_id, alertType, movement.quantity]
    );
    if (alerts.length > 0) {
      const alert = alerts[alerts.length - 1]; // La plus récente
      await updateRow('health_alerts', alert.id, {
        ...alert,
        is_viewed: 1,
        viewed_at: new Date().toISOString(),
        _needs_sync: 1
      });
      console.info(`[Offline] Health alert marquée lue suite à annulation mouvement lot #${movement.lot_id}`);
    }
  } catch (e) {
    // Ignore
  }
};

/**
 * 🔧 Recalcule le montant payé et le statut de paiement d'une vente (miroir de SalePayment post_save/post_delete).
 */
const recalculateSalePaymentStatusLocally = async (saleId: number): Promise<void> => {
  if (!saleId) return;
  try {
    const sale = await fetchRow<any>('sales', 'id = ?', [saleId]);
    if (!sale) return;

    const payments = await queryAll<any>(
      `SELECT SUM(amount) as total FROM sale_payments WHERE sale_id = ? AND status = 'ACTIF'`,
      [saleId]
    );
    const amountPaid = payments[0]?.total || 0;
    
    let paymentStatus = 'NON_PAYE';
    if (amountPaid > 0) {
      if (amountPaid >= (sale.total_amount || 0)) {
        paymentStatus = 'PAYE';
      } else {
        paymentStatus = 'PARTIELLEMENT_PAYE';
      }
    }

    await updateRow('sales', saleId, {
      ...sale,
      amount_paid: amountPaid,
      payment_status: paymentStatus,
      // On ne marque pas la vente avec _needs_sync=1 car le backend gère ça de son côté via les signaux
      // C'est juste pour que l'UI se mette à jour localement
    });
    console.info(`[Offline] Sale #${saleId} payment status recalculé : ${amountPaid} -> ${paymentStatus}`);
  } catch (e: any) {
    console.warn(`[Offline] Erreur recalculateSalePaymentStatusLocally :`, e?.message);
  }
};

/**
 * 🔧 Répare les ventes créées hors-ligne (id < 0, pas encore synchronisées) qui
 * ont un `amount_paid > 0` mais aucun SalePayment ACTIF — situation laissée par
 * un ancien bug où l'INSERT du paiement initial échouait (farm_id NOT NULL) après
 * l'insertion de la vente. Sans ce paiement, l'historique des paiements affiche
 * « Total payé : 0 » et la créance est fausse. On recrée le paiement INITIAL
 * manquant (le backend en créera un identique au moment de la synchro → dédupliqué
 * au pull). Idempotent : ne touche jamais une vente déjà synchronisée (id > 0).
 */
export const reconcileMissingInitialSalePayments = async (): Promise<void> => {
  try {
    const brokenSales = await queryAll<any>(
      `SELECT * FROM sales
        WHERE id < 0 AND status != 'ANNULEE' AND COALESCE(amount_paid, 0) > 0
          AND NOT EXISTS (
            SELECT 1 FROM sale_payments p WHERE p.sale_id = sales.id AND p.status = 'ACTIF'
          )`,
      []
    );
    if (brokenSales.length === 0) return;
    for (const sale of brokenSales) {
      const lotId = sale.lot_id || sale.lot;
      if (!lotId) continue;
      const lot = await fetchRow<any>('lots', 'id = ?', [lotId]).catch(() => null);
      const farmId = lot?.farm_id;
      if (!farmId) continue; // impossible de satisfaire farm_id NOT NULL
      const now = new Date().toISOString();
      await insertRow('sale_payments', {
        id: await getNextOfflineId(),
        sale_id: sale.id,
        farm_id: farmId,
        lot_id: lotId,
        amount: Number(sale.amount_paid) || 0,
        payment_method: 'CASH',
        payment_date: sale.date || now.split('T')[0],
        reference: 'INITIAL',
        note: 'Paiement initial (réconciliation)',
        status: 'ACTIF',
        created_at: now,
        updated_at: now,
        _needs_sync: 0,
      });
      console.info(`[Offline] Réconciliation : paiement INITIAL recréé pour vente locale #${sale.id}`);
    }
  } catch (e: any) {
    console.warn('[Offline] reconcileMissingInitialSalePayments:', e?.message || e);
  }
};

/**
 * 🔧 Synchronise une dépense locale (expense) lors de la création/modification/annulation
 * d'un achat, d'une paie ou d'une prime. Miroir exact des signaux Django.
 */
const syncLocalExpense = async (tableName: string, data: any, method: string): Promise<void> => {
  if (!['feed_purchases', 'health_purchases', 'payrolls', 'bonuses'].includes(tableName)) return;

  const status = data.status || 'ACTIF';
  
  if (status === 'ACTIF' && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    let category = '';
    let description = '';
    let amount = 0;
    let farmId = data.farm_id;

    if (tableName === 'feed_purchases') {
      category = 'ALIMENTATION';
      description = `Achat ${data.feed_type} - ${data.quantity_kg}kg`;
      amount = data.total_price;
    } else if (tableName === 'health_purchases') {
      category = 'SANTE';
      description = `Achat ${data.product_name} - ${data.quantity} ${data.unit || 'Flacon'}`;
      amount = data.total_price;
    } else if (tableName === 'payrolls') {
      category = 'SALAIRE';
      const employee = await fetchRow<any>('employees', 'id = ?', [data.employee_id]);
      const empName = employee?.user_name || data.employee_name || 'Employé';
      const monthLabel = data.date ? new Date(data.date).toLocaleString('default', { month: 'long', year: 'numeric' }) : '';
      description = `Salaire ${monthLabel} - ${empName}`;
      amount = data.amount_paid;
      farmId = employee?.farm_id || data.farm_id;
    } else if (tableName === 'bonuses') {
      category = 'PRIME';
      const employee = await fetchRow<any>('employees', 'id = ?', [data.employee_id]);
      const empName = employee?.user_name || data.employee_name || 'Employé';
      const typeLabel = data.bonus_type_label || 'Performance';
      description = `Prime ${typeLabel} - ${empName}`;
      amount = data.amount;
      farmId = employee?.farm_id || data.farm_id;
    }

    if (!farmId || !amount) return;

    if (data.expense_id) {
      const expense = await fetchRow<any>('expenses', 'id = ?', [data.expense_id]);
      if (expense) {
        await updateRow('expenses', expense.id, {
          ...expense, category, description, amount, date: data.date, status, updated_at: new Date().toISOString(), _needs_sync: 1
        });
      }
    } else {
      const localExpenseId = await getNextOfflineId();
      await insertRow('expenses', {
        id: localExpenseId, farm_id: farmId, category, description, amount, date: data.date, status, created_at: new Date().toISOString(), _needs_sync: 0
      });
      if (tableName !== 'bonuses' && data.id) {
        await updateRow(tableName, data.id, { ...data, expense_id: localExpenseId });
        data.expense_id = localExpenseId;
      }
    }
  } else if (status === 'ANNULEE' && data.expense_id) {
    const expense = await fetchRow<any>('expenses', 'id = ?', [data.expense_id]);
    if (expense) {
      await updateRow('expenses', expense.id, { ...expense, status: 'ANNULEE', updated_at: new Date().toISOString(), _needs_sync: 1 });
    }
  } else if (status === 'ANNULEE' && tableName === 'bonuses') {
    const employee = await fetchRow<any>('employees', 'id = ?', [data.employee_id]);
    const empName = employee?.user_name || data.employee_name || 'Employé';
      const expenses = await queryAll<any>(
      `SELECT * FROM expenses WHERE farm_id = ? AND category = 'PRIME' AND description LIKE ? AND amount = ? AND date = ? AND status = 'ACTIF'`,
      [employee?.farm_id || data.farm_id, `%${empName}%`, data.amount, data.date]
    );
    for (const exp of expenses) {
      await updateRow('expenses', exp.id, { ...exp, status: 'ANNULEE', updated_at: new Date().toISOString(), _needs_sync: 1 });
    }
  }
};


/**
 * Crée une entrée de journal d'activité dans la table locale activity_logs.
 * Appelée après chaque écriture offline réussie pour que l'historique
 * reflète les actions hors-ligne.
 */
const createActivityLogLocally = async (
  method: string,
  tableName: string,
  data?: any,
  action?: string,
  id?: number
): Promise<void> => {
  try {
    // Récupérer les infos utilisateur depuis AsyncStorage
    const userIdStr = await AsyncStorage.getItem('user_id');
    const userName = await AsyncStorage.getItem('user_name') || 'Utilisateur';
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;

    const moduleLabel = TABLE_MODULE_MAP[tableName] || tableName;
    let baseAction = action
      ? { archive: 'Archivage', reactivate: 'Réactivation', complete: 'Complétion', approve: 'Approbation', reject: 'Rejet', mark_as_viewed: 'Consultation', clock_in: 'Pointage arrivée', clock_out: 'Pointage départ', convert_to_vendable: 'Conversion' }[action] || `${getActionLabel(method, tableName)} ${moduleLabel}`
      : `${getActionLabel(method, tableName)} ${moduleLabel}`;

    if (method === 'POST') {
      if (tableName === 'feed_purchases' || tableName === 'health_purchases') {
        baseAction = `Achat ${moduleLabel}`;
      } else if (tableName === 'feed_preparations') {
        baseAction = `Préparation ${moduleLabel}`;
      }
    }
    const actionLabel = baseAction;
    const description = buildDescription(tableName, method, data, action);
    const now = new Date().toISOString();

    // Extraire farm_id et lot_id des données si disponibles (supporte les deux formes).
    // 🔧 Pour une modification/suppression de lot ou ferme, l'entité elle-même
    // n'a pas de champ lot_id/farm_id pointant vers elle-même → utiliser l'ID passé.
    const farmId = data?.farm_id || data?.farm || (tableName === 'farms' && typeof id === 'number' ? id : null) || null;
    const lotId = data?.lot_id || data?.lot || (tableName === 'lots' && typeof id === 'number' ? id : null) || null;

    const logRow: Record<string, any> = {
      // Ne pas spécifier id — SQLite INTEGER PRIMARY KEY auto-incrémente.
      // Forcer id: 0 empêchait tout log au-delà du premier (UNIQUE constraint).
      user_id: userId || 0,
      user_name: userName,
      action: actionLabel,
      module: moduleLabel,
      description,
      date: now,
      farm_id: farmId,
      lot_id: lotId,
      related_id: id || null,
      _needs_sync: 0, // log local preview-only — version serveur (signal Django) la remplace au pull
    };

    // Ne pas générer de logs pour les modifications de logs eux-mêmes
    if (tableName === 'activity_logs') return;

    // 🔧 Anti-doublon local strict : éviter d'insérer un log identique (action + module + description)
    // s'il existe déjà un log local (_needs_sync = 0) créé il y a moins de 5 secondes
    try {
      const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
      const recentDupes = await queryAll<any>(
        `SELECT id FROM activity_logs WHERE action = ? AND module = ? AND description = ? AND _needs_sync = 0 AND date > ? LIMIT 1`,
        [actionLabel, moduleLabel, description, fiveSecondsAgo]
      );
      if (recentDupes.length > 0) {
        return;
      }
    } catch { /* continue */ }

    // Récupérer le nom du lot pour les logs si lot_id est présent
    if (lotId !== null && lotId !== undefined) {
      try {
        const lot = await fetchRow<any>('lots', 'id = ?', [lotId]);
        if (lot) logRow.lot_name = lot.name;
      } catch {
        // best-effort, le nom n'est pas critique
      }
    }

    await insertRow('activity_logs', logRow);
    // Ne pas enqueue le log — il sera créé côté serveur par les signaux lors du sync
    // des données métier. Éviter les doublons.
  } catch (e: any) {
    // Silencieux — le log d'activité est best-effort en mode offline
    console.warn(`[Offline] Échec création log local:`, e?.message || e);
  }
};

/**
 * Point d'entrée des écritures offline. Tout le travail (validation, INSERT
 * principal, paiement initial, miroirs de signaux, log, mise en file de sync)
 * s'exécute dans UNE transaction SQLite : en cas d'échec à n'importe quelle
 * étape, tout est annulé (plus de vente/mouvement à moitié écrit).
 */
export const handleOfflineWrite = async <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, data?: any): Promise<T> => {
  return runInTransaction(() => handleOfflineWriteInner<T>(method, endpoint, data));
};

const handleOfflineWriteInner = async <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, data?: any): Promise<T> => {
  const parsed = parseEndpoint(endpoint);
  const { tableName, id, action } = parsed;
  if (!tableName) {
    throw new Error(`Offline storage for endpoint not supported: ${endpoint}`);
  }

  // --- POST avec action mais sans ID (ex: /attendances/clock_in/, /attendances/clock_out/) ---
  if (method === 'POST' && action && typeof id !== 'number') {
    await applyActionLocally(tableName, undefined, action, data);
    await safeEnqueue('CREATE', endpoint, data || {}, null, tableName);
    await createActivityLogLocally('POST', tableName, data, action);
    // Retourner l'enregistrement affecté
    if (action === 'clock_in' || action === 'clock_out') {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const lot_id = data?.lot_id;
      if (lot_id) {
        const rows = await queryAll<any>(
          `SELECT * FROM attendances WHERE date = ? AND lot_id = ? LIMIT 1`,
          [today, lot_id]
        );
        if (rows.length > 0) return rows[0] as unknown as T;
      }
    }
    // 🔧 /employees/me/ (via handleOfflineWrite action) — retourne l'employé courant
    if (action === 'me') {
      return {} as T;
    }
    return {} as T;
  }

  // --- POST avec action ET ID (ex: /employee-requests/27/approve/, /health-alerts/42/mark_as_viewed/) ---
  if (method === 'POST' && action && typeof id === 'number') {
    await applyActionLocally(tableName, id, action, data);
    // Enqueue as CREATE so SyncManager will use HTTP POST for action endpoints
    await safeEnqueue('CREATE', endpoint, data || {}, id, tableName);
    await createActivityLogLocally('POST', tableName, { ...data, id }, action);
    // Retourner l'enregistrement affecté
    const row = await fetchRow<any>(tableName, 'id = ?', [id]);
    if (row) return row as unknown as T;
    return {} as T;
  }

  // --- Validation métier avant écriture (bloquante pour les règles critiques) ---
  try {
    if (method === 'POST') {
      await validateLotNotArchived(tableName, data);
      await validateChickenStockForSale(data);
      await validateEggStockIntegrity(data);
      await validatePayrollUniqueness(data);
      if (tableName === 'chicken_movements') await validateChickenMovement(data);
      if (tableName === 'lots') await validateFarmCapacity(data);
      if (tableName === 'feeds') await validateFeedStockIntegrity(data);
      if (tableName === 'health_records') await validateHealthStockIntegrity(data);
      if (tableName === 'egg_conversions') await validateEggConversion(data);
      if (tableName === 'sale_payments') await validateSalePayment(data);
    }
    if (method === 'PUT' || method === 'PATCH') {
      const existingRecord = typeof id === 'number' ? await fetchRow<any>(tableName, 'id = ?', [id]) : null;
      await validateLotNotArchived(tableName, data, existingRecord);
      await validateEggStockIntegrity(data, existingRecord);
      if (tableName === 'payrolls') await validatePayrollUniqueness(data, existingRecord);
      if (tableName === 'chicken_movements') await validateChickenMovement(data, existingRecord);
      if (tableName === 'lots') await validateFarmCapacity(data, typeof id === 'number' ? id : undefined);
      if (tableName === 'feeds') await validateFeedStockIntegrity(data, existingRecord);
      if (tableName === 'health_records') await validateHealthStockIntegrity(data, existingRecord);
      if (tableName === 'egg_conversions') await validateEggConversion(data);
      if (tableName === 'sale_payments') await validateSalePayment(data, existingRecord);
    }
  } catch (validationErr: any) {
    // 🔧 TOUTES les erreurs de validation métier sont BLOQUANTES en mode offline.
    // Avant, seules certaines l'étaient (capacité, stock) → GUERI sans MALADE
    // passait silencieusement, lot archivé bloquait pas, etc.
    const msg = validationErr?.message || String(validationErr);
    const lower = msg.toLowerCase();
    const isCritical =
      lower.includes('capacité') ||
      lower.includes('danger') ||
      lower.includes('stock') ||
      lower.includes('insuffisant') ||
      lower.includes('paie existe déjà') ||
      lower.includes('guéris') ||
      lower.includes('guérison') ||
      lower.includes('malades') ||
      lower.includes('archivé') ||
      lower.includes('terminé') ||
      lower.includes('dépasserait');

    if (isCritical || !validationErr?.message) {
      throw validationErr; // ← Bloque l'écriture offline
    }

    // Si on arrive ici, c'est une erreur inconnue → on bloque par sécurité
    console.error(`[Offline] Validation métier rejetée pour ${endpoint}:`, msg);
    throw validationErr;
  }

  // --- POST avec action sur un ID existant (ex: /productions/5/convert_to_vendable/) ---
  if (method === 'POST' && typeof id === 'number' && action) {
    await applyActionLocally(tableName, id, action, data);
    await safeEnqueue('CREATE', endpoint, data || {}, id, tableName);
    const current = await fetchRow<T>(tableName, 'id = ?', [id]);
    await createActivityLogLocally('POST', tableName, {
      ...(data || {}),
      lot_id: (current as any)?.lot_id,
      farm_id: (current as any)?.farm_id,
    }, action, id);
    return (current || ({} as T)) as T;
  }

  // --- POST simple (création) ---
  if (method === 'POST') {
    const localId = await getNextOfflineId();
    const now = new Date().toISOString();
    let row = {
      status: data.status || 'ACTIF',
      ...data,
      id: localId,
      _needs_sync: 1,
      created_at: now,
      updated_at: now,
    };
    // Mapper les FK : formulaire utilise 'farm', SQLite a 'farm_id'
    try {
      const columns = await getTableInfo(tableName);
      row = mapForeignKeyFields(new Set(columns.map(c => c.name)), row);
    } catch { /* si la table n'existe pas encore, on insère quand même */ }

    // 🔧 Résolution des FK NOT NULL absentes du payload (farm_id / lot_id).
    // Plusieurs serializers backend dérivent `farm`/`lot` côté serveur :
    //   • EggConversionSerializer.validate → farm = lot.farm  (Production n'a pas de `farm`)
    //   • SalePaymentSerializer            → lot/farm dérivés de la vente
    // Le formulaire ne les envoie donc pas. Sans ce miroir, l'INSERT SQLite viole
    // `farm_id NOT NULL` (« Error finalizing statement ») → opération perdue hors-ligne,
    // et pour une vente à crédit : créance faussée (paiement initial jamais créé).
    if (tableName === 'egg_conversions' || tableName === 'sale_payments') {
      let resolvedLotId = (row as any).lot_id || (row as any).lot;
      if (!resolvedLotId && (row as any).sale_id) {
        try {
          const parentSale = await fetchRow<any>('sales', 'id = ?', [(row as any).sale_id]);
          if (parentSale?.lot_id) resolvedLotId = parentSale.lot_id;
        } catch { /* best-effort */ }
      }
      if (resolvedLotId && (!(row as any).farm_id || !(row as any).lot_id)) {
        try {
          const parentLot = await fetchRow<any>('lots', 'id = ?', [resolvedLotId]);
          if (parentLot) {
            if (!(row as any).lot_id) (row as any).lot_id = parentLot.id;
            if (!(row as any).farm_id && parentLot.farm_id) (row as any).farm_id = parentLot.farm_id;
          }
        } catch { /* best-effort : l'INSERT lèvera une erreur claire si farm_id manque */ }
      }
    }

    // 🔧 Remplir employee_id / farm_id / employee_name / farm_name d'une demande
    // d'employé créée hors-ligne — miroir de EmployeeRequestViewSet.perform_create qui,
    // côté serveur, remplit employee=employee_profile et farm=employee.farm depuis
    // l'utilisateur authentifié (champs read_only dans EmployeeRequestSerializer). Le
    // formulaire n'envoie que {type, description}, donc sans ce miroir les colonnes
    // employee_id / farm_id (NOT NULL dans SQLite) restaient absentes → l'INSERT
    // SQLite échouait silencieusement et la demande n'était jamais créée hors-ligne.
    if (tableName === 'employee_requests') {
      try {
        const userIdStr = await AsyncStorage.getItem('user_id');
        const userId = userIdStr ? parseInt(userIdStr, 10) : null;
        const emp = userId
          ? await fetchRow<any>('employees', 'user_id = ?', [userId])
          : null;
        if (emp) {
          row.employee_id = emp.id;
          row.farm_id = emp.farm_id || emp.farm;
          row.employee_name = emp.user_name || '';
          row.farm_name = emp.farm_name || '';
        }
      } catch { /* best-effort : sans profil employé, la NOT NULL constraint remonte une erreur claire (miroir du ValidationError backend) */ }
      // Le statut par défaut d'une demande est PENDING (miroir du modèle Django),
      // et non 'ACTIVE' comme les transactions annulables.
      row.status = 'PENDING';
    }

    // 🔧 Remplir les champs dénormalisés de l'employé (miroir de l'API)
    if (tableName === 'employees' && row.user_id) {
      try {
        const user = await fetchRow<any>('users', 'id = ?', [row.user_id]);
        if (user) {
          row.user_name = user.name || user.username || '';
          row.user_email = user.email || '';
          row.user_phone = user.phone || '';
        }
      } catch { /* ignore */ }

      // 🔧 Remplir farm_name depuis la table farms
      const farmId = row.farm_id || row.farm;
      if (farmId) {
        try {
          const farm = await fetchRow<any>('farms', 'id = ?', [farmId]);
          if (farm) {
            row.farm_name = farm.name || '';
          }
        } catch { /* ignore */ }
      }

      // 🔧 Construire lots_json depuis les assignments (lots: [id1, id2, ...])
      const lotIds = row.lots;
      if (lotIds && Array.isArray(lotIds) && lotIds.length > 0) {
        try {
          const lotsDetail: any[] = [];
          for (const lid of lotIds) {
            const lot = await fetchRow<any>('lots', 'id = ?', [lid]);
            if (lot) {
              lotsDetail.push({ id: lot.id, name: lot.name, farm: lot.farm_id || lot.farm });
            }
          }
          if (lotsDetail.length > 0) {
            row.lots_json = JSON.stringify(lotsDetail);
          }
        } catch { /* ignore */ }
      }
    }

    await insertRow(tableName, row);
    await safeEnqueue('CREATE', endpoint, data, localId, tableName);

    // Mise à jour de lots.current_quantity pour les mouvements de poules
    if (tableName === 'chicken_movements') {
      await updateLotQuantityForMovement(row);
      // 🔧 Créer health_alert locale pour MORT et MALADE (miroir du signal Django)
      await createHealthAlertLocally(row);
    }

    // 🔧 Nouvelle conversion de casiers : notifier les productions du lot pour que
    // « casiers en attente / vendables » se recalculent immédiatement à l'écran.
    if (tableName === 'egg_conversions') {
      emitDataChange({ tableName: 'productions', action: 'UPDATE' });
    }

    // 🔧 Mise à jour de lots.current_quantity pour les ventes de poules (CHICKEN)
    if (tableName === 'sales') {
      if ((row as any)?.product_type === 'CHICKEN') {
        await updateLotQuantityForSale(row);
      }
      // Si paiement initial > 0, on simule la création du SalePayment (miroir du backend perform_create)
      const initialAmountPaid = parseFloat((row as any)?.amount_paid || '0');
      if (initialAmountPaid > 0) {
        const paymentLocalId = await getNextOfflineId();
        // 🔧 sale_payments.farm_id / lot_id sont NOT NULL. Ni la vente (modèle Django
        // Sale n'a que `lot`) ni le formulaire n'envoient `farm` → sans résolution
        // depuis le lot, l'INSERT échouait (« Error finalizing statement ») et la
        // vente restait à moitié écrite (ligne + stock OK, paiement + log KO →
        // créance faussée, aucun historique côté Détail du lot).
        let saleLotId = (row as any)?.lot_id || (row as any)?.lot;
        let saleFarmId = (row as any)?.farm_id || (row as any)?.farm;
        if (saleLotId && !saleFarmId) {
          try {
            const parentLot = await fetchRow<any>('lots', 'id = ?', [saleLotId]);
            if (parentLot?.farm_id) saleFarmId = parentLot.farm_id;
          } catch { /* best-effort */ }
        }
        const paymentRow = {
          id: paymentLocalId,
          sale_id: localId,
          farm_id: saleFarmId,
          lot_id: saleLotId,
          amount: initialAmountPaid,
          payment_method: 'CASH',
          payment_date: (row as any)?.date || now.split('T')[0],
          reference: 'INITIAL',
          note: 'Paiement initial lors de la vente',
          status: 'ACTIF',
          created_at: now,
          updated_at: now,
          _needs_sync: 0 // Pas besoin d'enfiler ce SalePayment, le backend va le créer tout seul grâce au amount_paid de la vente !
        };
        await insertRow('sale_payments', paymentRow);
        // Recaler amount_paid + payment_status de la vente sur la somme réelle des
        // paiements ACTIFS (miroir du signal Django SalePayment.post_save).
        await recalculateSalePaymentStatusLocally(localId);
      }
    }

    // 🔧 Recalcul inventaire local après achat (miroir des signaux Django)
    if (tableName === 'feed_purchases') {
      await recalculateFeedInventoryLocally((row as any)?.lot_id);
    }
    if (tableName === 'health_purchases') {
      await recalculateHealthInventoryLocally((row as any)?.lot_id);
    }
    // 🔧 Recalcul inventaire après distribution (consomme le stock préparé)
    if (tableName === 'feeds') {
      await recalculatePreparedFeedInventoryLocally((row as any)?.lot_id);
    }
    // 🔧 Recalcul inventaire santé après traitement (consomme le stock)
    if (tableName === 'health_records') {
      await recalculateHealthInventoryLocally((row as any)?.lot_id);
    }
    // 🔧 Recalcul inventaire après préparation d'aliment (consomme matières premières, produit aliment préparé)
    if (tableName === 'feed_preparations') {
      await recalculatePreparedFeedInventoryLocally((row as any)?.lot_id);
      await recalculateFeedInventoryLocally((row as any)?.lot_id);
    }
    // 🔧 Recalcul coût lot après ajout d'un frais (miroir signal Django)
    if (tableName === 'lot_expenses') {
      await recalculateLotCostLocally((row as any)?.lot_id);
    }
    // 🔧 Recalcul statut de paiement après un paiement (miroir signal Django)
    if (tableName === 'sale_payments') {
      await recalculateSalePaymentStatusLocally((row as any)?.sale_id || (row as any)?.sale);
    }
    
    // 🔧 Création des dépenses liées (miroir signaux)
    await syncLocalExpense(tableName, row, 'POST');

    // 🔧 Créer un log d'activité local
    // Parité backend : LotViewSet et FarmViewSet n'ont pas de perform_create → pas de log
    if (tableName !== 'lots' && tableName !== 'farms') {
      await createActivityLogLocally('POST', tableName, row, undefined, localId);
    }

    return row as T;
  }

  // --- PUT / PATCH avec action (ex: /farms/5/archive/) ---
  if ((method === 'PUT' || method === 'PATCH') && typeof id === 'number' && action) {
    const current = await fetchRow<any>(tableName, 'id = ?', [id]);
    const baseUpdatedAt = current?._needs_sync === 0 ? current.updated_at : undefined;
    await applyActionLocally(tableName, id, action, data);
    // Ne pas enfiler si c'est un item local preview-only (id < 0 && _needs_sync === 0)
    if (!(id < 0 && current?._needs_sync === 0)) {
      await safeEnqueue('UPDATE', endpoint, { ...(data || {}), _base_updated_at: baseUpdatedAt }, id, tableName);
    }
    await createActivityLogLocally('PUT', tableName, { lot_id: current?.lot_id, farm_id: current?.farm_id }, action, id);
    const updated = await fetchRow<T>(tableName, 'id = ?', [id]);
    return (updated || ({} as T)) as T;
  }

  // --- PUT / PATCH simple (mise à jour) ---
  if (method === 'PUT' || method === 'PATCH') {
    if (typeof id !== 'number') {
      throw new Error(`Cannot update resource without id in endpoint: ${endpoint}`);
    }
    const current = await fetchRow<any>(tableName, 'id = ?', [id]);
    // Capturer le updated_at serveur AVANT modification, pour détection de conflits
    const baseUpdatedAt = current && current._needs_sync === 0 ? current.updated_at : undefined;
    const now = new Date().toISOString();

    // 🔧 Aplatir les FormData (ex: upload photo profil) en objet simple.
    // React Native FormData stocke ses entrées dans _parts: [[key, value], ...]
    let effectiveData = data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const fd = data as any;
      if (fd._parts && Array.isArray(fd._parts)) {
        const flat: Record<string, any> = {};
        for (const part of fd._parts) {
          if (Array.isArray(part) && part.length >= 2) {
            const key = part[0];
            const val = part[1];
            if (typeof val === 'object' && val !== null && val.uri) {
              flat[key] = val.uri;
              // Garder le nom de fichier pour la synchro future
              flat._local_image = true;
            } else {
              flat[key] = val !== null && val !== undefined ? val : null;
            }
          }
        }
        if (Object.keys(flat).length > 0) effectiveData = flat;
      }
    }

    let updated = current
      ? { ...current, ...effectiveData, _needs_sync: 1, updated_at: now }
      : { ...effectiveData, id, _needs_sync: 1, created_at: now, updated_at: now };

    // Mapper les FK avant écriture pour éviter 'no such column: farm'
    try {
      const columns = await getTableInfo(tableName);
      updated = mapForeignKeyFields(new Set(columns.map(c => c.name)), updated);
    } catch { /* si la table n'existe pas, on continue */ }

    // 🔧 Reconstruction de lots_json pour un employé mis à jour (affectation de lots).
    // Sans cela, une affectation offline mettait à jour la base via la Sync Queue mais
    // la colonne locale employees.lots_json (lue par l'interface employé) restait inchangée
    // → « Aucune affectation » jusqu'à reconnexion.
    // Miroir du branche POST ci-dessus. Gère aussi la REVOCATION (lots = [] → lots_json = '[]').
    if (tableName === 'employees' && effectiveData && Array.isArray((effectiveData as any).lots)) {
      try {
        const lotIds = (effectiveData as any).lots as number[];
        const lotsDetail: any[] = [];
        for (const lid of lotIds) {
          const lot = await fetchRow<any>('lots', 'id = ?', [lid]);
          if (lot) {
            lotsDetail.push({ id: lot.id, name: lot.name, farm: lot.farm_id || lot.farm });
          }
        }
        updated.lots_json = JSON.stringify(lotsDetail);
      } catch { /* ignore */ }
    }

    if (current) {
      await updateRow(tableName, id, updated);
    } else {
      await insertRow(tableName, updated);
    }

    // 🔧 Re-tirer user_name/user_email depuis la table users si un employee est mis à jour
    if (tableName === 'users' && effectiveData?.profile_image) {
      // L'image a été stockée localement comme URI → propre à l'affichage immédiat
    }

    // 🔧 Mise à jour des stocks pour les modifications de mouvements/ventes de poules
    if (tableName === 'chicken_movements') {
      await updateLotQuantityForMovement(updated, current);
    }
    if (tableName === 'sales') {
      await updateLotQuantityForSale(updated, current);
    }

    // 🔧 Recalcul inventaire après modification d'un achat ou distribution/traitement
    if (tableName === 'feed_purchases') {
      await recalculateFeedInventoryLocally(updated.lot_id || current?.lot_id);
    }
    if (tableName === 'health_purchases') {
      await recalculateHealthInventoryLocally(updated.lot_id || current?.lot_id);
    }
    if (tableName === 'feeds') {
      await recalculatePreparedFeedInventoryLocally(updated.lot_id || current?.lot_id);
    }
    if (tableName === 'health_records') {
      await recalculateHealthInventoryLocally(updated.lot_id || current?.lot_id);
    }
    if (tableName === 'feed_preparations') {
      await recalculatePreparedFeedInventoryLocally(updated.lot_id || current?.lot_id);
      await recalculateFeedInventoryLocally(updated.lot_id || current?.lot_id);
    }
    // 🔧 Recalcul coût lot après modification d'un frais
    if (tableName === 'lot_expenses') {
      await recalculateLotCostLocally(updated.lot_id || current?.lot_id);
    }
    // 🔧 Recalcul statut de paiement après un paiement
    if (tableName === 'sale_payments') {
      await recalculateSalePaymentStatusLocally(updated.sale_id || updated.sale || current?.sale_id || current?.sale);
    }

    // 🔧 MAJ des dépenses liées
    await syncLocalExpense(tableName, updated, 'PUT');

    if (!(id < 0 && current?._needs_sync === 0)) {
      const pendingItem = await getSyncQueueItemByLocalId(id, tableName).catch(() => null);
      if (pendingItem) {
        const mergedPayload = {
          ...(JSON.parse(pendingItem.payload_json) || {}),
          ...(effectiveData || {}),
        };
        await updateSyncQueueItem(pendingItem.id, {
          payload_json: JSON.stringify(mergedPayload),
        });
        if (pendingItem.operation === 'CREATE') {
          // Si l'objet a été créé offline, on fusionne simplement la mise à jour
          // dans le CREATE existant. Le CREATE portable contient désormais les
          // dernières modifications, et aucun UPDATE séparé n'est nécessaire.
          return updated as T;
        }
        if (pendingItem.operation === 'UPDATE') {
          return updated as T;
        }
      }
      await safeEnqueue('UPDATE', endpoint, { ...(effectiveData || {}), _base_updated_at: baseUpdatedAt }, id, tableName);
    }
    // 🔧 Passer l'entité complète mise à jour pour que la description soit significative
    // (ex: "Distribution de 20 kg d'aliment" au lieu du générique "PUT sur feeds")
    // Parité backend : le backend ne crée PAS de log lors de la modification d'un lot
    if (tableName !== 'lots') {
      await createActivityLogLocally('PUT', tableName, updated, undefined, id);
    }
    return updated as T;
  }

  // --- DELETE avec action (aucune action DELETE standard actuellement) ---
  if (method === 'DELETE' && typeof id === 'number' && action) {
    const current = await fetchRow<any>(tableName, 'id = ?', [id]);

    // 🔧 Soft-delete pour les tables annulables : marquer ANNULEE au lieu de supprimer.
    // L'item reste visible dans l'interface comme "annulé" (comme en mode online).
    if (current && CANCELLABLE_TABLES.has(tableName)) {
      await updateRow(tableName, id, { ...current, status: 'ANNULEE', _needs_sync: 1, updated_at: new Date().toISOString() });
    } else if (current) {
      try { await deleteRow(tableName, id); } catch { /* ignore */ }
    }

    // 🔧 Si l'item a été créé offline (id négatif) et n'a pas encore été syncé,
    // on annule le CREATE correspondant au lieu d'envoyer un DELETE au serveur
    // (le serveur ne connaît pas cet item).
    if (id < 0) {
      const pendingCreate = await getSyncQueueItemByLocalId(id, tableName).catch(() => null);
      if (pendingCreate && pendingCreate.operation === 'CREATE') {
        await deleteSyncQueueItem(pendingCreate.id).catch(() => {});
        console.info(`[Offline] DELETE item local #${id} → annulation du CREATE pending`);
        if (current && tableName !== 'lots') {
          await createActivityLogLocally('DELETE', tableName, current, action, id);
        }
        return (CANCELLABLE_TABLES.has(tableName) && current)
          ? { ...current, status: 'ANNULEE' } as unknown as T
          : {} as T;
      }
    }

    const resolvedEndpoint = id < 0 ? await replaceLocalIdInEndpoint(endpoint, tableName, id) : endpoint;
    await safeEnqueue('DELETE', resolvedEndpoint, {}, id, tableName);
    if (current && tableName !== 'lots') {
      await createActivityLogLocally('DELETE', tableName, current, action, id);
    }
    return (CANCELLABLE_TABLES.has(tableName) && current)
      ? { ...current, status: 'ANNULEE' } as unknown as T
      : (current || ({} as T)) as T;
  }

  // --- DELETE simple ---
  if (method === 'DELETE') {
    if (typeof id !== 'number') {
      throw new Error(`Cannot delete resource without id in endpoint: ${endpoint}`);
    }
    const current = await fetchRow<T>(tableName, 'id = ?', [id]);

    // 🔧 Soft-delete pour les tables annulables : marquer ANNULEE au lieu de supprimer.
    if (current && CANCELLABLE_TABLES.has(tableName)) {
      const updated = { ...(current as any), status: 'ANNULEE', _needs_sync: 1, updated_at: new Date().toISOString() };
      await updateRow(tableName, id, updated);

      // Mise à jour des stocks suite à l'annulation
      if (tableName === 'chicken_movements') {
        await updateLotQuantityForMovement(updated, current);
      }
      if (tableName === 'sales') {
        await updateLotQuantityForSale(updated, current);
      }
      // 🔧 Recalcul inventaire après annulation d'un achat
      if (tableName === 'feed_purchases') {
        await recalculateFeedInventoryLocally((current as any)?.lot_id);
      }
      if (tableName === 'health_purchases') {
        await recalculateHealthInventoryLocally((current as any)?.lot_id);
      }
      if (tableName === 'feeds') {
        await recalculatePreparedFeedInventoryLocally((current as any)?.lot_id);
      }
      if (tableName === 'health_records') {
        await recalculateHealthInventoryLocally((current as any)?.lot_id);
      }
      if (tableName === 'feed_preparations') {
        await recalculatePreparedFeedInventoryLocally((current as any)?.lot_id);
        await recalculateFeedInventoryLocally((current as any)?.lot_id);
      }
      if (tableName === 'lot_expenses') {
        await recalculateLotCostLocally((current as any)?.lot_id);
      }
      // 🔧 Recalcul statut de paiement après annulation d'un paiement
      if (tableName === 'sale_payments') {
        await recalculateSalePaymentStatusLocally((current as any)?.sale_id || (current as any)?.sale);
      }

      // 🔧 Annulation d'une conversion de casiers : les « casiers en attente » /
      // « vendables » sont recalculés côté écran à partir de la liste des
      // conversions ACTIVES. On notifie donc les productions du lot pour forcer
      // ce recalcul (sinon la section reste figée sur l'ancienne valeur).
      if (tableName === 'egg_conversions') {
        emitDataChange({ tableName: 'productions', action: 'UPDATE' });
        emitDataChange({ tableName: 'egg_conversions', action: 'DELETE' });
      }

      // 🔧 Annulation des alertes santé et dépenses liées
      if (tableName === 'chicken_movements') {
        await cancelHealthAlertLocally(updated);
      }
      await syncLocalExpense(tableName, updated, 'DELETE');
      
    } else if (current) {
      await deleteRow(tableName, id);
    }

    // 🔧 Item créé offline et non syncé → annuler le CREATE, pas de DELETE serveur
    if (id < 0) {
      const pendingCreate = await getSyncQueueItemByLocalId(id, tableName).catch(() => null);
      if (pendingCreate && pendingCreate.operation === 'CREATE') {
        await deleteSyncQueueItem(pendingCreate.id).catch(() => {});
        console.info(`[Offline] DELETE item local #${id} → annulation du CREATE pending`);
        if (current && tableName !== 'lots') {
          await createActivityLogLocally('DELETE', tableName, current, undefined, id);
        }
        return (CANCELLABLE_TABLES.has(tableName) && current)
          ? { ...current, status: 'ANNULEE' } as unknown as T
          : {} as T;
      }
    }

    const resolvedEndpoint = id < 0 ? await replaceLocalIdInEndpoint(endpoint, tableName, id) : endpoint;
    await safeEnqueue('DELETE', resolvedEndpoint, {}, id, tableName);
    if (current && tableName !== 'lots') {
      await createActivityLogLocally('DELETE', tableName, current, undefined, id);
    }
    return (CANCELLABLE_TABLES.has(tableName) && current)
      ? { ...current, status: 'ANNULEE' } as unknown as T
      : {} as T;
  }

  throw new Error(`Unsupported offline method: ${method}`);
};

export const buildLocalResponse = <T>(data: T): AxiosResponse<T> => localResponse(data);
