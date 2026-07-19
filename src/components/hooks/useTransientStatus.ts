import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

const DEFAULT_STATUS_DURATION = 5_000;

export function useTransientStatus(
  duration = DEFAULT_STATUS_DURATION,
): readonly [string | null, Dispatch<SetStateAction<string | null>>] {
  const [entry, setEntry] = useState<{ message: string; nonce: number } | null>(null);
  const setStatus = useCallback<Dispatch<SetStateAction<string | null>>>((nextStatus) => {
    setEntry((current) => {
      const currentMessage = current?.message ?? null;
      const message = typeof nextStatus === 'function' ? nextStatus(currentMessage) : nextStatus;
      return message ? { message, nonce: Date.now() } : null;
    });
  }, []);

  useEffect(() => {
    if (!entry) return;
    const timer = window.setTimeout(() => setStatus(null), duration);
    return () => window.clearTimeout(timer);
  }, [duration, entry, setStatus]);

  return [entry?.message ?? null, setStatus] as const;
}
