/**
 * freeXan Caption — useJsx Hook
 *
 * React hook wrapping csi.callJSX with loading/error state management.
 * Returns a callable function + status.
 */
import { useCallback, useState } from 'react';
import { csi } from '@/lib/csi';
import { useSessionStore } from '@/store/sessionStore';

interface UseJsxReturn<T> {
  execute: (funcName: string, params?: unknown) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

export function useJsx<T = unknown>(): UseJsxReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLastAction = useSessionStore((s) => s.setLastAction);

  const execute = useCallback(
    async (funcName: string, params?: unknown): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await csi.callJSX<T>(funcName, params);
        setLastAction(funcName);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        console.error(`[useJsx] ${funcName} failed:`, msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setLastAction]
  );

  return { execute, loading, error };
}
