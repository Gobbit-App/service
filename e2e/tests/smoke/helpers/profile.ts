import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

/** 046: a username unique per run (lowercase letters and digits only). */
export const smokeUsername = (): string => `smoke${randomUUID().replace(/-/g, '').slice(0, 10)}`;

/** D50: the smoke owner is a standing user; clear the profile a test set so the DB is left as found. */
export async function clearProfile(api: APIRequestContext): Promise<void> {
  await api.patch('me/profile', {
    data: { username: null, firstName: null, lastName: null, location: null },
  });
}
