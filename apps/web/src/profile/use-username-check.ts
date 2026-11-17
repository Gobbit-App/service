import { useEffect, useState } from 'react';
import { checkUsernameShape } from '@gobbit/shared/username';
import { api, unwrap } from '../api/client';

export const USERNAME_SHAPE_MESSAGE = 'Use 3–30 letters, digits, ., _ or -';
export const USERNAME_TAKEN_MESSAGE = "That name isn't available";

export type UsernameCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'invalid' | 'reserved' | 'unavailable' };

const IDLE: UsernameCheck = { status: 'idle' };

/** Human text for a refusal, from the local check, the advisory check or the save (D425). */
export const usernameMessage = (reason: string): string =>
  reason === 'invalid' ? USERNAME_SHAPE_MESSAGE : USERNAME_TAKEN_MESSAGE;

/**
 * D425: advisory availability while typing. Skips the call for an empty or unchanged name and for
 * a shape the client already refuses; waits `delay` ms after the last key; a failed or
 * rate-limited call says nothing (the save decides). Never learns who holds a name.
 */
export function useUsernameCheck(value: string, saved: string | null, delay = 400): UsernameCheck {
  const name = value.trim();
  const [answer, setAnswer] = useState<{ name: string; result: UsernameCheck } | null>(null);
  const shape = name ? checkUsernameShape(name) : 'ok';
  const unchanged = name.toLowerCase() === (saved ?? '').toLowerCase();
  const skip = !name || unchanged || shape !== 'ok';

  useEffect(() => {
    if (skip) return;
    let live = true;
    const timer = setTimeout(() => {
      unwrap(api.POST('/me/username/check', { body: { username: name } }))
        .then((res) => {
          const result: UsernameCheck = res.available
            ? { status: 'available' }
            : { status: 'unavailable', reason: res.reason ?? 'unavailable' };
          if (live) setAnswer({ name, result });
        })
        .catch(() => {
          if (live) setAnswer({ name, result: IDLE });
        });
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, skip, delay]);

  if (!name || unchanged) return IDLE;
  if (shape !== 'ok') return { status: 'unavailable', reason: shape };
  return answer?.name === name ? answer.result : { status: 'checking' };
}
