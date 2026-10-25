import type { APIRequestContext } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/** D106: a proposal created over the API (the ingest pipeline produces the same shape). */
async function propose(api: APIRequestContext, deck: WebDeck, title: string): Promise<string> {
  const cats = await api.get(`decks/${deck.id}/categories`);
  expect(cats.status(), 'list categories').toBe(200);
  const { data } = (await cats.json()) as { data: { id: string; isDefault: boolean }[] };
  const categoryIds = data.filter((c) => c.isDefault).map((c) => c.id);

  const res = await api.post(`decks/${deck.slug}/items`, {
    data: {
      type: 'text',
      title,
      body: 'Shared from the smoke test',
      status: 'proposed',
      categoryIds,
    },
  });
  expect(res.status(), 'create proposal').toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('an owner reviews proposals from the header pill: publish and discard @smoke', async ({
  page,
  api,
  webDeck,
}) => {
  const kept = `Proposal kept ${webDeck.slug}`;
  const dropped = `Proposal dropped ${webDeck.slug}`;
  await propose(api, webDeck, kept);
  await propose(api, webDeck, dropped);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByRole('heading', { name: kept })).toHaveCount(0);
  await page.getByRole('link', { name: 'Review · 2' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/review$`));

  const keptCard = page.getByRole('article', { name: kept });
  await keptCard.getByRole('button', { name: 'Publish' }).click();
  await expect(keptCard).toHaveCount(0);

  const droppedCard = page.getByRole('article', { name: dropped });
  await droppedCard.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Nothing to review')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Review · / })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Review', exact: true })).toBeVisible();

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByRole('heading', { name: kept })).toBeVisible();
  await expect(page.getByRole('heading', { name: dropped })).toHaveCount(0);
});

test('an owner reaches an empty review queue and their shares from it (D198) @smoke', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByText('Nothing to review')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Your shares' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/shares$`));
  await expect(page.getByRole('heading', { name: 'Your shares' })).toBeVisible();
});

test('the review page refuses a slug that does not exist @smoke', async ({ page }) => {
  await page.goto(webUrl('/d/smoke-no-such-deck/review'));
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
});
