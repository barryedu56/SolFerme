import {
  deleteRow,
  enqueueSyncQueue,
  fetchRow,
  fetchRows,
  getNextOfflineId,
  getServerIdForLocalId,
  getSyncQueueItemByLocalId,
  insertRow,
  updateRow,
  updateSyncQueueItem,
  deleteSyncQueueItem,
} from '../database/localDatabase';

const cleanPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload;
  const cleaned = { ...payload };
  delete cleaned.id;
  delete cleaned._needs_sync;
  return cleaned;
};

export class LocalRepository<T extends { id?: number }> {
  constructor(private tableName: string, private endpoint: string) {}

  async list(whereClause = '1=1', params: any[] = []): Promise<T[]> {
    return fetchRows<T>(this.tableName, whereClause, params);
  }

  async get(id: number): Promise<T | null> {
    return fetchRow<T>(this.tableName, 'id = ?', [id]);
  }

  async create(payload: Partial<T>): Promise<T> {
    const localId = await getNextOfflineId();
    const storedPayload = { ...(payload as Record<string, any>), id: localId, _needs_sync: 1 };
    await insertRow(this.tableName, storedPayload);
    await enqueueSyncQueue('CREATE', this.endpoint, cleanPayload(payload), localId, this.tableName);
    return storedPayload as unknown as T;
  }

  async update(id: number, payload: Partial<T>): Promise<T> {
    const localRecord = await fetchRow<T>(this.tableName, 'id = ?', [id]);
    if (!localRecord) {
      throw new Error(`Local ${this.tableName} record not found: ${id}`);
    }

    const updatedData = { ...localRecord, ...(payload as Record<string, any>), _needs_sync: 1 };
    await updateRow(this.tableName, id, updatedData);

    if (id < 0) {
      const pendingCreate = await getSyncQueueItemByLocalId(id, this.tableName);
      if (pendingCreate && pendingCreate.operation === 'CREATE') {
        const mergedPayload = { ...JSON.parse(pendingCreate.payload_json), ...cleanPayload(payload) };
        await updateSyncQueueItem(pendingCreate.id, { payload_json: JSON.stringify(mergedPayload) });
        return updatedData as T;
      }
    }

    const existingPendingUpdate = await getSyncQueueItemByLocalId(id, this.tableName);
    const serverId = await getServerIdForLocalId(id, this.tableName);
    const targetId = serverId || id;
    const payload = cleanPayload(payload);

    if (existingPendingUpdate && existingPendingUpdate.operation === 'UPDATE') {
      const mergedPayload = { ...JSON.parse(existingPendingUpdate.payload_json), ...payload };
      await updateSyncQueueItem(existingPendingUpdate.id, { payload_json: JSON.stringify(mergedPayload), updated_at: new Date().toISOString() });
      return updatedData as T;
    }

    await enqueueSyncQueue('UPDATE', `${this.endpoint}${targetId}/`, payload, id, this.tableName);
    return updatedData as T;
  }

  async delete(id: number): Promise<void> {
    if (id < 0) {
      const pendingCreate = await getSyncQueueItemByLocalId(id, this.tableName);
      if (pendingCreate && pendingCreate.operation === 'CREATE') {
        await deleteSyncQueueItem(pendingCreate.id);
      }
      await deleteRow(this.tableName, id);
      return;
    }

    const serverId = (await getServerIdForLocalId(id, this.tableName)) || id;
    await deleteRow(this.tableName, id);
    await enqueueSyncQueue('DELETE', `${this.endpoint}${serverId}/`, {}, id, this.tableName);
  }
}
