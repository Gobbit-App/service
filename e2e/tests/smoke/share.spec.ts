import { expect, test } from '../../fixtures/identity';
import { webUrl } from '../../lib/stack';

/** D59: a card in a non-communal deck shares only the generic private preview. */
test('a private share page carries the generic OG tags and no card text @smoke', async ({
  anon,
  webDeck,
}) => {
  const item = webDeck.items.find((i) => i.type === 'text');
  if (!item) throw new Error('smoke deck has no text card');

  const res = await anon.get(webUrl(`/s/${item.id}`), { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toBe('noindex');

  const html = await res.text();
  expect(html).toMatch(/<meta property="og:title" content="A card was shared with you">/);
  expect(html).toMatch(/<meta property="og:image" content="[^"]+\/og\/private\.png">/);
  expect(html).not.toContain(item.title);
});

/**
 * D108/D198: the deck's "Paste" button opens the share screen and posts to the real API. The e2e
 * stack has no AI key, so ingestion is off (`hasExtractProvider`): the API answers 503 and the
 * screen says so instead of "Sent". Given a key, the same flow ends on "Sent" + "Your shares".
 */
test('pasting a text reaches the API, which says ingestion is not configured @smoke', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste or share' }).click();
  await expect(page).toHaveURL(new RegExp(`/share\\?deck=${webDeck.slug}$`));
  await expect(page.getByLabel('Deck', { exact: true })).toHaveValue(webDeck.slug);

  const send = page.getByRole('button', { name: 'Send to Gobbit' });
  await expect(send).toBeDisabled();
  await page.getByLabel('Text').fill('Gate code 1234');
  const ingest = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname.endsWith('/api/ingest') && res.request().method() === 'POST',
  );
  await send.click();
  const res = await ingest;

  expect(res.status()).toBe(503);
  expect(res.request().postData()).toContain('Gate code 1234');
  expect(res.request().postData()).toContain(webDeck.id);
  await expect(page.getByRole('alert')).toContainText('Ingestion is not configured');
  await expect(page.getByRole('heading', { name: 'Sent' })).toHaveCount(0);
  await expect(page.getByLabel('Text')).toHaveValue('Gate code 1234');
});

test('an expired or failed share falls back to the paste box @smoke', async ({
  page,
  anon,
  webDeck,
}) => {
  // The paste box needs a deck the user can write to; without its own it raced other tests' decks.
  expect(webDeck.slug).toBeTruthy();
  const res = await anon.post(webUrl('/share'), { multipart: { text: 'hi' }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('/share?failed=1');

  await page.goto(webUrl('/share?failed=1'));
  await expect(page.getByText("Couldn't receive what you shared.")).toBeVisible();

  await page.goto(webUrl('/share?pending=missing'));
  await expect(page.getByText('That share expired or was already sent.')).toBeVisible();
  await expect(page.getByLabel('Text')).toHaveValue('');
});
