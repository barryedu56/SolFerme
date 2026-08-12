import {
  enqueueSyncQueue,
  getPendingSyncQueueItems,
  clearSyncQueue as clearSqlSyncQueue,
} from '../database/localDatabase';
import { getTableNameFromEndpoint } from './offlineSyncUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  FARMS: 'offline_farms',
  LOTS: 'offline_lots',
  PRODUCTIONS: 'offline_productions',
  SALES: 'offline_sales',
  EXPENSES: 'offline_expenses',
  FEED_INVENTORY: 'offline_feed_inventory',
  HEALTH_INVENTORY: 'offline_health_inventory',
};

export const saveOfflineData = async (key: string, data: any) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving offline data:', error);
  }
};

export const getOfflineData = async (key: string) => {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting offline data:', error);
    return null;
  }
};

export const addToSyncQueue = async (
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'PUT',
  endpoint: string,
  data: any,
  localId: number | null = null,
  tableName?: string
) => {
  try {
    const operation = action === 'POST' ? 'CREATE' : action === 'PUT' ? 'UPDATE' : action;
    const resolvedTableName = tableName || getTableNameFromEndpoint(endpoint);
    if (!resolvedTableName) {
      throw new Error(`Unable to resolve table name from endpoint: ${endpoint}`);
    }
    await enqueueSyncQueue(operation, endpoint, data, localId, resolvedTableName);
  } catch (error) {
    console.error('Error adding to SQLite sync queue:', error);
  }
};

export const getSyncQueue = async () => {
  return await getPendingSyncQueueItems();
};

export const clearSyncQueue = async () => {
  return await clearSqlSyncQueue();
};

export { STORAGE_KEYS };

let isSyncing = false;

export const syncOfflineData = async (apiService: {
  post: (endpoint: string, data: any) => Promise<any>;
  put: (endpoint: string, data: any) => Promise<any>;
  patch?: (endpoint: string, data: any) => Promise<any>;
  delete?: (endpoint: string) => Promise<any>;
}) => {
  if (isSyncing) return false;

  const queue = await getPendingSyncQueueItems();
  if (queue.length === 0) return true;

  isSyncing = true;
  console.log(`Attempting to sync ${queue.length} items...`);
  const remainingQueue: any[] = [];
  let successCount = 0;

  try {
    for (const item of queue) {
      try {
        if (item.operation === 'CREATE') {
          await apiService.post(item.endpoint, JSON.parse(item.payload_json));
        } else if (item.operation === 'UPDATE') {
          await apiService.put(item.endpoint, JSON.parse(item.payload_json));
        } else if (item.operation === 'DELETE' && apiService.delete) {
          await apiService.delete(item.endpoint);
        }
        successCount++;
      } catch (error: any) {
        if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 401) {
          console.error(`Invalid item skipped:`, item.endpoint, error.response.data);
        } else {
          remainingQueue.push(item);
        }
      }
    }

    await clearSqlSyncQueue();
    for (const item of remainingQueue) {
      await enqueueSyncQueue(item.operation, item.endpoint, JSON.parse(item.payload_json), item.local_id, item.table_name);
    }
    return remainingQueue.length === 0;
  } finally {
    isSyncing = false;
    if (successCount > 0) {
      console.log(`${successCount} items synced successfully.`);
    }
  }
};

