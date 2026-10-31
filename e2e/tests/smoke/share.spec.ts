import { expect, test, webUrl } from '../../fixtures/web';

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

/** D108/D198: the deck's "Paste" button opens the share screen; Sent follows the share. */
test('pasting a text sends it and links to Your shares @smoke', async ({ page, webDeck }) => {
  // The ingest endpoint needs an extraction provider; the UI flow is what's under test here.
  let sent: string | null = null;
  const shareId = '00000000-0000-4000-8000-000000000999';
  await page.route('**/api/ingest', async (route) => {
    sent = route.request().postData();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ id: shareId, status: 'queued' }),
    });
  });
  // The stubbed share has no job row, so its status is stubbed at the page edge too.
  await page.route(`**/api/shares/${shareId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: shareId,
        deckId: webDeck.id,
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
      }),
    }),
  );

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Paste' }).click();
  await expect(page).toHaveURL(new RegExp(`/share\\?deck=${webDeck.slug}$`));
  await expect(page.getByLabel('Deck', { exact: true })).toHaveValue(webDeck.slug);

  const send = page.getByRole('button', { name: 'Send to Gobbit' });
  await expect(send).toBeDisabled();
  await page.getByLabel('Text').fill('Gate code 1234');
  await send.click();

  await expect(page.getByRole('heading', { name: 'Sent' })).toBeVisible();
  await expect(page.getByText('Processing…')).toBeVisible();
  await expect(page.getByText(/appear in review/i)).toHaveCount(0);
  expect(sent).toContain('Gate code 1234');
  expect(sent).toContain(webDeck.id);

  // The real (empty) list: the stubbed share was never stored.
  await page.getByRole('link', { name: 'Your shares' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/shares$`));
  await expect(page.getByRole('heading', { name: 'Your shares' })).toBeVisible();
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
