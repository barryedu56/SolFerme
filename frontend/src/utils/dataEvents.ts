export type DataChangeAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC' | 'CLEANUP';

export interface DataChangeEvent {
  tableName: string;
  endpoint?: string;
  id?: number;
  action?: DataChangeAction;
}

type Subscriber = (event: DataChangeEvent) => void;

const subscribers = new Set<Subscriber>();

// ── Tampon d'évènements pendant une transaction SQLite ──
// Pendant une transaction, les écritures ne sont pas encore committées : notifier
// les composants tout de suite les ferait lire un état intermédiaire. On met les
// évènements en attente et on les rejoue (dédupliqués) après le COMMIT.
let bufferDepth = 0;
let bufferedEvents: DataChangeEvent[] = [];

export const beginEmitBuffer = (): void => {
  bufferDepth++;
};

export const flushEmitBuffer = (commit: boolean): void => {
  bufferDepth = Math.max(0, bufferDepth - 1);
  if (bufferDepth > 0) return;
  const pending = bufferedEvents;
  bufferedEvents = [];
  if (!commit) return; // ROLLBACK → on jette les évènements (rien n'a changé)
  const seen = new Set<string>();
  for (const evt of pending) {
    const key = `${evt.tableName}|${evt.action || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dispatch(evt);
  }
};

const dispatch = (event: DataChangeEvent): void => {
  subscribers.forEach((callback) => {
    try {
      callback(event);
    } catch (error) {
      console.warn('[DataEvents] subscriber error:', error);
    }
  });
};

export const subscribeToDataChanges = (callback: Subscriber): (() => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

export const subscribeToTables = (
  tableNames: string[],
  callback: Subscriber
): (() => void) => {
  const wrapped = (event: DataChangeEvent) => {
    if (tableNames.includes(event.tableName)) {
      callback(event);
    }
  };
  subscribers.add(wrapped);
  return () => subscribers.delete(wrapped);
};

export const emitDataChange = (event: DataChangeEvent): void => {
  if (bufferDepth > 0) {
    bufferedEvents.push(event);
    return;
  }
  dispatch(event);
};
