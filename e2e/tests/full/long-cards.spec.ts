import { expect, test } from '../../fixtures/identity';

/**
 * Long cards in the item list (docs/design/web-pwa.md "Long cards in lists", `@full`): a long
 * card stays near 60% of the screen and expands and collapses on demand; a short one has no
 * toggle; a reload starts capped again.
 */
const verse = (n: number) =>
  `**[Verse ${n}]**\nRemember summer green of grass\nblades prickly on our skin\nblue skies above shimmer\nmirrors of her eyes within`;

test('long list cards are capped and expand per card @full', async ({ page, api, smokeDeck }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  for (const data of [
    { type: 'text', title: 'Short note', body: 'Bus leaves at 7:40.' },
    { type: 'text', title: 'Lyrics', body: [1, 2, 3, 4, 5, 6, 7].map(verse).join('\n\n') },
  ]) {
    const res = await api.post(`decks/${smokeDeck.slug}/items`, { data });
    expect(res.status(), `create ${data.title}`).toBe(201);
  }

  await page.goto(`/d/${smokeDeck.slug}`);
  const card = page.getByRole('article', { name: 'Lyrics' });
  const more = card.getByRole('button', { name: 'Show more: Lyrics' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('article', { name: 'Short note' }).getByRole('button', { name: /Show more/ }),
  ).toHaveCount(0);

  const capped = (await card.boundingBox())!.height;
  expect(capped).toBeLessThanOrEqual(915 * 0.65);
  await expect(card.getByText('[Verse 7]')).not.toBeInViewport();

  await more.click();
  const less = card.getByRole('button', { name: 'Show less: Lyrics' });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  expect((await card.boundingBox())!.height).toBeGreaterThan(capped + 200);

  await less.click();
  await expect(more).toBeVisible();
  expect((await card.boundingBox())!.height).toBeCloseTo(capped, 0);
  await expect(card).toBeInViewport();

  await more.click();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Show more: Lyrics' })).toBeVisible();
});
