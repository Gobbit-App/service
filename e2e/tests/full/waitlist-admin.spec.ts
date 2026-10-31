import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

async function isPlatformAdmin(api: APIRequestContext): Promise<boolean> {
  const me = await api.get('me');
  expect(me.status(), 'me').toBe(200);
  return ((await me.json()) as { isPlatformAdmin: boolean }).isPlatformAdmin;
}

/**
 * 032 (`@full`): the admin screen against a stack whose `PLATFORM_ADMINS` lists the smoke owner.
 * e2e can read neither the confirm nor the invite email, so the journey joins through the
 * public form (a pending entry), finds it under Pending and removes it after the confirm step;
 * invite → first sign-in → personal deck with `general` is covered by `admin-waitlist.int.test.ts`
 * (see specs/032-waitlist-admin/implementation-notes.md).
 */
test('a platform admin finds a new entry under Pending and removes it @full', async ({
  page,
  api,
  anon,
}) => {
  test.skip(!(await isPlatformAdmin(api)), 'the smoke owner is not in PLATFORM_ADMINS');

  const email = `smoke-waitlist-${randomUUID().slice(0, 8)}@example.test`;
  const join = await anon.post('waitlist', { data: { email, kind: 'family', note: 'e2e' } });
  expect(join.status(), 'join').toBe(202);

  await page.goto(webUrl('/settings'));
  await page.getByRole('link', { name: 'Waitlist' }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist$/);
  await expect(page.getByRole('button', { name: /^Confirmed/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: /^Pending/ }).click();
  await page.getByLabel('Kind').selectOption('family');
  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row).toContainText('Family');
  await expect(row.getByRole('button', { name: /^Invite/ })).toHaveCount(0);

  await row.getByRole('button', { name: `Remove ${email}` }).click();
  const removal = page.waitForResponse(
    (res) => res.request().method() === 'DELETE' && /\/admin\/waitlist\//.test(res.url()),
  );
  await row.getByRole('button', { name: `Remove ${email}` }).click();
  expect((await removal).status(), 'remove').toBe(204);
  await expect(page.getByRole('listitem').filter({ hasText: email })).toHaveCount(0);

  await page.getByRole('button', { name: /^Removed/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: email })).toBeVisible();
});

/** 032 negative: anyone else gets the unknown-route 404 from the API and not-found in the app. */
test('a signed-in non-admin sees not-found at /admin/waitlist @full', async ({ page, api }) => {
  test.skip(await isPlatformAdmin(api), 'the smoke owner is a platform admin on this stack');

  const list = await api.get('admin/waitlist');
  expect(list.status(), 'admin list').toBe(404);

  await page.goto(webUrl('/admin/waitlist'));
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Status' })).toHaveCount(0);
});
