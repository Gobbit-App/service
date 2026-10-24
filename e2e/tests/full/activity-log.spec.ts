import { expect, test, webUrl } from '../../fixtures/web';

/**
 * D186–D188 activity log (020 T013, `@full`). A second admin cannot sign in from e2e (an invite
 * needs the emailed magic link), so the owner does both writes; the integration suite covers
 * names of other admins and the role gates.
 */
test('the owner sees a publish and an archive in Activity and a card history @full', async ({
  page,
  api,
  webDeck,
}) => {
  const me = await api.get('me');
  expect(me.status(), 'me').toBe(200);
  const { user } = (await me.json()) as { user: { displayName: string } };

  const cats = await api.get(`decks/${webDeck.id}/categories`);
  const { data } = (await cats.json()) as { data: { id: string; isDefault: boolean }[] };
  const title = `Proposal logged ${webDeck.slug}`;
  const proposal = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'text',
      title,
      body: 'Logged',
      status: 'proposed',
      categoryIds: data.filter((c) => c.isDefault).map((c) => c.id),
    },
  });
  expect(proposal.status(), 'create proposal').toBe(201);
  const { id: proposalId } = (await proposal.json()) as { id: string };
  expect((await api.post(`items/${proposalId}/publish`, { data: {} })).status()).toBe(200);

  const archived = webDeck.items[0];
  expect((await api.post(`items/${archived.id}/archive`)).status()).toBe(200);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/log$`));
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();

  const published = page.locator('.event-row', { hasText: 'Published' }).filter({ hasText: title });
  await expect(published).toBeVisible();
  await expect(published).toContainText(user.displayName);
  const archivedRow = page
    .locator('.event-row', { hasText: 'Archived' })
    .filter({ hasText: archived.title });
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow).toContainText(user.displayName);

  await published.getByRole('link', { name: title }).click();
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Card history' })).toBeVisible();
  await expect(page.locator('.event-row')).toHaveCount(2); // proposed + published
  await expect(page.locator('.event-row', { hasText: archived.title })).toHaveCount(0);
});
