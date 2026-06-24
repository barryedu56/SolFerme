import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  FARMS: 'offline_farms',
  LOTS: 'offline_lots',
  PRODUCTIONS: 'offline_productions',
  SALES: 'offline_sales',
  EXPENSES: 'offline_expenses',
  FEED_INVENTORY: 'offline_feed_inventory',
  HEALTH_INVENTORY: 'offline_health_inventory',
  SYNC_QUEUE: 'sync_queue',
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

export const addToSyncQueue = async (action: string, endpoint: string, data: any) => {
  try {
    const queue = await getOfflineData(STORAGE_KEYS.SYNC_QUEUE) || [];
    queue.push({ action, endpoint, data, timestamp: new Date().getTime() });
    await saveOfflineData(STORAGE_KEYS.SYNC_QUEUE, queue);
  } catch (error) {
    console.error('Error adding to sync queue:', error);
  }
};

export const getSyncQueue = async () => {
  return await getOfflineData(STORAGE_KEYS.SYNC_QUEUE) || [];
};

export const clearSyncQueue = async () => {
  await AsyncStorage.removeItem(STORAGE_KEYS.SYNC_QUEUE);
};

export { STORAGE_KEYS };

let isSyncing = false;

export const syncOfflineData = async (apiClient: any) => {
  if (isSyncing) return false;

  const queue = await getSyncQueue();
  if (queue.length === 0) return true;

  isSyncing = true;
  console.log(`Attempting to sync ${queue.length} items...`);
  const remainingQueue = [];
  let successCount = 0;

  try {
    for (const item of queue) {
      try {
        if (item.action === 'POST') {
          await apiClient.post(item.endpoint, item.data);
        } else if (item.action === 'PUT') {
          await apiClient.put(item.endpoint, item.data);
        }
        successCount++;
      } catch (error: any) {
        // Si c'est une erreur 4xx (sauf 401), l'élément est probablement invalide,
        // on ne le garde pas dans la queue pour ne pas bloquer indéfiniment.
        if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 401) {
          console.error(`Invalid item skipped:`, item.endpoint, error.response.data);
        } else {
          remainingQueue.push(item);
        }
      }
    }

    await saveOfflineData(STORAGE_KEYS.SYNC_QUEUE, remainingQueue);
    return remainingQueue.length === 0;
  } finally {
    isSyncing = false;
    if (successCount > 0) {
      console.log(`${successCount} items synced successfully.`);
    }
  }
};

