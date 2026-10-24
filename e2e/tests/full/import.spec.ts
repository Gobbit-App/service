import { expect, test, webUrl } from '../../fixtures/web';

const NOTES = ['Plumber', 'Pharmacy hours', 'School office', 'Recycling day', 'Bike shop'];

/**
 * D189–D191 bulk import (021, `@full`). The owner pastes five notes, imports them as
 * proposals, opens review filtered to the import and publishes all of them at once. Only the
 * channel and the bulk call are new: proposals and publishing reuse the smoke-covered review path.
 */
test('the owner imports pasted notes and bulk-publishes them from review @full', async ({
  page,
  api,
  webDeck,
}) => {
  const titles = NOTES.map((note) => `${note} ${webDeck.slug}`);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Import notes' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/import$`));

  await page.getByLabel('Paste your notes').fill(titles.join('\n'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('5 notes found.')).toBeVisible();

  const imports = page.waitForResponse(
    (res) => res.request().method() === 'POST' && /\/imports$/.test(res.url()),
  );
  await page.getByRole('button', { name: 'Import 5 cards' }).click();
  expect((await imports).status(), 'imports POST').toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Imported 5' })).toBeVisible();

  await page.getByRole('link', { name: 'Review them' }).click();
  await expect(page).toHaveURL(/\/review\?source=Pasted(%20|\+)notes$/);
  await expect(page.getByText('From “Pasted notes”')).toBeVisible();
  for (const title of titles)
    await expect(page.getByRole('article', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await page.getByRole('button', { name: 'Publish selected (5)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published 5 cards' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);

  const res = await api.get(`decks/${webDeck.id}/items?limit=50`);
  expect(res.status(), 'list items').toBe(200);
  const { data } = (await res.json()) as { data: { title: string }[] };
  expect(data.map((item) => item.title)).toEqual(expect.arrayContaining(titles));
});
