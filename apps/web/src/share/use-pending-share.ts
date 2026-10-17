import { useEffect, useState } from 'react';
import type { SharedPayload } from './share-payload';
import { readPending } from './share-store';

export type PendingShare =
  { status: 'loading' } | { status: 'ready'; payload: SharedPayload | null };

type Loaded = { id: string; payload: SharedPayload | null };

/**
 * D108: the share the service worker stashed under `?pending=<id>`. No id (the paste entry)
 * is ready at once with nothing; a read failure is treated as "nothing pending".
 */
export function usePendingShare(
  id: string | undefined,
  read: (id: string, now: number) => Promise<SharedPayload | null> = readPending,
): PendingShare {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    read(id, Date.now())
      .catch((err: unknown) => {
        console.error('[share] reading the pending share failed', err);
        return null;
      })
      .then((payload) => {
        if (active) setLoaded({ id, payload });
      });
    return () => {
      active = false;
    };
  }, [id, read]);

  if (!id) return { status: 'ready', payload: null };
  if (loaded?.id !== id) return { status: 'loading' };
  return { status: 'ready', payload: loaded.payload };
}
