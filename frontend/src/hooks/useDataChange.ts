import { useEffect, useRef, useCallback } from 'react';
import { DataChangeEvent, subscribeToTables } from '../utils/dataEvents';

export const useDataChange = (
  tableNames: string[],
  onChange: () => void,
  debounceMs = 100,
  /**
   * Réagir aussi aux évènements « SYNC » (une ligne persistée depuis le serveur
   * lors d'une simple lecture). Par défaut NON : sinon un écran qui s'auto-
   * rafraîchit sur une table qu'il lit lui-même se re-fetch en boucle
   * (lecture → persistance → évènement SYNC → lecture → …). Les vraies
   * mutations (CREATE/UPDATE/DELETE) et les fins de synchro de fond
   * (action 'UPDATE' émise par le SyncManager) déclenchent toujours le refresh.
   */
  reactToSync = false
): void => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleEvent = useCallback(
    (event: DataChangeEvent) => {
      if (event.action === 'SYNC' && !reactToSync) return;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onChange();
      }, debounceMs);
    },
    [debounceMs, onChange, reactToSync]
  );

  useEffect(() => {
    const key = tableNames.join(',');
    const unsubscribe = subscribeToTables(tableNames, handleEvent);
    return () => {
      unsubscribe();
      clearTimer();
    };
  }, [handleEvent, tableNames.join(',')]);
};

export const useAutoRefreshData = (
  tableNames: string[],
  fetchData: () => Promise<any> | void,
  debounceMs = 100
): void => {
  useDataChange(tableNames, () => {
    void fetchData();
  }, debounceMs);
};
