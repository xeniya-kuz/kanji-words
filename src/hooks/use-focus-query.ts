import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Runs an async query whenever the screen comes into focus (e.g. after returning from an import)
 * and whenever `query` changes. Pass a function memoized with useCallback.
 */
export function useFocusQuery<T>(query: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);

  const reload = useCallback(() => {
    let active = true;
    query().then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
  }, [query]);

  useFocusEffect(reload);
  return { data, reload };
}
