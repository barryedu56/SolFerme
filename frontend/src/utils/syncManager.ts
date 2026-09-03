import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, fetchAll } from '../api/client';
import {
  deleteRow,
  fetchRows,
  getAllTableNames,
  getPendingSyncQueueItems,
  getServerIdForLocalId,
  getSyncQueueItemByLocalId,
  getTableInfo,
  insertIdMapping,
  insertOrReplaceRow,
  initLocalDatabase,
  queryAll,
  runSqlAsync,
  deleteSyncQueueItem,
  updateSyncQueueItem,
  clearSyncQueue,
} from '../database/localDatabase';
import { emitDataChange } from './dataEvents';
import { getLocalReferenceTable, getTableNameFromEndpoint, mapForeignKeyFields, normalizeEndpoint, parseEndpoint } from '../utils/offlineSyncUtils';
import { CANCELLABLE_TABLES, TABLE_MODULE_MAP, reconcileMissingInitialSalePayments } from '../repositories/dataSources/LocalApiFallback';

const SYNCABLE_ENDPOINTS = [
  '/users/',
  '/farms/',
  '/lots/',
  '/lot-expenses/',
  '/productions/',
  '/egg-conversions/',
  '/sales/',
  '/feeds/',
  '/movements/',
  '/health-records/',
  '/employees/',
  '/expenses/',
  '/farm-users/',
  '/feed-inventory/',
  '/health-inventory/',
  '/feed-purchases/',
  '/health-purchases/',
  '/prepared-feed-inventory/',
  '/feed-preparations/',
  '/payrolls/',
  '/attendances/',
  '/tasks/',
  '/reminders/',
  '/bonuses/',
  '/employee-requests/',
  '/health-alerts/',
  '/activity-logs/',
  '/lot-expenses/',
  '/sale-payments/',
];

const SYNC_QUEUE_PRIORITY: Record<string, number> = {
  users: 0,
  farms: 1,
  farm_users: 1.5,
  lots: 2,
  lot_expenses: 2.6,
  employees: 3,
  feed_inventory: 4,
  health_inventory: 5,
  feed_purchases: 6,
  health_purchases: 7,
  prepared_feed_inventory: 8,
  feed_preparations: 9,
  productions: 10,
  egg_conversions: 10.5,
  sales: 11,
  sale_payments: 11.5,
  feeds: 12,
  health_records: 13,
  chicken_movements: 14,
  expenses: 15,
  payrolls: 16,
  attendances: 17,
  tasks: 18,
  reminders: 19,
  bonuses: 20,
  employee_requests: 21,
  health_alerts: 22,
  activity_logs: 23,
};

const isHttpErrorRecoverable = (error: any) => {
  if (!error?.response) return false;
  const status = error.response.status;
  return status >= 500 || status === 429;
};

const isClientError = (error: any) => {
  return error?.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 401;
};

// URIs de fichiers locaux (photos choisies pendant une session hors-ligne).
// Impossible à transmettre en JSON → le backend rejette tout le CREATE/PATCH
// (« profile_image: The submitted data was not a file »), ce qui bloquait la
// synchro de l'employé/utilisateur entier. On les retire du payload : la photo
// reste en cache SQLite pour l'affichage local, l'utilisateur la re-téléverse
// une fois en ligne (PATCH multipart classique, déjà fonctionnel).
const LOCAL_FILE_URI_RE = /^(file:|content:|blob:|data:)/i;
const stripUnsendableFields = (payload: any): any => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === '_local_image') continue;
    if (typeof v === 'string' && LOCAL_FILE_URI_RE.test(v)) continue;
    out[k] = v;
  }
  return out;
};

const getQueueItemPriority = (item: any): number => {
  const parsed = parseEndpoint(item.endpoint);
  let tablePriority = SYNC_QUEUE_PRIORITY[parsed.tableName || ''] ?? 50;

  // 🔧 Sous-priorité CRITIQUE pour chicken_movements : MALADE avant GUERI
  // GUERI dépend de MALADE côté backend (validate_health_integrity).
  // Si GUERI sync avant MALADE → backend rejette → échec permanent 4xx.
  // On sous-classe : MALADE (14.0), MORT/VENTE (14.2), GUERI (14.5), AJOUT (14.7)
  if (parsed.tableName === 'chicken_movements') {
    try {
      const payload = JSON.parse(item.payload_json);
      const mvtType = payload?.type;
      if (mvtType === 'MALADE') tablePriority = 14.0;
      else if (mvtType === 'MORT' || mvtType === 'VENTE') tablePriority = 14.2;
      else if (mvtType === 'GUERI') tablePriority = 14.5;
      else if (mvtType === 'AJOUT') tablePriority = 14.7;
      else tablePriority = 14.3;
    } catch {
      tablePriority = 14.3; // Payload illisible → priorité neutre
    }
  }

  // 🔧 Ordre CRITIQUE pour la logique métier :
  // Si l'objet est local (local_id < 0), CREATE DOIT passer AVANT UPDATE/PATCH/Actions !
  // Si l'objet existe déjà sur le serveur (id >= 0), DELETE en premier (restaure le stock), puis UPDATE, puis CREATE.
  let opPriority: number;
  if (typeof item.local_id === 'number' && item.local_id < 0) {
    opPriority = item.operation === 'CREATE' ? 0 : item.operation === 'UPDATE' ? 1 : 2;
  } else {
    opPriority = item.operation === 'DELETE' ? 0 : item.operation === 'UPDATE' ? 1 : 2;
  }
  return opPriority * 100 + tablePriority;
};

const resolveLocalIdsInPayload = async (payload: any, parentKey?: string): Promise<{ resolved: any; unresolved: boolean }> => {
  if (payload === null || payload === undefined) {
    return { resolved: payload, unresolved: false };
  }

  if (Array.isArray(payload)) {
    let unresolved = false;
    const resolvedArray = [] as any[];
    for (const item of payload) {
      const result = await resolveLocalIdsInPayload(item, parentKey);
      resolvedArray.push(result.resolved);
      unresolved = unresolved || result.unresolved;
    }
    return { resolved: resolvedArray, unresolved };
  }

  if (typeof payload === 'object') {
    let unresolved = false;
    const resolvedObject: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) {
        resolvedObject[key] = value;
        continue;
      }

      if (typeof value === 'object') {
        const nested = await resolveLocalIdsInPayload(value, key);
        resolvedObject[key] = nested.resolved;
        unresolved = unresolved || nested.unresolved;
        continue;
      }

      if (typeof value === 'number' && value < 0) {
        const referenceTable = getLocalReferenceTable(key) || getTableNameFromEndpoint(`/${key}/`);
        if (referenceTable) {
          const serverId = await getServerIdForLocalId(value, referenceTable);
          if (typeof serverId === 'number') {
            resolvedObject[key] = serverId;
            continue;
          }
          unresolved = true;
        }
      }

      resolvedObject[key] = value;
    }
    return { resolved: resolvedObject, unresolved };
  }

  if (typeof payload === 'number' && payload < 0 && parentKey) {
    const referenceTable = getLocalReferenceTable(parentKey) || getTableNameFromEndpoint(`/${parentKey}/`);
    if (referenceTable) {
      const serverId = await getServerIdForLocalId(payload, referenceTable);
      if (typeof serverId === 'number') {
        return { resolved: serverId, unresolved: false };
      }
      return { resolved: payload, unresolved: true };
    }
  }

  return { resolved: payload, unresolved: false };
};

const updateQueueItemsForMappedId = async (localId: number, tableName: string, serverId: number): Promise<void> => {
  const queueItems = await getPendingSyncQueueItems();
  for (const item of queueItems) {
    let needsUpdate = false;
    let endpoint = item.endpoint;
    let payload = JSON.parse(item.payload_json);

    if (endpoint.includes(`/${localId}/`)) {
      endpoint = endpoint.replace(new RegExp(`/${localId}(/|$)`), `/${serverId}$1`);
      needsUpdate = true;
    }

    const payloadResult = await resolveLocalIdsInPayload(payload);
    if (payloadResult.unresolved || JSON.stringify(payloadResult.resolved) !== JSON.stringify(payload)) {
      payload = payloadResult.resolved;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await updateSyncQueueItem(item.id, {
        endpoint,
        payload_json: JSON.stringify(payload),
      });
    }
  }
};

export class SyncManager {
  private isSyncing = false;
  private syncRequestedWhileBusy = false;
  private unsubscribe: (() => void) | null = null;

  private async hasRefreshToken(): Promise<boolean> {
    const refreshToken = await AsyncStorage.getItem('refresh_token');
    return Boolean(refreshToken);
  }

  private isNetworkOnline(state: NetInfoState): boolean {
    if (Platform.OS === 'web') {
      return Boolean(state.isConnected);
    }
    return Boolean(state.isConnected && state.isInternetReachable);
  }

  public async initialize(): Promise<void> {
    try {
      await initLocalDatabase();
    } catch (dbError: any) {
      console.error('[Sync] Database initialization failed:', dbError?.message || dbError);
      // Ne pas bloquer l'app si la DB locale échoue — le mode online fonctionne encore
    }

    // 🔧 Au démarrage, réinitialiser TOUS les items PROCESSING → PENDING
    // (ils étaient en cours de traitement lors du dernier arrêt de l'app)
    try {
      const stuckItems = await fetchRows<any>('sync_queue', "status = 'PROCESSING'");
      if (stuckItems.length > 0) {
        console.info(`[Sync] Réinitialisation de ${stuckItems.length} item(s) PROCESSING au démarrage`);
        for (const stuck of stuckItems) {
          await updateSyncQueueItem(stuck.id, { status: 'PENDING', updated_at: new Date().toISOString() }).catch(() => {});
        }
      }
    } catch { /* silencieux si la table n'existe pas encore */ }

    // 🔧 Réparer les ventes offline dont le paiement initial n'a jamais été inséré
    // (ancien bug farm_id NOT NULL) → créance / historique des paiements faussés.
    try {
      await reconcileMissingInitialSalePayments();
    } catch { /* best-effort */ }

    const state = await NetInfo.fetch();
    if (this.isNetworkOnline(state)) {
      // 🔧 Après un login/reconnexion, le refresh token peut ne pas être encore
      // persisté dans AsyncStorage. On réessaie jusqu'à 5 fois avec 500ms d'intervalle
      // pour éviter que le sync initial soit silencieusement sauté → app vide en offline.
      let retries = 0;
      const MAX_RETRIES = 5;
      while (!(await this.hasRefreshToken()) && retries < MAX_RETRIES) {
        retries++;
        console.info(`[Sync] Refresh token pas encore disponible — retry ${retries}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, 500));
      }
      if (await this.hasRefreshToken()) {
        console.info('[Sync] Token disponible, démarrage sync initial...');
        await this.syncAll();
      } else {
        console.warn('[Sync] Pas de refresh token après retry — sync initial sauté. Sera fait au prochain changement réseau.');
        // Stocker un flag pour que le watcher réseau puisse réessayer plus tard
        try {
          await AsyncStorage.setItem('_sync_pending', 'true');
        } catch {}
      }
    } else {
      // Hors-ligne au démarrage : marquer que le sync est nécessaire dès reconnexion
      try {
        await AsyncStorage.setItem('_sync_pending', 'true');
      } catch {}
    }
  }

  public async syncAll(): Promise<boolean> {
    // ⚠️ CRITIQUE: isSyncing DOIT être positionné AVANT tout await pour
    // éviter qu'un deuxième appel passe le guard pendant le yield de hasRefreshToken().
    // Sans cela, deux syncAll() concurrents traitent la même queue → doublons MySQL.
    if (this.isSyncing) {
      // Si un sync est déjà en cours, marquer qu'un autre est demandé
      // Il sera exécuté après la fin du sync actuel
      this.syncRequestedWhileBusy = true;
      return false;
    }
    this.isSyncing = true;
    if (!(await this.hasRefreshToken())) {
      this.isSyncing = false;
      return false;
    }
    try {
      do {
        this.syncRequestedWhileBusy = false;
        await this.pushPendingOperations();
        await this.pullAllRemoteData();
      } while (this.syncRequestedWhileBusy);
      return true;
    } finally {
      this.isSyncing = false;
    }
  }

  public async pushPendingOperations(): Promise<void> {
    let queue = await getPendingSyncQueueItems();
    if (queue.length === 0) return;

    queue = queue.sort((a, b) => getQueueItemPriority(a) - getQueueItemPriority(b));
    const now = Date.now();
    const MAX_UNRESOLVED_RETRIES = 5;  // Nombre max de tentatives avant d'abandonner
    const FAILED_DELAY_MS = 30 * 60 * 1000; // 30 min avant de considérer un item comme définitivement échoué

    // Réinitialiser les items bloqués en PROCESSING (ex: crash précédent, perte connexion)
    // 🔧 Timeout réduit à 60s (était 5min) pour ne pas bloquer la sync après une
    // coupure réseau brève. La vérification anti-doublon (getServerIdForLocalId avant
    // chaque CREATE) empêche les doublons MySQL même si on réactive trop tôt.
    try {
      const STUCK_TIMEOUT_MS = 60 * 1000; // 60 secondes
      const now = Date.now();
      const stuckItems = await fetchRows<any>('sync_queue', "status = 'PROCESSING'");
      for (const stuck of stuckItems) {
        const updatedAt = stuck.updated_at ? new Date(stuck.updated_at).getTime() : 0;
        if (now - updatedAt > STUCK_TIMEOUT_MS) {
          await updateSyncQueueItem(stuck.id, { status: 'PENDING', updated_at: new Date().toISOString() });
          console.info(`[Sync] Réactivation item bloqué #${stuck.id} (PROCESSING → PENDING, bloqué depuis ${Math.round((now - updatedAt) / 60000)} min)`);
        } else {
          console.info(`[Sync] Item #${stuck.id} marqué PROCESSING il y a ${Math.round((now - updatedAt) / 1000)}s — probablement en cours, ignoré`);
        }
      }
      // Recharger la queue pour inclure les items réactivés
      const reactivatedCount = stuckItems.filter(s => {
        const updatedAt = s.updated_at ? new Date(s.updated_at).getTime() : 0;
        return now - updatedAt > STUCK_TIMEOUT_MS;
      }).length;
      if (reactivatedCount > 0) {
        queue = await getPendingSyncQueueItems();
        queue = queue.sort((a, b) => getQueueItemPriority(a) - getQueueItemPriority(b));
      }
    } catch { /* best-effort */ }

    // 🔧 Réactiver les items FAILED dont les dépendances sont maintenant résolues.
    // Cas critique : GUERI sync avant MALADE → backend rejette (400) → FAILED.
    // Quand MALADE sync ensuite, GUERI doit être retenté automatiquement.
    // On ne retente que les 4xx (erreurs métier) — les 5xx/Réseau sont déjà restés PENDING.
    try {
      const FAILED_RETRY_MIN_AGE_MS = 10 * 1000; // 10 secondes minimum avant retry
      const failedItems = await fetchRows<any>('sync_queue', "status = 'FAILED'");
      let reactivatedCount = 0;
      for (const failed of failedItems) {
        const createdAt = failed.created_at ? new Date(failed.created_at).getTime() : 0;
        if (now - createdAt < FAILED_RETRY_MIN_AGE_MS) continue; // Trop récent, laisse respirer
        if ((failed.retry_count || 0) >= MAX_UNRESOLVED_RETRIES) continue; // Déjà épuisé

        try {
          const payload = JSON.parse(failed.payload_json);
          const { unresolved } = await resolveLocalIdsInPayload(payload);
          if (!unresolved) {
            // Tous les IDs sont maintenant résolus → réessayer
            await updateSyncQueueItem(failed.id, {
              status: 'PENDING',
              retry_count: (failed.retry_count || 0) + 1,
              error_message: null,
              updated_at: new Date().toISOString(),
            });
            reactivatedCount++;
            console.info(`[Sync] 🔄 Retry FAILED #${failed.id} (tentative ${(failed.retry_count || 0) + 1}) — dépendances résolues`);
          }
        } catch {
          // Payload corrompu, on laisse en FAILED
        }
      }
      if (reactivatedCount > 0) {
        queue = await getPendingSyncQueueItems();
        queue = queue.sort((a, b) => getQueueItemPriority(a) - getQueueItemPriority(b));
        console.info(`[Sync] ${reactivatedCount} item(s) FAILED réactivés pour retry`);
      }
    } catch { /* best-effort */ }

    for (const item of queue) {
      // Marquer immédiatement comme PROCESSING pour éviter qu'un autre
      // pushPendingOperations concurrent traite le même item (idempotence).
      try {
        await updateSyncQueueItem(item.id, { status: 'PROCESSING', updated_at: new Date().toISOString() });
      } catch (markErr: any) {
        console.warn('[Sync] Échec marquage PROCESSING:', markErr?.message);
        continue;
      }

      let resolvedEndpoint: string;
      let resolvedPayload: any;
      try {
        resolvedEndpoint = await this.resolveEndpoint(item.endpoint, item.table_name, item.local_id);
        const payload = JSON.parse(item.payload_json);
        const { resolved, unresolved } = await resolveLocalIdsInPayload(payload);
        resolvedPayload = stripUnsendableFields(resolved);

        if (unresolved) {
          const retryCount = (item.retry_count || 0) + 1;
          const createdAt = item.created_at ? new Date(item.created_at).getTime() : now;
          const ageMs = now - createdAt;
          if (retryCount >= MAX_UNRESOLVED_RETRIES && ageMs > FAILED_DELAY_MS) {
            await updateSyncQueueItem(item.id, {
              status: 'FAILED', retry_count: retryCount,
              error_message: `Références locales non résolues après ${retryCount} tentatives sur ${Math.round(ageMs / 60000)} min.`,
            });
            console.warn(`[Sync] Abandon de l'item #${item.id}: dépendances non résolues.`);
          } else {
            await updateSyncQueueItem(item.id, { status: 'PENDING', retry_count: retryCount });
            console.info(`[Sync] En attente #${item.id} (tentative ${retryCount}/${MAX_UNRESOLVED_RETRIES})`);
          }
          continue;
        }
      } catch (resolveErr: any) {
        console.warn('[Sync] Échec résolution endpoint/payload:', resolveErr?.message);
        await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
        continue;
      }

      // 🔧 SÉCURITÉ CRITIQUE : pour tout UPDATE/PATCH/Action sur un ID local négatif,
      // s'assurer que le CREATE a été exécuté et le serverId mappé au préalable !
      if (typeof item.local_id === 'number' && item.local_id < 0 && item.operation !== 'CREATE') {
        const mappedServerId = await getServerIdForLocalId(item.local_id, item.table_name).catch(() => null);
        if (!mappedServerId) {
          console.info(`[Sync] UPDATE/Action différé pour ${item.table_name} #${item.local_id} : CREATE pas encore synchronisé.`);
          await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
          continue;
        }
      }

      // --- Opération CREATE ---
      if (item.operation === 'CREATE') {
        // Anti-doublon 1 : le mapping local→serveur est déjà enregistré → rien à faire.
        if (typeof item.local_id === 'number' && item.local_id < 0) {
          const existingMapping = await getServerIdForLocalId(item.local_id, item.table_name).catch(() => null);
          if (existingMapping) {
            console.info(`[Sync] CREATE #${item.id} déjà synchronisé (${item.table_name} ${item.local_id}→${existingMapping})`);
            await deleteSyncQueueItem(item.id).catch(() => {});
            continue;
          }
        }

        // Anti-doublon 2 : au cycle précédent le POST a ABOUTI côté serveur mais le
        // mapping local a échoué (_server_id stocké dans le payload). On reprend le
        // mapping SANS re-POSTer → aucun risque de doublon même si l'idempotency
        // backend n'était pas encore en place.
        if (typeof item.local_id === 'number' && item.local_id < 0 && typeof resolvedPayload?._server_id === 'number') {
          const knownServerId = resolvedPayload._server_id as number;
          try {
            await this.replaceLocalId(item.table_name, item.local_id, knownServerId).catch(() => {});
            await insertIdMapping(item.local_id, knownServerId, item.table_name).catch(() => {});
            await updateQueueItemsForMappedId(item.local_id, item.table_name, knownServerId).catch(() => {});
            await this.reactivateDependentItems(item.local_id, knownServerId).catch(() => {});
          } catch { /* best-effort */ }
          const verified = await getServerIdForLocalId(item.local_id, item.table_name).catch(() => null);
          if (verified) {
            console.info(`[Sync] CREATE #${item.id} : mapping repris depuis _server_id=${knownServerId}, pas de re-POST`);
            await deleteSyncQueueItem(item.id).catch(() => {});
            continue;
          }
        }
        // Retirer _server_id du corps envoyé au backend (champ interne).
        if (resolvedPayload && typeof resolvedPayload === 'object' && '_server_id' in resolvedPayload) {
          delete resolvedPayload._server_id;
        }

        let apiSucceeded = false;
        let mappingSucceeded = true;
        try {
          const response = await apiClient.post(resolvedEndpoint, resolvedPayload);
          apiSucceeded = true;
          const serverId = response.data?.id;

          // 🔧 Mapping ID local→serveur VÉRIFIÉ (ne pas juste catch/ignore)
          if (typeof item.local_id === 'number' && item.local_id < 0 && typeof serverId === 'number') {
            // Étape 1: Remplacer l'ID local dans la table principale
            try {
              await this.replaceLocalId(item.table_name, item.local_id, serverId);
              console.info(`[Sync] ✅ FK cascade ${item.table_name} ${item.local_id}→${serverId}`);
            } catch (replaceErr: any) {
              mappingSucceeded = false;
              console.error(`[Sync] ❌ Échec replaceLocalId ${item.table_name} ${item.local_id}→${serverId}:`, replaceErr?.message);
            }

            // Étape 2: Enregistrer le mapping pour les futures résolutions
            try {
              await insertIdMapping(item.local_id, serverId, item.table_name);
            } catch (mapErr: any) {
              console.warn(`[Sync] ⚠️ Échec insertIdMapping ${item.table_name} ${item.local_id}→${serverId}:`, mapErr?.message);
            }

            // Étape 3: Mettre à jour les items de queue dépendants
            try {
              await updateQueueItemsForMappedId(item.local_id, item.table_name, serverId);
            } catch (updateErr: any) {
              console.warn(`[Sync] ⚠️ Échec updateQueueItemsForMappedId:`, updateErr?.message);
            }

            // Étape 4: Réactiver les items FAILED qui attendaient cet ID
            try {
              await this.reactivateDependentItems(item.local_id, serverId);
            } catch (reactivateErr: any) {
              console.warn(`[Sync] ⚠️ Échec reactivateDependentItems:`, reactivateErr?.message);
            }
          }

          // Persister les données serveur localement
          if (response.data) {
            try { await this.persistRemoteItem(item.table_name, response.data); } catch {}
          }

          // 🔧 Vérifier que le mapping a bien réussi avant de nettoyer la queue
          if (typeof item.local_id === 'number' && item.local_id < 0 && typeof serverId === 'number') {
            const verified = await getServerIdForLocalId(item.local_id, item.table_name).catch(() => null);
            if (!verified) {
              // Le mapping n'a pas été persisté → réessayer insertIdMapping
              try {
                await insertIdMapping(item.local_id, serverId, item.table_name);
              } catch { /* dernier essai */ }
              console.warn(`[Sync] ⚠️ Mapping ${item.table_name} ${item.local_id}→${serverId} non vérifié après insertIdMapping`);
            }
          }

          if (!mappingSucceeded && typeof item.local_id === 'number' && item.local_id < 0) {
            // API réussie mais le mapping local a échoué → garder en PENDING
            // pour que les ID locaux soient correctement remplacés au prochain cycle
            console.warn(`[Sync] ⚠️ API CREATE OK mais mapping local échoué pour ${item.table_name} #${item.id} — gardé en PENDING`);
            await updateSyncQueueItem(item.id, {
              status: 'PENDING',
              payload_json: JSON.stringify({ ...JSON.parse(item.payload_json), _server_id: response.data?.id }),
            }).catch(() => {});
          } else {
            // API réussi + mapping OK → nettoyer la queue
            try { await deleteSyncQueueItem(item.id); } catch {
              await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: 'API succeeded but queue cleanup failed' }).catch(() => {});
            }
            // 🔧 Purge des logs d'activité preview de cette entité : le backend a
            // créé les siens (perform_create / signaux) et ils arriveront au pull.
            // Les libellés client/serveur diffèrent → la dédup par texte échoue et
            // laissait 2 lignes dans l'historique. On matche par (module, entité).
            // Le module cadre le related_id (non unique entre tables).
            if (typeof serverId === 'number') {
              const moduleForTable = TABLE_MODULE_MAP[item.table_name];
              try {
                if (moduleForTable) {
                  await runSqlAsync(
                    `DELETE FROM activity_logs WHERE _needs_sync = 0 AND module = ? AND related_id IN (?, ?)`,
                    [moduleForTable, item.local_id, serverId]
                  );
                } else {
                  // Table sans module connu → on se limite à l'id local (globalement unique).
                  await runSqlAsync(
                    `DELETE FROM activity_logs WHERE _needs_sync = 0 AND related_id = ?`,
                    [item.local_id]
                  );
                }
              } catch { /* best-effort */ }
            }
            console.info(`[Sync] ✅ CREATE ${item.table_name} ${item.local_id}→${response.data?.id || '?'} synchronisé`);
          }
        } catch (apiError: any) {
          if (!apiSucceeded) {
            if (apiError?.response?.status === 401) {
              console.warn('[Sync] Session expirée (HTTP 401) lors du CREATE. Suspension de la synchronisation.');
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
              this.isSyncing = false;
              return;
            }
            if (isClientError(apiError)) {
              await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: `Erreur client ${apiError.response?.status}` }).catch(() => {});
              console.error(`[Sync] ❌ CREATE rejeté (4xx) ${item.endpoint}:`, apiError?.response?.data || apiError?.message);
            } else {
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
              console.warn(`[Sync] ⚠️ CREATE échoué (réseau/serveur) ${item.endpoint}:`, apiError?.message || apiError);
            }
          }
        }
        continue;
      }

      // --- Opération UPDATE ---
      if (item.operation === 'UPDATE') {
        const baseUpdatedAt = resolvedPayload._base_updated_at;
        delete resolvedPayload._base_updated_at;
        // 🔧 Conflit offline-first : le principe est "last-write-wins" (l'utilisateur
        // qui a travaillé offline est le plus récent). On log l'écart mais on force
        // le push plutôt que de bloquer en CONFLICT (dead letter non retryée).
        // La donnée locale représente l'intention métier la plus récente.
        if (baseUpdatedAt && typeof item.local_id === 'number' && item.local_id >= 0) {
          try {
            const serverRecord = await apiClient.get(resolvedEndpoint);
            const serverUpdatedAt = serverRecord.data?.updated_at;
            if (serverUpdatedAt && serverUpdatedAt !== baseUpdatedAt) {
              console.warn(
                `[Sync] ⚠️ Conflit léger sur ${resolvedEndpoint} (serveur: ${serverUpdatedAt}, local: ${baseUpdatedAt}) — force push appliqué (last-write-wins).`
              );
              // On continue avec le PATCH au lieu de bloquer en CONFLICT
            }
          } catch (getError: any) {
            if (getError?.response?.status !== 404) {
              console.warn(`[Sync] Vérification conflit impossible pour ${resolvedEndpoint}`);
            }
          }
        }

        let apiSucceeded = false;
        try {
          await apiClient.patch(resolvedEndpoint, resolvedPayload);
          apiSucceeded = true;
          try { await deleteSyncQueueItem(item.id); } catch {
            await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: 'PATCH succeeded but queue cleanup failed' }).catch(() => {});
          }
        } catch (apiError: any) {
          if (!apiSucceeded) {
            if (apiError?.response?.status === 401) {
              console.warn('[Sync] Session expirée (HTTP 401) lors du UPDATE. Suspension de la synchronisation.');
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
              this.isSyncing = false;
              return;
            }
            if (isClientError(apiError)) {
              await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: `Erreur client ${apiError.response?.status}` }).catch(() => {});
            } else {
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
            }
            console.warn('Sync UPDATE failed:', item.endpoint, apiError?.message || apiError);
          }
        }
        continue;
      }

      // --- Opération DELETE ---
      if (item.operation === 'DELETE') {
        // 🔧 Gestion des items locaux non-syncés : si l'ID est négatif et sans mapping,
        // le DELETE n'a pas de sens côté serveur (l'item n'existe pas). On nettoie juste
        // la queue et le CREATE correspondant (qui n'a pas encore été synced).
        if (typeof item.local_id === 'number' && item.local_id < 0) {
          const mapping = await getServerIdForLocalId(item.local_id, item.table_name).catch(() => null);
          if (!mapping) {
            // L'item n'a jamais été créé côté serveur → annuler le CREATE et nettoyer
            const pendingCreate = await getSyncQueueItemByLocalId(item.local_id, item.table_name).catch(() => null);
            if (pendingCreate && pendingCreate.operation === 'CREATE') {
              await deleteSyncQueueItem(pendingCreate.id).catch(() => {});
              console.info(`[Sync] DELETE item local non-syncé #${item.id} → CREATE correspondant annulé`);
            }
            await deleteSyncQueueItem(item.id).catch(() => {});
            continue;
          }
        }

        let apiSucceeded = false;
        try {
          await apiClient.delete(resolvedEndpoint);
          apiSucceeded = true;
          // Si le DELETE a réussi, supprimer aussi la ligne SQLite locale SAUF si c'est une table annulable
          if (typeof item.local_id === 'number' && item.local_id >= 0 && !CANCELLABLE_TABLES.has(item.table_name)) {
            try { await deleteRow(item.table_name, item.local_id); } catch { /* déjà supprimé peut-être */ }
          }
          try { await deleteSyncQueueItem(item.id); } catch {
            await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: 'DELETE succeeded but queue cleanup failed' }).catch(() => {});
          }
          console.info(`[Sync] ✅ DELETE ${item.endpoint} synchronisé`);
        } catch (apiError: any) {
          if (!apiSucceeded) {
            const status = apiError.response?.status;
            if (status === 401) {
              console.warn('[Sync] Session expirée (HTTP 401) lors du DELETE. Suspension de la synchronisation.');
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
              this.isSyncing = false;
              return;
            }
            // 🔧 404 (déjà supprimé) ou 400 (déjà annulé) → succès fonctionnel, nettoyer
            if (status === 404 || status === 400) {
              console.info(`[Sync] DELETE ${item.endpoint} → ${status} (déjà supprimé/annulé), nettoyage queue`);
              try { await deleteSyncQueueItem(item.id); } catch {}
              if (!CANCELLABLE_TABLES.has(item.table_name)) {
                try { await deleteRow(item.table_name, item.local_id); } catch {}
              }
            } else if (isClientError(apiError)) {
              await updateSyncQueueItem(item.id, { status: 'FAILED', error_message: `Erreur client ${status}` }).catch(() => {});
              console.error(`[Sync] ❌ DELETE rejeté (4xx) ${item.endpoint}`);
            } else {
              await updateSyncQueueItem(item.id, { status: 'PENDING' }).catch(() => {});
              console.warn(`[Sync] ⚠️ DELETE échoué (réseau/serveur) ${item.endpoint}:`, apiError?.message || apiError);
            }
          }
        }
        continue;
      }

      // Opération inconnue → on continue (ne devrait pas arriver)
      console.warn(`[Sync] Opération inconnue pour item #${item.id}: ${item.operation}`);
    }
  }

  public async pullAllRemoteData(): Promise<void> {
    // Traitement SÉQUENTIEL (pas de Promise.all) — Expo SQLite sur Android
    // crash avec NPE quand plusieurs prepareAsync s'exécutent en parallèle.
    for (const endpoint of SYNCABLE_ENDPOINTS) {
      try {
        await this.pullEndpoint(endpoint);
      } catch (error) {
        console.warn('Failed to pull remote data for', endpoint, error);
      }
    }
  }

  public async pullEndpoint(endpoint: string, configParams?: Record<string, any>): Promise<void> {
    if (!(await this.hasRefreshToken())) return;
    const tableName = getTableNameFromEndpoint(endpoint, configParams);
    if (!tableName) return;

    const parsed = parseEndpoint(endpoint, configParams);
    if (typeof parsed.id === 'number') {
      const response = await apiClient.get(endpoint, { params: configParams });
      await this.persistRemoteItem(tableName, response.data);
      return;
    }

    const results = await fetchAll(endpoint);
    if (!Array.isArray(results)) return;
    for (const row of results) {
      await this.persistRemoteItem(tableName, row);
    }

    // 🧹 Nettoyage des rows locales obsolètes (supprimées côté serveur)
    // Ne supprime QUE les IDs positifs (les négatifs sont des créations offline)
    // 🔧 activity_logs : table append-only, les logs locaux (créés par createActivityLogLocally)
    //    ne sont pas remontés au serveur → ne pas les nettoyer. Le serveur crée ses propres logs
    //    via les signaux Django. La déduplication est gérée côté persistRemoteItem.
    // 🔧 health_alerts : les alertes locales (créées par createHealthAlertLocally) sont preview-only
    //    (_needs_sync=0). Le serveur crée ses propres alertes via les signaux Django.
    //    La déduplication est gérée dans persistRemoteItem pour éviter les doublons.
    const CLEANUP_EXCLUDED_TABLES = new Set(['activity_logs', 'health_alerts']);
    if (!CLEANUP_EXCLUDED_TABLES.has(tableName)) {
      try {
        const apiIds = new Set(
          results.map((r: any) => r.id).filter((id: any) => typeof id === 'number' && id > 0)
        );
        // Toujours exécuter le nettoyage, même si le serveur retourne une liste vide
        // (MySQL wiped = toutes les rows locales id>0 doivent être supprimées)
        const localRows = await fetchRows<{ id: number }>(tableName, 'id > 0');
        for (const localRow of localRows) {
          if (!apiIds.has(localRow.id)) {
            await deleteRow(tableName, localRow.id);
            console.info(`[Sync] 🧹 Nettoyage: ${tableName} id=${localRow.id} supprimé côté serveur → retiré du cache local`);
          }
        }
      } catch (cleanupErr: any) {
        // Silencieux — le nettoyage est best-effort
        if (!cleanupErr?.message?.includes('NullPointerException')) {
          console.debug(`[Sync] Nettoyage ${tableName} non effectué:`, cleanupErr?.message);
        }
      }
    }
  }

  /**
   * Appelé par AuthContext après un login réussi pour garantir que le pull
   * initial est déclenché même si initialize() a été appelé trop tôt
   * (avant que le refresh token soit persisté).
   */
  public async syncAfterLogin(): Promise<void> {
    const state = await NetInfo.fetch();
    if (this.isNetworkOnline(state) && await this.hasRefreshToken()) {
      console.info('[Sync] syncAfterLogin déclenché — pull initial...');
      // Forcer pullAllRemoteData pour remplir SQLite (même si push n'est pas nécessaire)
      await this.syncAll();
    }
  }

  public watchNetworkAndSync(): () => void {
    if (this.unsubscribe) {
      return this.unsubscribe;
    }

    // Ignorer le premier événement NetInfo (état courant) car initialize()
    // est déjà appelé au démarrage dans App.tsx useEffect.
    // Le watcher ne doit réagir qu'aux CHANGEMENTS d'état réseau ultérieurs.
    let isInitialEvent = true;
    this.unsubscribe = NetInfo.addEventListener(async (state) => {
      if (isInitialEvent) {
        isInitialEvent = false;
        return; // État initial déjà géré par initialize()
      }
      if (this.isNetworkOnline(state)) {
        console.info('[Sync] Changement réseau détecté, tentative de synchronisation...');
        // 🔧 Si _sync_pending est présent (sync initial sauté faute de token),
        // faire un syncAll complet plutôt que juste initialize (qui re-check hasRefreshToken).
        try {
          const syncPending = await AsyncStorage.getItem('_sync_pending');
          if (syncPending === 'true') {
            console.info('[Sync] Sync pending détecté — pull initial maintenant que le réseau est disponible');
            await AsyncStorage.removeItem('_sync_pending').catch(() => {});
            if (await this.hasRefreshToken()) {
              await this.syncAll();
              return;
            }
          }
        } catch {}
        await this.initialize();
      }
    });

    return this.unsubscribe;
  }

  private async resolveEndpoint(endpoint: string, tableName: string, localId?: number | null): Promise<string> {
    // Pour CREATE, on garde le endpoint tel quel (pas d'ID à remplacer)
    if (typeof localId !== 'number' || localId >= 0) {
      return this.ensureTrailingSlash(endpoint);
    }
    const serverId = await getServerIdForLocalId(localId, tableName);
    if (!serverId) {
      return this.ensureTrailingSlash(endpoint);
    }
    const normalized = normalizeEndpoint(endpoint);
    const result = normalized.replace(new RegExp(`/${localId}(/|$)`), `/${serverId}$1`);
    return this.ensureTrailingSlash(result);
  }

  /** Garantit que l'endpoint se termine par / (Django APPEND_SLASH) */
  private ensureTrailingSlash(endpoint: string): string {
    if (!endpoint.endsWith('/')) return endpoint + '/';
    return endpoint;
  }

  private async replaceLocalId(tableName: string, localId: number, serverId: number): Promise<void> {
    if (localId === serverId) return;
    const changedTables = new Set<string>();

    try {
      await runSqlAsync(`UPDATE ${tableName} SET id = ? WHERE id = ?`, [serverId, localId]);
      changedTables.add(tableName);
    } catch (error) {
      console.warn(`Could not update primary key for ${tableName} ${localId} -> ${serverId}:`, error);
    }

    const tableNames = await getAllTableNames();
    for (const currentTable of tableNames) {
      const columns = await getTableInfo(currentTable);
      const foreignKeys = columns.filter((column) => /_id$/.test(column.name)).map((column) => column.name);
      for (const column of foreignKeys) {
        try {
          const result = await runSqlAsync(`UPDATE ${currentTable} SET ${column} = ? WHERE ${column} = ?`, [serverId, localId]);
          if (result.changes > 0) {
            changedTables.add(currentTable);
          }
        } catch (error) {
          console.warn(`Could not update foreign key ${column} in ${currentTable}:`, error);
        }
      }
    }

    for (const changedTable of changedTables) {
      emitDataChange({ tableName: changedTable, action: 'UPDATE' });
    }
  }

  /** Réactive les items de la queue qui étaient bloqués en attente d'un ID local résolu */
  private async reactivateDependentItems(localId: number, serverId: number): Promise<void> {
    const allItems = await queryAll<any>(
      `SELECT * FROM sync_queue WHERE status = 'FAILED' AND payload_json LIKE ?`,
      [`%${localId}%`]
    );
    for (const item of allItems) {
      try {
        const payload = JSON.parse(item.payload_json);
        const { unresolved } = await resolveLocalIdsInPayload(payload);
        if (!unresolved) {
          // Les dépendances sont maintenant résolues → réactiver
          await updateSyncQueueItem(item.id, {
            status: 'PENDING',
            retry_count: 0,
            error_message: null,
          });
          console.info(`[Sync] Réactivation item #${item.id}: dépendance ${localId}→${serverId} maintenant résolue.`);
        }
      } catch {
        // ignore les items corrompus
      }
    }
  }

  public async persistRemoteItem(tableName: string, row: any): Promise<void> {
    if (!row || typeof row !== 'object') return;
    // Skip rows without a valid id (computed/aggregated views from API)
    if (row.id === undefined || row.id === null) {
      console.info(`[Sync] Skipping ${tableName} item sans id (probablement vue calculée côté serveur)`);
      return;
    }
    try {
      // 🔧 Déduplication activity_logs : le serveur crée ses propres logs via signaux Django,
      // mais createActivityLogLocally en a déjà créé une version locale avec un ID différent.
      // On supprime l'entrée locale correspondante avant d'insérer la version serveur.
      if (tableName === 'activity_logs' && typeof row.action === 'string' && typeof row.module === 'string' && typeof row.description === 'string') {
        try {
          // Les logs locaux (createActivityLogLocally) sont marqués _needs_sync=0
          // (preview-only, pas envoyés au serveur). On les remplace par la version
          // serveur (signal Django) qui arrive avec un ID MySQL autoritaire.
          // Critère de matching : action + module + description + lot_id + related_id
          // (sans lot_id, deux lots avec la même action étaient dédupliqués à tort).
          const lotId = typeof row.lot_id === 'number' ? row.lot_id : null;
          const relatedId = typeof row.related_id === 'number' ? row.related_id : null;
          let sql = `SELECT id FROM activity_logs WHERE action = ? AND module = ? AND _needs_sync = 0`;
          const params: any[] = [row.action, row.module];
          if (lotId !== null) { sql += ` AND lot_id = ?`; params.push(lotId); }
          else { sql += ` AND lot_id IS NULL`; }
          if (relatedId !== null) { sql += ` AND related_id = ?`; params.push(relatedId); }
          else { sql += ` AND related_id IS NULL`; }
          sql += ` LIMIT 5`;
          const dupes = await queryAll<{ id: number }>(sql, params);
          for (const d of dupes) {
            await deleteRow('activity_logs', d.id);
            console.info(`[Sync] Déduplication log: id=${d.id} remplacé par version serveur id=${row.id}`);
          }

          // 🔧 Cas critique : le log local a related_id = localId négatif (ex: -5),
          // mais le log serveur a related_id = serverId positif (ex: 45).
          // On cherche la correspondance via id_mappings pour éviter les doublons.
          if (relatedId !== null && relatedId > 0) {
            // Chercher le local_id qui correspond à ce server_id dans id_mappings
            const mappings = await queryAll<{ local_id: number }>(
              `SELECT local_id FROM id_mapping WHERE server_id = ? LIMIT 1`,
              [relatedId]
            ).catch(() => [] as { local_id: number }[]);
            for (const mapping of mappings) {
              const localId = mapping.local_id;
              if (localId < 0) {
                // Supprimer les logs locaux avec related_id = localId (négatif)
                let sqlLocal = `SELECT id FROM activity_logs WHERE module = ? AND related_id = ? AND _needs_sync = 0`;
                const paramsLocal: any[] = [row.module, localId];
                if (lotId !== null) { sqlLocal += ` AND lot_id = ?`; paramsLocal.push(lotId); }
                sqlLocal += ` LIMIT 5`;
                const localDupes = await queryAll<{ id: number }>(sqlLocal, paramsLocal).catch(() => []);
                for (const d of localDupes) {
                  await deleteRow('activity_logs', d.id);
                  console.info(`[Sync] Déduplication log local→serveur: local_log id=${d.id} (related_id=${localId}) remplacé par serveur id=${row.id} (related_id=${relatedId})`);
                }
              }
            }
          }
        } catch { /* best-effort dedup */ }
      }

      // 🔧 Déduplication health_alerts : createHealthAlertLocally crée une alerte preview
      // (id négatif, _needs_sync=0). Lors du pull, on supprime cette preview et on insère
      // la version serveur autoritaire (avec ID MySQL positif).
      if (tableName === 'health_alerts' && typeof row.lot_id === 'number' && typeof row.type === 'string') {
        try {
          // 1. Tenter match exact avec date (si fournie)
          let previewAlerts: any[] = [];
          if (row.date) {
            previewAlerts = await queryAll<{ id: number }>(
              `SELECT id FROM health_alerts WHERE lot_id = ? AND type = ? AND _needs_sync = 0 AND date = ? AND id < 0`,
              [row.lot_id, row.type, row.date]
            ).catch(() => [] as { id: number }[]);
          }
          // 2. Fallback si pas de date ou pas de match (alerte du même type pour le même lot)
          if (previewAlerts.length === 0) {
             previewAlerts = await queryAll<{ id: number }>(
              `SELECT id FROM health_alerts WHERE lot_id = ? AND type = ? AND _needs_sync = 0 AND id < 0`,
              [row.lot_id, row.type]
            ).catch(() => [] as { id: number }[]);
          }
          
          for (const pa of previewAlerts) {
            await deleteRow('health_alerts', pa.id);
            console.info(`[Sync] Déduplication health_alert: preview id=${pa.id} remplacée par serveur id=${row.id}`);
          }
        } catch { /* best-effort dedup */ }
      }

      // 🔧 Déduplication expenses : syncLocalExpense crée une dépense preview (id < 0).
      // Lors du pull des expenses serveur, on supprime cette version preview (id < 0)
      // pour éviter tout doublon de dépense locale vs serveur.
      if (tableName === 'expenses' && typeof row.id === 'number' && row.id > 0) {
        try {
          const farmId = row.farm_id || row.farm;
          if (farmId && row.category && row.amount) {
            const previewExpenses = await queryAll<{ id: number }>(
              `SELECT id FROM expenses WHERE farm_id = ? AND category = ? AND amount = ? AND date = ? AND id < 0`,
              [farmId, row.category, row.amount, row.date || '']
            ).catch(() => [] as { id: number }[]);
            for (const pe of previewExpenses) {
              await deleteRow('expenses', pe.id);
              console.info(`[Sync] Déduplication expense: preview id=${pe.id} supprimée pour remplacer par serveur id=${row.id}`);
            }
          }
        } catch { /* best-effort dedup */ }
      }

      // 🔧 Déduplication sale_payments : un paiement local INITIAL est créé avec une
      // vente (id < 0, _needs_sync=0). Le serveur crée le sien via perform_create.
      // Priorité au rattachement par FK (sale_id) — bien plus fiable que le tuple
      // (montant, date), surtout si deux ventes identiques existent le même jour.
      if (tableName === 'sale_payments' && typeof row.id === 'number' && row.id > 0) {
        try {
          const saleId = typeof row.sale === 'number' ? row.sale : (typeof row.sale_id === 'number' ? row.sale_id : null);
          let dedupDone = false;
          if (saleId !== null) {
            // Ne cible QUE les previews INITIAL (jamais un vrai encaissement utilisateur,
            // qui porte une reference UUID « pay-… » et un id > 0 après sync).
            const bySale = await queryAll<{ id: number }>(
              `SELECT id FROM sale_payments WHERE sale_id = ? AND id < 0 AND (reference = 'INITIAL' OR reference IS NULL)`,
              [saleId]
            ).catch(() => [] as { id: number }[]);
            for (const pp of bySale) {
              await deleteRow('sale_payments', pp.id);
              dedupDone = true;
              console.info(`[Sync] Déduplication sale_payment (par vente #${saleId}): preview id=${pp.id} → serveur id=${row.id}`);
            }
          }
          const lotId = row.lot_id || row.lot;
          if (!dedupDone && lotId && row.amount && row.payment_date) {
            const previewPayments = await queryAll<{ id: number }>(
              `SELECT id FROM sale_payments WHERE lot_id = ? AND amount = ? AND payment_date = ? AND id < 0 AND (reference = 'INITIAL' OR reference IS NULL)`,
              [lotId, row.amount, row.payment_date]
            ).catch(() => [] as { id: number }[]);
            for (const pp of previewPayments) {
              await deleteRow('sale_payments', pp.id);
              console.info(`[Sync] Déduplication sale_payment: preview id=${pp.id} supprimée pour serveur id=${row.id}`);
            }
          }
        } catch { /* best-effort */ }
      }

      // 🔧 Déduplication chicken_movements pour les ventes : le frontend crée un mouvement
      // local de type VENTE (_needs_sync=0). Le backend fait de même via signal.
      // Priorité au rattachement par FK (sale_id), fallback tuple (qty, date).
      if (tableName === 'chicken_movements' && typeof row.id === 'number' && row.id > 0 && row.type === 'VENTE') {
        try {
          const saleId = typeof row.sale === 'number' ? row.sale : (typeof row.sale_id === 'number' ? row.sale_id : null);
          let dedupDone = false;
          if (saleId !== null) {
            const bySale = await queryAll<{ id: number }>(
              `SELECT id FROM chicken_movements WHERE sale_id = ? AND type = 'VENTE' AND id < 0`,
              [saleId]
            ).catch(() => [] as { id: number }[]);
            for (const pm of bySale) {
              await deleteRow('chicken_movements', pm.id);
              dedupDone = true;
              console.info(`[Sync] Déduplication chicken_movement (par vente #${saleId}): preview id=${pm.id} → serveur id=${row.id}`);
            }
          }
          const lotId = row.lot_id || row.lot;
          if (!dedupDone && lotId && row.quantity && row.date) {
            const previewMovements = await queryAll<{ id: number }>(
              `SELECT id FROM chicken_movements WHERE lot_id = ? AND type = 'VENTE' AND quantity = ? AND date = ? AND id < 0`,
              [lotId, row.quantity, row.date]
            ).catch(() => [] as { id: number }[]);
            for (const pm of previewMovements) {
              await deleteRow('chicken_movements', pm.id);
              console.info(`[Sync] Déduplication chicken_movement: preview id=${pm.id} supprimée pour serveur id=${row.id}`);
            }
          }
        } catch { /* best-effort */ }
      }

      const columns = await getTableInfo(tableName);
      const columnNames = new Set(columns.map((c) => c.name));
      const mapped = mapForeignKeyFields(columnNames, row);
      // 🔧 employees : le serveur renvoie `lots_detail` (composé) mais jamais `lots_json`
      // (colonne locale dénormalisée). Sans recalcul, INSERT OR REPLACE (sans cette clé)
      // mettrait lots_json à NULL pendant le pull → l'interface employé en OFFLINE perdrait
      // ses lots affectés (y compris ceux affectés en ligne). On dénormalise lots_detail
      // vers lots_json pour préserver l'affichage offline, cohérent avec le mode online.
      if (tableName === 'employees' && Array.isArray(row.lots_detail)) {
        const lotsJson = row.lots_detail.map((l: any) => ({
          id: l.id,
          name: l.name != null ? l.name : '',
          farm: l.farm != null ? l.farm : (l.farm_id != null ? l.farm_id : null),
        }));
        mapped.lots_json = JSON.stringify(lotsJson);
      }
      const filtered = this.filterRowByTableColumns(columnNames, mapped);

      // ⚠️ CORRECTION CRITIQUE (BUG C — écrasement des éditions locales non poussées).
      // Avant : insertOrReplaceRow remplaçait TOUJOURS la ligne locale par la version serveur
      // avec _needs_sync=0. Or ApiRepository.get(en ligne) persiste chaque item API AVANT de
      // fusionner les items locaux (_needs_sync=1). Une modification locale en attente de push
      // (id > 0, _needs_sync=1) était donc ÉCRASÉE par l'ancienne version serveur :
      //  - l'édition disparaissait du cache → l'écran affichait l'ancienne donnée au lieu de
      //    l'édition locale (divergence Offline/Online) ;
      //  - le updated_at de l'édition locale était perdu pour la détection de conflit.
      // Correctif : si une édition locale est encore PENDING dans la file de sync (operation
      // UPDATE/PATCH pour cet id positif), on LAISSE la ligne locale telle quelle — elle est
      // autoritative tant que le push ne l'a pas renvoyée sur le serveur.
      // ⚠️ On ne teste PAS uniquement _needs_sync : après un CREATE synchronisé il faut au
      // contraire appliquer la réponse serveur (ex : Sale annulé, amount_paid=0, SalePayment
      // INITIAL recréé par le backend). Le filtre sur la file (opération encore en attente)
      // distingue correctement « édition non poussée » de « création déjà synchronisée ».
      let hasPendingEdit = false;
      if (typeof row.id === 'number' && row.id > 0 && tableName) {
        try {
          const pending = await queryAll<{ id: number }>(
            `SELECT id FROM sync_queue WHERE table_name = ? AND local_id = ? AND operation IN ('UPDATE','PATCH') AND status = 'PENDING' LIMIT 1`,
            [tableName, row.id]
          );
          hasPendingEdit = pending.length > 0;
        } catch { /* best-effort — on insère normalement */ }
      }
      if (hasPendingEdit) {
        console.debug(`[Sync] persistRemoteItem: édition locale non poussée conservée pour ${tableName} id=${row.id} (le push mettra à jour le serveur)`);
        return;
      }

      await insertOrReplaceRow(tableName, { ...filtered, _needs_sync: 0 });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('NOT NULL constraint failed') || msg.includes('UNIQUE constraint failed')) {
        console.warn(`[Sync] Contrainte SQLite ignorée pour ${tableName} id=${row?.id}:`, msg.substring(0, 120));
      } else {
        console.error(`[Sync] Échec persistRemoteItem ${tableName} id=${row?.id}:`, msg);
      }
    }
  }

  private filterRowByTableColumns(allowed: Set<string>, row: any): Record<string, any> {
    return Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key)));
  }
}

export const syncManager = new SyncManager();
