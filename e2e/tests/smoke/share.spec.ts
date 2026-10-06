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
