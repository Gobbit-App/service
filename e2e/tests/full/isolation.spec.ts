import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/identity';

// Below PROFILE_UPDATE_RATE_PER_HOUR_DEFAULT (30, packages/shared/src/limits.ts): the budget is per user.
const SAVES = 25;

async function saveMany(api: APIRequestContext, prefix: string): Promise<number[]> {
  const statuses: number[] = [];
  for (let n = 1; n <= SAVES; n += 1) {
    const res = await api.patch('me/profile', { data: { firstName: `${prefix}${n}` } });
    statuses.push(res.status());
  }
  return statuses;
}

async function firstName(api: APIRequestContext): Promise<string | null> {
  const res = await api.get('me');
  expect(res.status(), 'GET /me').toBe(200);
  return ((await res.json()) as { profile: { firstName: string | null } }).profile.firstName;
}

test.describe('isolation @full', () => {
  test('two users saving their profile in parallel never limit or overwrite each other @full', async ({
    newUser,
  }) => {
    const [a, b] = await Promise.all([newUser('iso-a'), newUser('iso-b')]);

    const [statusesA, statusesB] = await Promise.all([
      saveMany(a.api, 'Alpha'),
      saveMany(b.api, 'Bravo'),
    ]);

    expect(statusesA, 'user A saves').toEqual(Array(SAVES).fill(200));
    expect(statusesB, 'user B saves').toEqual(Array(SAVES).fill(200));
    expect(await firstName(a.api)).toBe(`Alpha${SAVES}`);
    expect(await firstName(b.api)).toBe(`Bravo${SAVES}`);
  });
});
