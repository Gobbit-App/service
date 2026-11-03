import { randomUUID } from 'node:crypto';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * D269 "New deck" on the deck list (`@full`). The created deck is shared (its settings offer the
 * invite form), opens on its settings, and its back goes to the deck's main page (D267). Each run
 * deletes the deck it made (D50).
 */
test('the owner creates a shared deck from the deck list @full', async ({ page, api }) => {
  const name = `smoke-${randomUUID().slice(0, 8)}`;
  await page.goto(webUrl('/?all=true'));
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill(name);
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/decks'),
  );
  await page.getByRole('button', { name: 'Create deck' }).click();
  const res = await created;
  expect(res.status(), 'POST /decks').toBe(201);
  const deck = (await res.json()) as { id: string; slug: string; kind: string };
  try {
    expect(deck.kind).toBe('shared');
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/settings$`));
    await expect(page.getByRole('form', { name: 'Invite someone' })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}$`));
  } finally {
    const del = await api.delete(`decks/${deck.id}`);
    expect(del.ok(), 'delete the created deck').toBe(true);
  }
});

test('a blank name cannot be submitted and Cancel closes the form @full', async ({ page }) => {
  await page.goto(webUrl('/?all=true'));
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill('   ');
  await expect(page.getByRole('button', { name: 'Create deck' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Deck name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New deck' })).toBeVisible();
});
