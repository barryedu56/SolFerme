export type DataChangeAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC' | 'CLEANUP';

export interface DataChangeEvent {
  tableName: string;
  endpoint?: string;
  id?: number;
  action?: DataChangeAction;
}

type Subscriber = (event: DataChangeEvent) => void;

const subscribers = new Set<Subscriber>();

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
  subscribers.forEach((callback) => {
    try {
      callback(event);
    } catch (error) {
      console.warn('[DataEvents] subscriber error:', error);
    }
  });
};
