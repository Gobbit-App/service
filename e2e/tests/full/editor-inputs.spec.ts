import type { APIRequestContext, Page } from '@playwright/test';
import { expect, SMOKE_CATEGORY, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * 023 editor inputs (`@full`): the URL rule on every URL input (D205), Undo, refusal and failure
 * of instant category saves (D207). The happy paths are in smoke/editor.spec.ts.
 */

function textCard(deck: WebDeck) {
  const card = deck.items.find((item) => item.type === 'text');
  if (!card) throw new Error('the web deck has no text card');
  return card;
}

async function categoryIdsOf(api: APIRequestContext, itemId: string): Promise<string[]> {
  const res = await api.get(`items/${itemId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { categoryIds: string[] }).categoryIds;
}

const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('Undo puts the categories back on the server @full', async ({ page, api, webDeck }) => {
  const card = textCard(webDeck);
  const before = await categoryIdsOf(api, card.id);
  await page.goto(webUrl(`/i/${card.id}/edit`));

  await chip(page, SMOKE_CATEGORY.name).click();
  await expect(page.getByText('Categories saved')).toBeVisible();
  const restored = page.waitForResponse(
    (res) => res.url().endsWith(`/api/items/${card.id}`) && res.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await restored).status()).toBe(200);

  await expect(page.getByText('Categories restored')).toBeVisible();
  await expect(chip(page, SMOKE_CATEGORY.name)).toHaveAttribute('aria-pressed', 'false');
  expect([...(await categoryIdsOf(api, card.id))].sort()).toEqual([...before].sort());
});

test("a published card's last category can't be removed @full", async ({ page, api, webDeck }) => {
  const card = textCard(webDeck);
  const [only] = await categoryIdsOf(api, card.id);
  await page.goto(webUrl(`/i/${card.id}/edit`));
  // Text cards without categories land in the deck default, General (0002_invariants).
  const general = chip(page, 'General');
  await expect(general).toHaveAttribute('aria-pressed', 'true');

  let patched = false;
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().endsWith(`/api/items/${card.id}`)) patched = true;
  });
  await general.click();

  await expect(page.getByText('A published card needs at least one category.')).toBeVisible();
  await expect(general).toHaveAttribute('aria-pressed', 'true');
  expect(patched).toBe(false);
  expect(await categoryIdsOf(api, card.id)).toEqual([only]);
});

test('a failed category save puts the chips back and says so @full', async ({
  page,
  api,
  webDeck,
}) => {
  const card = textCard(webDeck);
  const before = await categoryIdsOf(api, card.id);
  await page.route(new RegExp(`/api/items/${card.id}$`), (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ type: 'about:blank', title: 'Internal error', status: 500 }),
        })
      : route.fallback(),
  );
  await page.goto(webUrl(`/i/${card.id}/edit`));

  await chip(page, SMOKE_CATEGORY.name).click();
  await expect(
    page.getByText("Couldn't save the categories. They're back as they were."),
  ).toBeVisible();
  await expect(chip(page, SMOKE_CATEGORY.name)).toHaveAttribute('aria-pressed', 'false');
  expect(await categoryIdsOf(api, card.id)).toEqual(before);
});

test('the source URL field prefills https:// and normalises what is typed @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/i/${textCard(webDeck).id}/edit`));
  const source = page.getByLabel('Source URL', { exact: true });

  await source.focus();
  await expect(source).toHaveValue('https://');
  await source.blur();
  await expect(source).toHaveValue('');

  await source.fill('example.org/menu');
  await source.blur();
  await expect(source).toHaveValue('https://example.org/menu');

  await source.fill('http://intranet.example/');
  await source.blur();
  await expect(source).toHaveValue('http://intranet.example/');

  await source.fill('mailto:someone@example.org');
  await source.blur();
  await expect(source).toHaveValue('mailto:someone@example.org');
  await expect(page.getByText('Enter a valid web address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save card' })).toBeDisabled();
});

test('a full address pasted over the prefill is not doubled @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));
  const url = page.getByLabel('URL', { exact: true });
  await url.focus();
  await expect(url).toHaveValue('https://');
  await url.pressSequentially('https://example.org/x');
  await expect(url).toHaveValue('https://example.org/x');
});

test('the share form adds https:// to a bare link @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/share?deck=${webDeck.slug}`));
  const link = page.getByLabel('Link', { exact: true });
  await link.focus();
  await expect(link).toHaveValue('https://');
  await link.fill('example.org/recipe');
  await link.blur();
  await expect(link).toHaveValue('https://example.org/recipe');
  await expect(page.getByRole('button', { name: 'Send to Gobbit' })).toBeEnabled();
});
