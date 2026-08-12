import { deleteDatabaseAsync, openDatabaseAsync, SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { SCHEMA_SQL, NEXT_NEGATIVE_ID_SQL, VERSION, MIGRATIONS } from './schema';
import { emitDataChange } from '../utils/dataEvents';

// Normalisation des statuts entre l'ancien token 'ACTIVE' et le token backend 'ACTIF'
const normalizeStatusValue = (val: any): any => {
  if (typeof val !== 'string') return val;
  if (val.toUpperCase() === 'ACTIVE') return 'ACTIF';
  return val;
};

const normalizeRowStatuses = (row: any): any => {
  if (!row || typeof row !== 'object') return row;
  if (typeof row.status === 'string') row.status = normalizeStatusValue(row.status);
  return row;
};

const normalizePayloadStatuses = (payload: any): any => {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(normalizePayloadStatuses);
  if (typeof payload === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'status' && typeof v === 'string') out[k] = normalizeStatusValue(v);
      else out[k] = normalizePayloadStatuses(v);
    }
    return out;
  }
  return payload;
};

const DB_NAME = 'SolFermeOffline.db';
let db: SQLiteDatabase | null = null;

// ========== MUTEX GLOBAL ==========
// Expo SQLite sur Android crash (NullPointerException) quand plusieurs
// prepareAsync/execAsync s'exécutent en parallèle sur la même database.
// Ce mutex sérialise TOUTES les opérations pour éviter la corruption native.
let dbLock: Promise<void> = Promise.resolve();
let dbLockQueue = 0;

const acquireDbLock = async (): Promise<() => void> => {
  const prevLock = dbLock;
  let releaseLock: () => void;
  dbLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  dbLockQueue++;
  if (dbLockQueue > 5) {
    console.warn(`[DB] File d'attente DB: ${dbLockQueue} opérations en attente`);
  }
  await prevLock;
  dbLockQueue--;
  return releaseLock!;
};

// ========== GESTION DU HANDLE ==========
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 2;
let isResetting = false;

/** Close and reset the global handle */
export const resetDatabaseHandle = async (): Promise<void> => {
  if (db) {
    try { await db.closeAsync(); } catch { /* ignore */ }
    db = null;
  }
};

/** 🔧 Vider TOUTES les tables locales sans toucher au schéma */
export const wipeAllLocalTables = async (): Promise<void> => {
  const release = await acquireDbLock();
  try {
    if (!db) {
      db = await openDatabaseAsync(DB_NAME);
      try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch {}
    }
    // Liste des tables à vider (ordre inverse des FK pour éviter contraintes)
    const tables = [
      'activity_logs', 'health_alerts', 'employee_requests', 'bonuses',
      'reminders', 'tasks', 'attendances', 'payrolls',
      'feed_preparation_ingredients', 'feed_preparations',
      'prepared_feed_inventory', 'health_inventory', 'feed_inventory',
      'health_purchases', 'feed_purchases',
      'expenses', 'employees', 'health_records', 'feeds',
      'chicken_movements', 'sales', 'productions',
      'lot_expenses', 'lots', 'farms', 'users',
      // Tables techniques
      'sync_queue', 'id_mapping',
    ];
    for (const table of tables) {
      try { await db.runAsync(`DELETE FROM ${table}`); } catch {}
    }
    // Réinitialiser le compteur d'IDs négatifs
    try { await db.runAsync(`DROP TABLE IF EXISTS _next_offline_id`); } catch {}
  } finally {
    release();
  }
};

/** Re-open a fresh DB connection (protégé par le mutex) */
const openDb = async (): Promise<SQLiteDatabase> => {
  const release = await acquireDbLock();
  try {
    if (!db) {
      db = await openDatabaseAsync(DB_NAME);
      try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
    }
    return db;
  } finally {
    release();
  }
};

/**
 * Reconstruction complète de la base sans deleteDatabaseAsync
 * (qui échoue si d'autres opérations ont des références au fichier).
 * On DROP toutes les tables puis on recrée le schéma.
 */
const rebuildDatabase = async (): Promise<SQLiteDatabase> => {
  const release = await acquireDbLock();
  try {
    if (isResetting) {
      release();
      await new Promise(r => setTimeout(r, 500));
      return openDb();
    }
    isResetting = true;
    console.warn('[DB] Corruption persistante — reconstruction complète...');

    // 1. Fermer le handle existant
    if (db) {
      try { await db.closeAsync(); } catch { /* ignore */ }
      db = null;
    }

    // 2. Réouvrir
    db = await openDatabaseAsync(DB_NAME);
    try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }

    // 3. Supprimer toutes les tables existantes
    try {
      const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      for (const row of tables) {
        try { await db.execAsync(`DROP TABLE IF EXISTS "${row.name}"`); } catch { /* ignore */ }
      }
    } catch {
      // Fallback: recréer quand même (les CREATE TABLE IF NOT EXISTS tolèrent)
    }

    // 4. Recréer le schéma
    for (const statement of SCHEMA_SQL) {
      try { await db.execAsync(statement); } catch { /* ignore */ }
    }

    // 5. Réinitialiser la version
    try {
      await db.execAsync('CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY)');
      await db.runAsync('INSERT OR REPLACE INTO _schema_version (version) VALUES (?)', [VERSION]);
    } catch { /* ignore */ }

    console.info('[DB] Base de données reconstruite avec succès.');
    consecutiveFailures = 0;
    isResetting = false;
    return db;
  } catch (e: any) {
    console.error('[DB] Échec reconstruction:', e?.message || e);
    isResetting = false;
    throw e;
  } finally {
    release();
  }
};

/** Execute une opération SQL avec mutex et retry automatique */
const runWithRetry = async <T>(fn: (database: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const release = await acquireDbLock();
  try {
    if (!db) {
      db = await openDatabaseAsync(DB_NAME);
      try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
    }
    const result = await fn(db);
    consecutiveFailures = 0;
    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isCorrupted = msg.includes('NullPointerException') ||
                        msg.includes('prepareAsync') ||
                        msg.includes('execAsync') ||
                        msg.includes('finalizeAsync');
    if (isCorrupted) {
      consecutiveFailures++;
      console.warn(`[DB] Handle corrompu (tentative ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})...`);
      if (db) {
        try { await db.closeAsync(); } catch { /* ignore */ }
        db = null;
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // RebuildDatabase gère son propre lock → on libère d'abord
        release();
        db = await rebuildDatabase();
        // Ré-acquérir le lock pour le retry
        const newRelease = await acquireDbLock();
        try {
          const result = await fn(db);
          consecutiveFailures = 0;
          return result;
        } finally {
          newRelease();
        }
      }

      // Simple réouverture (lock toujours détenu)
      db = await openDatabaseAsync(DB_NAME);
      try { await db.execAsync('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
      const result = await fn(db);
      return result;
    }
    throw err;
  } finally {
    // Le lock est normalement déjà relâché dans le cas rebuild.
    // Dans les autres cas, release() est la fonction originale.
    try { release(); } catch { /* déjà relâché */ }
  }
};

export type SqliteRow = { [key: string]: any };
export type RowData = Record<string, any>;

const columnsAndPlaceholders = (data: RowData) => {
  const keys = Object.keys(data);
  return {
    columns: keys.join(', '),
    placeholders: keys.map(() => '?').join(', '),
    values: keys.map((key) => data[key]),
  };
};

export const runSqlAsync = async (sql: string, params: any[] = []): Promise<SQLiteRunResult> => {
  return runWithRetry((db) => db.runAsync(sql, params));
};

export const queryAll = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  const rows = await runWithRetry((db) => db.getAllAsync<T>(sql, params));
  try {
    return (rows || []).map((r: any) => normalizeRowStatuses(r));
  } catch { return rows; }
};

export const queryOne = async <T = any>(sql: string, params: any[] = []): Promise<T | null> => {
  const row = await runWithRetry((db) => db.getFirstAsync<T>(sql, params));
  try { return normalizeRowStatuses(row); } catch { return row; }
};

const filterDataForTable = async (table: string, data: RowData): Promise<RowData> => {
  try {
    const columnsInfo = await getTableInfo(table);
    if (!columnsInfo || columnsInfo.length === 0) return data;
    const validCols = new Set(columnsInfo.map(c => c.name));
    const filteredData: RowData = {};
    for (const key of Object.keys(data)) {
      if (validCols.has(key)) filteredData[key] = data[key];
    }
    return Object.keys(filteredData).length > 0 ? filteredData : data;
  } catch {
    return data;
  }
};

export const insertRow = async (table: string, data: RowData): Promise<SQLiteRunResult> => {
  const filteredData = await filterDataForTable(table, normalizePayloadStatuses(data));
  const { columns, placeholders, values } = columnsAndPlaceholders(filteredData);
  const result = await runSqlAsync(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, values);
  emitDataChange({ tableName: table, action: 'CREATE' });
  return result;
};

export const insertOrReplaceRow = async (table: string, data: RowData): Promise<SQLiteRunResult> => {
  const filteredData = await filterDataForTable(table, normalizePayloadStatuses(data));
  const { columns, placeholders, values } = columnsAndPlaceholders(filteredData);
  const result = await runSqlAsync(`INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`, values);
  emitDataChange({ tableName: table, action: 'SYNC' });
  return result;
};

export const updateRow = async (table: string, id: number, data: RowData): Promise<SQLiteRunResult> => {
  const filteredData = await filterDataForTable(table, normalizePayloadStatuses(data));
  const keys = Object.keys(filteredData);
  if (keys.length === 0) return { lastInsertRowId: 0, changes: 0 } as SQLiteRunResult;
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => filteredData[key]);
  const result = await runSqlAsync(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [...values, id]);
  emitDataChange({ tableName: table, id, action: 'UPDATE' });
  return result;
};

export const deleteRow = async (table: string, id: number): Promise<SQLiteRunResult> => {
  const result = await runSqlAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
  emitDataChange({ tableName: table, id, action: 'DELETE' });
  return result;
};

export const fetchRows = async <T = any>(table: string, whereClause = '1=1', params: any[] = []): Promise<T[]> => {
  return queryAll<T>(`SELECT * FROM ${table} WHERE ${whereClause}`, params);
};

export const fetchRow = async <T = any>(table: string, whereClause = '1=1', params: any[] = []): Promise<T | null> => {
  return queryOne<T>(`SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`, params);
};

export const getNextOfflineId = async (): Promise<number> => {
  const row = await queryOne<{ min_id: number }>(NEXT_NEGATIVE_ID_SQL);
  const minId = row?.min_id ?? 0;
  return minId < 0 ? minId - 1 : -1;
};

export const enqueueSyncQueue = async (
  operation: string,
  endpoint: string,
  payload: any,
  localId: number | null,
  tableName: string
): Promise<SQLiteRunResult> => {
  // Normaliser les statuts dans le payload avant d'enqueuer
  const normalizedPayload = normalizePayloadStatuses(payload);
  return insertRow('sync_queue', {
    operation,
    endpoint,
    payload_json: JSON.stringify(normalizedPayload),
    local_id: localId,
    table_name: tableName,
    created_at: new Date().toISOString(),
    status: 'PENDING',
    retry_count: 0,
  });
};

export const getPendingSyncQueueItems = async <T = any>(): Promise<T[]> => {
  return fetchRows<T>('sync_queue', 'status = ?', ['PENDING']);
};

export const getSyncQueueItemByLocalId = async <T = any>(localId: number, tableName: string): Promise<T | null> => {
  return queryOne<T>(
    `SELECT * FROM sync_queue WHERE local_id = ? AND table_name = ? AND status = ? ORDER BY created_at DESC LIMIT 1`,
    [localId, tableName, 'PENDING']
  );
};

export const updateSyncQueueItem = async (id: number, data: RowData): Promise<SQLiteRunResult> => {
  const keys = Object.keys(data);
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => data[key]);
  return runSqlAsync(`UPDATE sync_queue SET ${assignments} WHERE id = ?`, [...values, id]);
};

export const deleteSyncQueueItem = async (id: number): Promise<SQLiteRunResult> => {
  return runSqlAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
};

export const clearSyncQueue = async (): Promise<SQLiteRunResult> => {
  return runSqlAsync(`DELETE FROM sync_queue`, []);
};

export const insertIdMapping = async (localId: number, serverId: number, tableName: string): Promise<SQLiteRunResult> => {
  return insertOrReplaceRow('id_mapping', {
    local_id: localId,
    server_id: serverId,
    table_name: tableName,
    synced_at: new Date().toISOString(),
  });
};

export const getServerIdForLocalId = async (localId: number, tableName: string): Promise<number | null> => {
  const row = await queryOne<{ server_id: number }>(
    `SELECT server_id FROM id_mapping WHERE local_id = ? AND table_name = ? LIMIT 1`,
    [localId, tableName]
  );
  return row?.server_id ?? null;
};

export const getAllTableNames = async (): Promise<string[]> => {
  const rows = await queryAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('sync_queue', 'id_mapping')`);
  return rows.map((r) => r.name);
};

export const getTableInfo = async (tableName: string): Promise<Array<{ name: string }>> => {
  return queryAll<{ name: string }>(`PRAGMA table_info(${tableName})`);
};

export const markSyncQueueItem = async (
  id: number,
  status: string,
  syncedAt?: string,
  errorMessage?: string,
  retryCount?: number
): Promise<SQLiteRunResult> => {
  const data: RowData = { status };

  if (syncedAt) data.synced_at = syncedAt;
  if (errorMessage) data.error_message = errorMessage;
  if (typeof retryCount === 'number') data.retry_count = retryCount;

  const keys = Object.keys(data);
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => data[key]);
  return runSqlAsync(`UPDATE sync_queue SET ${assignments} WHERE id = ?`, [...values, id]);
};

const SCHEMA_VERSION_TABLE = `CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY)`;

export const initLocalDatabase = async (): Promise<void> => {
  const database = await openDb();
  try { await database.execAsync('PRAGMA foreign_keys = ON;'); } catch { /* continue */ }

  // Créer la table de version en premier
  try { await database.execAsync(SCHEMA_VERSION_TABLE); } catch { /* continue */ }

  // Lire la version actuelle du schéma
  let currentVersion = 0;
  try {
    const row = await database.getFirstAsync<{ version: number }>('SELECT version FROM _schema_version LIMIT 1');
    currentVersion = row?.version || 0;
  } catch { /* table n'existe pas encore */ }

  // Appliquer les CREATE TABLE (IF NOT EXISTS = safe pour tous les cas)
  for (const statement of SCHEMA_SQL) {
    try {
      await database.execAsync(statement);
    } catch (e: any) {
      console.warn(`[DB] Init statement warning: ${e?.message || e}`);
    }
  }

  // Appliquer les migrations si nécessaire
  if (currentVersion < VERSION) {
    console.info(`[DB] Migration nécessaire: v${currentVersion} → v${VERSION}`);
    for (const migration of MIGRATIONS) {
      if (currentVersion < migration.from + 1) {
        for (const sql of migration.sql) {
          try {
            await database.execAsync(sql);
            console.info(`[DB] Migration OK: ${sql.substring(0, 60)}...`);
          } catch (e: any) {
            // ALTER TABLE ADD COLUMN échoue si la colonne existe déjà → safe
            if (!e?.message?.includes('duplicate column')) {
              console.warn(`[DB] Migration warning: ${e?.message || e}`);
            }
          }
        }
      }
    }
    // Enregistrer la nouvelle version
    try {
      await database.runAsync('INSERT OR REPLACE INTO _schema_version (version) VALUES (?)', [VERSION]);
    } catch { /* ignore */ }
  }
};

export const getDatabaseName = () => DB_NAME;
