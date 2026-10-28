import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordsLoad<T> = {
  data: T | null;
  loading: boolean;
  failed: boolean;
  reload: () => void;
};

/**
 * Load one backend read. A newer request (or unmount) discards an older response, so a slow
 * reply can never overwrite what the user is looking at. Reads only: it never writes.
 */
export function useRecordsLoad<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): RecordsLoad<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    const ticket = ++latest.current;
    setLoading(true);
    setFailed(false);
    run().then(
      (value) => {
        if (latest.current !== ticket) return;
        setData(value);
        setLoading(false);
      },
      () => {
        if (latest.current !== ticket) return;
        setData(null);
        setFailed(true);
        setLoading(false);
      },
    );
  }, [run]);

  useEffect(() => {
    reload();
    return () => {
      latest.current += 1;
    };
  }, [reload]);

  return { data, loading, failed, reload };
}
