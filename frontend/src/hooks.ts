import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error, loading, reload, setData };
}
export function useDebounce(value: string, delay = 250) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return out;
}
