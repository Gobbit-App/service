import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';
import { searchButton } from '../smoke/helpers/deck-header';

/**
 * 039 composer frame (`@full`, D300/D308/D310): the editor is its own page — no deck search,
 * no category nav, no bottom bar — with a top bar of Close, the heading and Save; Ctrl+Enter
 * saves and Escape leaves through the unsaved-changes guard. Save/Close themselves are `@smoke`.
 * Also the type chooser and type control (D301–D303): keyboard-only picking, switching with and
 * without content to lose, and resuming an unsaved draft's type. And the canvas (D305–D309): no
 * sideways scroll from 320 px to 1280 px, 44 px targets, the Preview toggle, axe in both themes.
 */

const textCard = (deck: WebDeck) => deck.items.find((item) => item.type === 'text')!;
const discardDialog = (page: Page) => page.getByRole('dialog', { name: 'Discard changes?' });

async function expectNoDeckChrome(page: Page): Promise<void> {
  await expect(searchButton(page)).toHaveCount(0);
  await expect(page.locator('.bottom-bar')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

test('the composer replaces the deck chrome, which is back after leaving @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await expect(page.getByRole('heading', { level: 1, name: 'New card' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(`Smoke ${webDeck.slug}`);
  await expectNoDeckChrome(page);

  await page.goto(webUrl(`/i/${textCard(webDeck).id}/edit`));
  await expect(page.getByRole('heading', { level: 1, name: 'Edit card' })).toBeVisible();
  await expectNoDeckChrome(page);

  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${textCard(webDeck).id}$`));
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(searchButton(page)).toBeVisible();
  await expect(page.locator('.bottom-bar')).toBeVisible();
});

test('a blocked Save says why only after an attempt (D308) @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Title is required')).toHaveCount(0);

  await save.click();
  await expect(page.getByText('Title is required')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new\\?type=text$`));
});

test('Ctrl+Enter saves from the text field (D310) @full', async ({ page, webDeck }) => {
  const title = `Keyboard ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Title', { exact: true }).press('Control+Enter');
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('Escape leaves: untouched at once, changed through the guard (D310) @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}/edit`));
  await page.getByLabel('Title', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));

  await page.goto(webUrl(`/i/${card.id}/edit`));
  await page.getByLabel('Title', { exact: true }).fill(`Changed ${card.title}`);
  await page.keyboard.press('Escape');
  await expect(discardDialog(page)).toBeVisible();
  // Escape in the open dialog is Keep editing, not a second leave.
  await page.keyboard.press('Escape');
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));

  await page.keyboard.press('Escape');
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
});

test('a card type is picked from the chooser by keyboard alone (D301) @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  const group = page.getByRole('radiogroup', { name: 'Card type' });
  await expect(group.getByRole('radio')).toHaveCount(6);
  await expect(group.getByRole('radio', { name: 'Text' })).toBeFocused();
  // Arrows move focus only (wrapping); Enter picks.
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: 'Calc' })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Link' })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\?type=link$/);
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  // The chooser was replaced, so Back leaves the new card rather than returning to it.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/new/);
});

test('switching type asks only when content would be lost; Keep cancels (D303) @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));
  await page.getByLabel('Title', { exact: true }).fill('Kept title');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/kept');

  await page.getByRole('button', { name: 'Card type: Link' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a card type' });
  await expect(chooser.getByRole('radio', { name: 'Link' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await chooser.getByRole('radio', { name: 'Table' }).click();
  const confirm = page.getByRole('dialog', { name: 'Switch to Table?' });
  await expect(confirm).toContainText('Your link content will be removed.');
  await expect(confirm.getByRole('button', { name: 'Keep Link' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep Link' }).click();
  await expect(page.getByLabel('URL', { exact: true })).toHaveValue('https://example.com/kept');
  await expect(page).toHaveURL(/\?type=link$/);

  await page.getByRole('button', { name: 'Card type: Link' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a card type' })
    .getByRole('radio', { name: 'Table' })
    .click();
  await page
    .getByRole('dialog', { name: 'Switch to Table?' })
    .getByRole('button', { name: 'Switch' })
    .click();
  await expect(page).toHaveURL(/\?type=table$/);
  await expect(page.getByLabel('Column 1 heading')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Kept title');
});

test('a bare new-card link resumes an unsaved draft on its type (D302) @full', async ({
  page,
  webDeck,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=calc`));
  await page.getByLabel('Title', { exact: true }).fill('Half a calc');
  // Autosave is debounced (500 ms); wait for it before leaving.
  await page.waitForTimeout(800);

  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await expect(page.getByRole('button', { name: 'Card type: Calc' })).toBeVisible();
  await expect(page.getByText('Restore unsaved draft?')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Card type' })).toHaveCount(0);
});

const WIDTHS = [320, 375, 768, 1280] as const;

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the canvas never scrolls sideways from 320 px to 1280 px (US3) @full', async ({
  page,
  webDeck,
}) => {
  for (const type of ['text', 'link', 'table'] as const) {
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=${type}`));
    await expect(page.getByLabel('Title')).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      expect(await sidewaysOverflow(page), `${type} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test('the top bar and type control are at least 44 px (US3) @full', async ({ page, webDeck }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  const targets = [
    page.getByRole('link', { name: 'Close' }),
    page.getByRole('button', { name: 'Preview', exact: true }),
    page.getByRole('button', { name: 'Save' }),
    page.getByRole('button', { name: /^Card type: / }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('Preview swaps the canvas on a phone, gives focus back; side by side when wide (D309) @full', async ({
  page,
  webDeck,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  const title = page.getByLabel('Title');
  const toggle = page.getByRole('button', { name: 'Preview', exact: true });
  const preview = page.getByRole('region', { name: 'Preview', exact: true });
  await title.fill('Seen in the preview');
  await expect(preview).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toContainText('Seen in the preview');
  await expect(title).toBeHidden();
  await toggle.click();
  await expect(title).toBeVisible();
  await expect(toggle).toBeFocused();

  // Escape leaves the preview first, not the composer; focus goes back to the toggle.
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();
  await expect(page).toHaveURL(/\/new\?type=text$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toggle).toBeHidden();
  await expect(title).toBeVisible();
  await expect(preview).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the composer has names, labels and enough contrast (${colorScheme}) @full`, async ({
    page,
    webDeck,
  }) => {
    await page.emulateMedia({ colorScheme });
    for (const path of ['/new?type=link', '/new']) {
      await page.goto(webUrl(`/d/${webDeck.slug}${path}`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withRules(['button-name', 'link-name', 'label', 'color-contrast', 'aria-allowed-attr'])
        .analyze();
      const violations = results.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((node) => node.target.join(' ')),
      }));
      expect(violations, path).toEqual([]);
    }
  });
}
