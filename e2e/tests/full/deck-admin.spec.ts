import { expect, SMOKE_CATEGORY, test, webUrl } from '../../fixtures/web';

/** The one standing invitee user on the deployed DB (shared with `smoke/members.spec.ts`). */
const INVITEE = 'smoke-invitee@example.test';

/**
 * D184/D185 deck settings (019, `@full`). The owner sets a category to Everyone, makes the deck
 * public through the confirm step and invites a co-owner, all from the UI. A second admin cannot
 * sign in from e2e (the invite needs the emailed magic link), so role changes of accepted
 * members and the role gates are covered by the integration and component suites.
 */
test('the owner makes the deck public and invites a co-owner from Deck settings @full', async ({
  page,
  api,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Deck settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/settings$`));
  await expect(page.getByRole('heading', { name: 'Deck settings' })).toBeVisible();

  const visibility = page.getByLabel(`Who sees ${SMOKE_CATEGORY.name}`);
  const categoryPatch = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && /\/categories\//.test(res.url()),
  );
  await visibility.selectOption('public');
  expect((await categoryPatch).status(), 'category PATCH').toBe(200);

  await page.getByRole('switch', { name: 'Public' }).check();
  const dialog = page.getByRole('dialog', { name: 'Make this deck public?' });
  await expect(dialog).toContainText(SMOKE_CATEGORY.name);
  await dialog.getByRole('button', { name: 'Make public' }).click();
  await expect(page.getByRole('switch', { name: 'Public' })).toBeChecked();
  await expect(page.getByText(`/p/${webDeck.slug}`)).toBeVisible();

  const deck = await api.get(`decks/${webDeck.id}`);
  expect(((await deck.json()) as { isPublic: boolean }).isPublic, 'deck is public').toBe(true);

  const invite = page.getByRole('form', { name: 'Invite someone' });
  await invite.getByLabel('Email').fill(INVITEE);
  await invite.getByLabel('Role').selectOption('owner');
  await invite.getByRole('button', { name: 'Send invite' }).click();
  await expect(invite.getByRole('status')).toContainText(`Invite sent to ${INVITEE}`);
  const row = page.getByRole('listitem').filter({ hasText: INVITEE });
  await expect(row).toContainText('Invited · Co-owner');
  await expect(row.getByRole('button', { name: /^Cancel invite/ })).toBeVisible();
});
