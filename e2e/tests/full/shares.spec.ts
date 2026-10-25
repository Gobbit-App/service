import type { Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * D198 "Your shares" (022 T016, `@full`). Shares need an extraction provider to run, so the list,
 * the retry and the card links are stubbed at the page edge; the deck, its header link and the
 * cards opened from the rows are the real API.
 */
type Share = Record<string, unknown> & { id: string; state: string };

function share(deck: WebDeck, n: number, fields: Partial<Share>): Share {
  return {
    id: `00000000-0000-4000-8000-00000000090${n}`,
    deckId: deck.id,
    channel: 'paste',
    createdAt: new Date().toISOString(),
    state: 'processing',
    preview: { title: null, host: null, photoCount: 0 },
    failureCode: null,
    canRetry: false,
    autoPublish: null,
    item: null,
    reviewedBy: null,
    reviewedAt: null,
    ...fields,
  };
}

/** Serves `shares` as the deck's list; `onRetry` answers `POST /shares/{id}/retry`. */
async function stubShares(
  page: Page,
  shares: () => Share[],
  onRetry?: (id: string) => { status: number; body: unknown },
) {
  await page.route(/\/api\/decks\/[^/]+\/shares$/, (route) =>
    route.fulfill({ json: { shares: shares() } }),
  );
  await page.route(/\/api\/shares\/[^/]+\/retry$/, (route) => {
    const id = route.request().url().split('/').at(-2) ?? '';
    const answer = onRetry?.(id) ?? { status: 500, body: {} };
    return route.fulfill({
      status: answer.status,
      contentType: answer.status >= 400 ? 'application/problem+json' : 'application/json',
      body: JSON.stringify(answer.body),
    });
  });
}

test('a failed share is retried and turns to processing @full', async ({ page, webDeck }) => {
  let failed = share(webDeck, 1, {
    preview: { title: null, host: 'a.example', photoCount: 0 },
    state: 'failed',
    failureCode: 'assistant_unavailable',
    canRetry: true,
  });
  await stubShares(
    page,
    () => [failed],
    () => {
      failed = { ...failed, state: 'processing', failureCode: null, canRetry: false };
      return { status: 202, body: failed };
    },
  );

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Your shares' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/shares$`));

  const row = page.getByRole('listitem').filter({ hasText: 'a.example' });
  await expect(row).toContainText("Couldn't add this");
  await expect(row).toContainText("The assistant wasn't available.");
  await row.getByRole('button', { name: 'Try again' }).click();
  await expect(row).toContainText('Processing…');
  await expect(row.getByRole('button')).toHaveCount(0);
});

test('rows in review and published link to their cards @full', async ({ page, webDeck }) => {
  const [first, second] = webDeck.items;
  if (!first || !second) throw new Error('the web deck needs two cards');
  await stubShares(page, () => [
    share(webDeck, 2, {
      state: 'in_review',
      autoPublish: 'held_needs_category',
      item: { id: first.id, title: first.title, deleted: false },
    }),
    share(webDeck, 3, {
      state: 'published',
      autoPublish: 'published',
      item: { id: second.id, title: second.title, deleted: false },
    }),
  ]);

  await page.goto(webUrl(`/d/${webDeck.slug}/shares`));
  const review = page.getByRole('listitem').filter({ hasText: first.title });
  await expect(review).toContainText('Waiting for review — needs a category');
  await expect(page.getByRole('listitem').filter({ hasText: second.title })).toContainText(
    'Published',
  );

  await review.getByRole('link', { name: 'Open proposal' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${first.id}$`));
});

test('an expired share offers Paste it again @full', async ({ page, webDeck }) => {
  const gone = share(webDeck, 4, {
    preview: { title: null, host: 'b.example', photoCount: 0 },
    state: 'failed',
    failureCode: 'fetch_failed',
    canRetry: true,
  });
  await stubShares(
    page,
    () => [gone],
    () => ({ status: 410, body: { title: 'Gone', status: 410 } }),
  );

  await page.goto(webUrl(`/d/${webDeck.slug}/shares`));
  const row = page.getByRole('listitem').filter({ hasText: 'b.example' });
  await row.getByRole('button', { name: 'Try again' }).click();
  await row.getByRole('link', { name: 'Paste it again' }).click();
  await expect(page).toHaveURL(new RegExp(`/share\\?deck=${webDeck.slug}$`));
});
