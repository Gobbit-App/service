import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * 022 editor navigation (`@full`): the header back matrix (D200), the unsaved-changes guard
 * on browser back, reload/close and the review inline edit (D201–D204). The core journey
 * (Cancel, header back, Keep editing / Discard) is `@smoke` in smoke/editor.spec.ts.
 */

const backLink = (page: Page) => page.getByRole('link', { name: 'Back' });
const discardDialog = (page: Page) => page.getByRole('dialog', { name: 'Discard changes?' });
const textCard = (deck: WebDeck) => deck.items.find((item) => item.type === 'text')!;

async function propose(api: APIRequestContext, deck: WebDeck, title: string): Promise<string> {
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: 'Proposed by the e2e test', status: 'proposed' },
  });
  expect(res.status(), 'create proposal').toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('the header back goes one level up, and the deck list has none @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  const cases: [from: string, to: string][] = [
    [`/i/${card.id}`, `/d/${webDeck.slug}`],
    [`/d/${webDeck.slug}/new`, `/d/${webDeck.slug}`],
    [`/i/${card.id}/edit`, `/i/${card.id}`],
    [`/i/${card.id}/edit?from=review`, `/d/${webDeck.slug}/review`],
    ['/settings', '/?all=true'],
    [`/d/${webDeck.slug}`, '/?all=true'],
  ];
  for (const [from, to] of cases) {
    await page.goto(webUrl(from));
    await expect(backLink(page), from).toHaveAttribute('href', to);
  }

  // The last hop lands on the deck list: the top, so no back control.
  await backLink(page).click();
  await expect(page).toHaveURL(/\/\?all=true$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(backLink(page)).toHaveCount(0);
});

test('browser back from a changed editor asks; Keep editing stays, Discard leaves @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  const editUrl = new RegExp(`/i/${card.id}/edit$`);
  await page.goto(webUrl(`/i/${card.id}`));
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(`Changed ${webDeck.slug}`);

  // The browser has already moved back when the router holds it; Keep editing restores it.
  await page.goBack();
  await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`Changed ${webDeck.slug}`);

  await page.goBack();
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  await expect(page.getByRole('heading', { name: card.title })).toBeVisible();
});

test('asking writes the draft at once; Escape keeps editing; a reload offers it @full', async ({
  page,
  webDeck,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill('Kept text');
  // No wait for the 500 ms autosave: the attempt to leave writes the draft (D204).
  await backLink(page).click();
  await expect(discardDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Kept text');

  await page.reload();
  await expect(page.getByText('Restore unsaved draft?')).toBeVisible();
});

test('closing a changed editor triggers the browser prompt; unchanged does not @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  const prompts: string[] = [];
  page.on('dialog', (dialog) => {
    prompts.push(dialog.type());
    void dialog.dismiss();
  });
  await page.goto(webUrl(`/i/${card.id}/edit`));
  // Chromium shows "leave site?" only after a user interaction with the page.
  await page.getByLabel('Title', { exact: true }).click();
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(prompts).toEqual([]);

  const changed = await page.context().newPage();
  changed.on('dialog', (dialog) => {
    prompts.push(dialog.type());
    void dialog.dismiss();
  });
  await changed.goto(webUrl(`/i/${card.id}/edit`));
  await changed.getByLabel('Title', { exact: true }).fill(`Changed ${card.title}`);
  await changed.close({ runBeforeUnload: true });
  await expect.poll(() => prompts).toEqual(['beforeunload']);
  expect(changed.isClosed()).toBe(false);
});

test('switching the type of a new card and saving never ask @full', async ({ page, webDeck }) => {
  const title = `No prompt ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('radio', { name: 'Link' }).check();
  await expect(page).toHaveURL(/\?type=link$/);
  await page.getByRole('radio', { name: 'Text' }).check();
  await expect(discardDialog(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('the review inline edit asks before dropping changes @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Inline ${webDeck.slug}`;
  await propose(api, webDeck, title);
  await page.goto(webUrl(`/d/${webDeck.slug}/review`));
  await page.getByRole('article', { name: title }).getByRole('button', { name: 'Edit' }).click();
  // In edit mode the card has no heading, so it has no name: it is the only proposal here.
  const proposal = page.getByRole('region', { name: 'Proposals' });
  await proposal.getByLabel('Title', { exact: true }).fill(`${title} renamed`);

  await proposal.getByRole('button', { name: 'Cancel' }).click();
  await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(proposal.getByLabel('Title', { exact: true })).toHaveValue(`${title} renamed`);

  // Leaving the page asks too.
  await backLink(page).click();
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/review$`));

  await proposal.getByRole('button', { name: 'Cancel' }).click();
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(proposal.getByRole('button', { name: 'Publish' })).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
