
import { addToSyncQueue, syncOfflineData, getSyncQueue, clearSyncQueue } from '../utils/offlineStorage';

// Mock apiClient
const mockApiClient = {
  post: async (endpoint: string, data: any) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
    return { data: { success: true } };
  },
  put: async (endpoint: string, data: any) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { data: { success: true } };
  }
};

/**
 * Stress test for SyncQueue
 * Objective: Test synchronization with more than 50 elements.
 */
export const runStressTestSyncQueue = async () => {
  console.log('--- Starting Stress Test: SyncQueue ---');

  // 1. Clear existing queue
  await clearSyncQueue();
  console.log('Queue cleared.');

  // 2. Fill the queue with 60 items
  const itemCount = 60;
  console.log(`Adding ${itemCount} items to the queue...`);
  for (let i = 1; i <= itemCount; i++) {
    await addToSyncQueue('POST', '/sales/', { id: i, amount: 100 * i });
  }

  const queueAfterFill = await getSyncQueue();
  console.log(`Queue size: ${queueAfterFill.length}`);

  if (queueAfterFill.length !== itemCount) {
    console.error(`Error: Queue should have ${itemCount} items, but has ${queueAfterFill.length}`);
    return;
  }

  // 3. Run synchronization
  console.log('Starting synchronization...');
  const startTime = Date.now();
  const success = await syncOfflineData(mockApiClient);
  const endTime = Date.now();

  const finalQueue = await getSyncQueue();
  console.log(`Sync completed in ${endTime - startTime}ms`);
  console.log(`Success: ${success}`);
  console.log(`Final queue size: ${finalQueue.length}`);

  if (success && finalQueue.length === 0) {
    console.log('--- Stress Test PASSED ---');
  } else {
    console.log('--- Stress Test FAILED ---');
  }
};
