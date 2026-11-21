import { expect, test } from '../../fixtures/identity';

/**
 * 049 US6 (D443, D191, `@full`). The owner pastes a card-per-section file, sees cards and their
 * category in the preview, imports, opens review filtered to the import and discards the whole
 * import in one confirmed action. The deck comes from the `webDeck` fixture (created and deleted per test).
 */
test('the owner imports a card-per-section file and discards the whole import @full', async ({
  page,
  webDeck,
}) => {
  const category = `Health ${webDeck.slug}`;
  const titles = ['Clinic hours', 'Pharmacy', 'Dentist'].map((t) => `${t} ${webDeck.slug}`);
  const file = [
    `# ${category}`,
    '',
    ...titles.flatMap((t) => [`## ${t}`, `Details for ${t}.`, '']),
  ];

  await page.goto(`/d/${webDeck.slug}/import`);
  await page.getByLabel('Paste your notes').fill(file.join('\n'));
  await page.getByRole('button', { name: 'Preview' }).click();

  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByText('3 notes found.')).toBeVisible();
  for (const title of titles) await expect(preview.getByText(title, { exact: true })).toBeVisible();
  await expect(preview.getByText(category, { exact: true })).toHaveCount(3);

  const imports = page.waitForResponse(
    (res) => res.request().method() === 'POST' && /\/imports$/.test(res.url()),
  );
  await page.getByRole('button', { name: 'Import 3 cards' }).click();
  expect((await imports).status(), 'imports POST').toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Imported 3' })).toBeVisible();

  await page.getByRole('link', { name: 'Review them' }).click();
  await expect(page).toHaveURL(/\/review\?source=Pasted(%20|\+)notes$/);
  for (const title of titles)
    await expect(page.getByRole('article', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Discard all from this import' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Every card still waiting from')).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard all', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Discarded 3 cards' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});
