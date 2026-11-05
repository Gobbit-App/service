import type { Locator, Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/** 038: the rich body editor (US2, T019) and styled text on the card and public page (US3, T030). */

const PHONE = { width: 360, height: 780 };

const bodyOf = (page: Page): Locator => page.getByLabel('Body', { exact: true });
const tool = (page: Page, name: string): Locator =>
  page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name, exact: true });

async function openNewCard(page: Page, slug: string): Promise<Locator> {
  await page.goto(webUrl(`/d/${slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill(`Rich ${slug}`);
  const body = bodyOf(page);
  await body.click();
  return body;
}

/** Roving focus: arrow along the toolbar until `name` has focus (one tab stop, D290). */
async function arrowTo(page: Page, name: string): Promise<void> {
  const target = tool(page, name);
  for (let step = 0; step < 30; step += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('ArrowRight');
  }
  throw new Error(`toolbar never focused ${name}`);
}

/**
 * A native caret move (arrow keys) reaches ProseMirror on the next `selectionchange`; a real
 * person is never faster than that, automation is. Give it a beat before the next key.
 */
async function caret(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}

/** Shift+Tab from the text to the toolbar, arrow to `name`, press Enter. */
async function pressTool(page: Page, name: string): Promise<void> {
  await page.keyboard.press('Shift+Tab');
  await arrowTo(page, name);
  await page.keyboard.press('Enter');
}

/**
 * Selections are made with Ctrl/Cmd+A: ProseMirror's own keymap applies it at once, whereas a
 * native selection (Shift+Arrow) is read on `selectionchange`, which an automated Shift+Tab can
 * beat, and Home/End don't move by line on macOS.
 */
test('the toolbar works from the keyboard alone', async ({ page, webDeck }) => {
  const body = await openNewCard(page, webDeck.slug);
  await page.keyboard.type('Hello world');
  await page.keyboard.press('ControlOrMeta+A');

  await page.keyboard.press('Shift+Tab');
  await expect(tool(page, 'Bold')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(body.locator('strong')).toHaveText('Hello world');
  await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
  // The command hands focus back to the text.
  await expect(body).toBeFocused();

  await caret(page, 'ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plan');
  await pressTool(page, 'Heading 2');
  await expect(body.locator('h2')).toHaveText('Plan');

  await page.keyboard.press('ControlOrMeta+A');
  await pressTool(page, 'Link');
  const address = page.getByLabel('Link address');
  await expect(address).toBeFocused();
  await address.fill('example.com/plan');
  await page.keyboard.press('Enter');
  await expect(body.locator('a').first()).toHaveAttribute('href', /example\.com\/plan/);

  await page.keyboard.press('ControlOrMeta+A');
  await pressTool(page, 'Clear formatting');
  await expect(body.locator('strong, h2, a')).toHaveCount(0);
  await expect(body).toContainText('Hello world');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body.locator('h2')).toHaveText('Plan');
  await pressTool(page, 'Redo');
  await expect(body.locator('strong, h2, a')).toHaveCount(0);
});

test('headings, lists, quote and code block toggle on and off', async ({ page, webDeck }) => {
  const body = await openNewCard(page, webDeck.slug);
  await page.keyboard.type('Item');

  const blocks: [string, string][] = [
    ['Heading 1', 'h1'],
    ['Heading 3', 'h3'],
    ['Bulleted list', 'ul li'],
    ['Numbered list', 'ol li'],
    ['Quote', 'blockquote'],
    ['Code block', 'pre'],
  ];
  for (const [name, selector] of blocks) {
    await tool(page, name).click();
    await expect(body.locator(selector), name).toHaveText('Item');
    await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'true');
    await tool(page, name).click();
    await expect(body.locator(selector), `${name} off`).toHaveCount(0);
  }
  await expect(body.locator('p')).toHaveText('Item');
});

test('a colour from the picker and large text show on the card', async ({ page, webDeck }) => {
  const title = `Rich ${webDeck.slug}`;
  const body = await openNewCard(page, webDeck.slug);
  await page.keyboard.type('Red alert');
  await page.keyboard.press('ControlOrMeta+A');
  await tool(page, 'Text colour').click();
  await page
    .getByRole('group', { name: 'Text colour' })
    .getByRole('button', { name: 'Red' })
    .click();
  await tool(page, 'Large text').click();
  await expect(body.locator('.rt-color--red')).toContainText('Red alert');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.locator('.rt-color--red')).toContainText('Red alert');
  await expect(listed.locator('.rt-large')).toContainText('Red alert');
  await expect(listed).not.toContainText(':color');
});

test('a paste keeps only the supported styles', async ({ page, webDeck }) => {
  const body = await openNewCard(page, webDeck.slug);
  await body.evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p><b>Strong</b> <span style="font-family: Papyrus; background: yellow">plain</span>' +
        ' <img src="https://example.com/x.png" alt="pic"></p>' +
        '<table><tr><td>cell</td></tr></table>',
    );
    data.setData('text/plain', 'Strong plain cell');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });

  await expect(body.locator('strong')).toHaveText('Strong');
  await expect(body).toContainText('plain');
  await expect(body.locator('img, table, [style]')).toHaveCount(0);
});

test('the editor and its toolbar fit a phone without sideways scrolling', async ({
  page,
  webDeck,
}) => {
  await page.setViewportSize(PHONE);
  const body = await openNewCard(page, webDeck.slug);
  await page.keyboard.type(`${'unbroken'.repeat(12)} and some words after it`);

  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  const box = await toolbar.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  const editorBox = await body.boundingBox();
  expect(editorBox && editorBox.x + editorBox.width).toBeLessThanOrEqual(PHONE.width);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

/** T030 (US3): the palette colour and large size render for members and on the public page. */
test('styled text shows on the card and on the public page', async ({
  api,
  browser,
  page,
  webDeck,
}) => {
  const cats = await api.get(`decks/${webDeck.slug}/categories`);
  const chips = ((await cats.json()).data as { id: string; slug: string }[]).find(
    (c) => c.slug === 'smoke-chips',
  );
  if (!chips) throw new Error('smoke deck has no smoke-chips category');
  const created = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'text',
      title: 'Styled card',
      body: 'Note: :color[Red alert]{.red} and :large[big news]',
      payload: {},
      categoryIds: [chips.id],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  await page.goto(webUrl(`/i/${id}`));
  await expectStyled(page.locator('main'));

  expect(
    (
      await api.patch(`decks/${webDeck.slug}/categories/${chips.id}`, {
        data: { visibility: 'public' },
      })
    ).status(),
  ).toBe(200);
  expect((await api.patch(`decks/${webDeck.slug}`, { data: { isPublic: true } })).status()).toBe(
    200,
  );

  const stranger = await browser.newContext();
  const publicPage = await stranger.newPage();
  try {
    await publicPage.goto(webUrl(`/p/${webDeck.slug}/i/${id}`));
    await expectStyled(publicPage.locator('main'));
  } finally {
    await stranger.close();
  }
});

/** Red text in a colour other than the surrounding text, large text bigger than it. */
async function expectStyled(scope: Locator): Promise<void> {
  const red = scope.locator('.rt-color--red');
  const large = scope.locator('.rt-large');
  await expect(red).toHaveText('Red alert');
  await expect(large).toHaveText('big news');
  await expect(scope).not.toContainText(':color');
  const style = await red.evaluate((el) => {
    const parent = getComputedStyle(el.parentElement!);
    const self = getComputedStyle(el);
    return { color: self.color, parentColor: parent.color };
  });
  expect(style.color).not.toBe(style.parentColor);
  const sizes = await large.evaluate((el) => ({
    self: parseFloat(getComputedStyle(el).fontSize),
    parent: parseFloat(getComputedStyle(el.parentElement!).fontSize),
  }));
  expect(sizes.self).toBeGreaterThan(sizes.parent);
}
