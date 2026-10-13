import { test, expect } from '../../fixtures/api';

interface SearchHit {
  item: { id: string; title: string };
  why: 'text' | 'semantic' | 'both';
}

test('deck search finds a phone fragment and nothing for gibberish @smoke', async ({
  api,
  smokeDeck,
}) => {
  const created = await api.post(`decks/${smokeDeck.slug}/items`, {
    data: { type: 'text', title: 'Dentist', body: 'Dr. Levi, call 054-7712345' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  const hit = await api.get(`decks/${smokeDeck.slug}/search`, { params: { q: '7712345' } });
  expect(hit.status()).toBe(200);
  const { data } = (await hit.json()) as { data: SearchHit[] };
  expect(data[0]?.item.id).toBe(id);
  expect(['text', 'both']).toContain(data[0]?.why);

  const miss = await api.get(`decks/${smokeDeck.slug}/search`, { params: { q: 'zqxjvw' } });
  expect(miss.status()).toBe(200);
  expect(((await miss.json()) as { data: SearchHit[] }).data).toEqual([]);
});

test('a blank search query is a 400 problem @smoke', async ({ api, smokeDeck }) => {
  const res = await api.get(`decks/${smokeDeck.slug}/search`, { params: { q: '  ' } });
  expect(res.status()).toBe(400);
  expect(res.headers()['content-type']).toContain('application/problem+json');
});
