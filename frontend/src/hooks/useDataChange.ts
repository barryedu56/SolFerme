import { useEffect, useRef, useCallback } from 'react';
import { DataChangeEvent, subscribeToTables } from '../utils/dataEvents';

export const useDataChange = (
  tableNames: string[],
  onChange: () => void,
  debounceMs = 100
): void => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleEvent = useCallback(
    (_event: DataChangeEvent) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onChange();
      }, debounceMs);
    },
    [debounceMs, onChange]
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
