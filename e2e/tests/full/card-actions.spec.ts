import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * 024 card actions (D210–D216, `@full`): accessible names and contrast in both themes, labels
 * that hide on narrow screens, long-press and hover tooltips kept on screen (D217), offline menu items and no editor styles
 * leaking onto the card bar. The critical path (archive/delete through "More actions", the
 * position menu) runs in the `@smoke` lifecycle and browse specs.
 */

function textCard(deck: WebDeck) {
  const card = deck.items.find((item) => item.type === 'text');
  if (!card) throw new Error('the web deck has no text card');
  return card;
}

const moreActions = (page: Page) => page.getByRole('button', { name: 'More actions' });

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withRules(['button-name', 'link-name', 'color-contrast'])
    .analyze();
  return results.violations.map((v) => ({
    id: v.id,
    targets: v.nodes.map((node) => node.target.join(' ')),
  }));
}

/** The control's styles that editor.css used to override (US3). */
async function barStyle(control: Locator) {
  return control.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      minWidth: style.minWidth,
      height: style.height,
      background: style.backgroundColor,
      color: style.color,
      border: style.borderTopWidth,
    };
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`card actions have names and enough contrast (${colorScheme}) @full`, async ({
    page,
    webDeck,
  }) => {
    await page.emulateMedia({ colorScheme });
    const card = textCard(webDeck);

    await page.goto(webUrl(`/i/${card.id}`));
    await expect(page.getByRole('heading', { name: card.title })).toBeVisible();
    await expect(moreActions(page)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    // the open menu too (portalled to <body>)
    await moreActions(page).click();
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(page.getByRole('link', { name: 'Add card' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    // the other pages that use the shared buttons: account settings and deck admin
    await page.goto(webUrl('/settings'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('icon labels hide on narrow screens and show on wide ones @full', async ({
  page,
  webDeck,
}) => {
  const label = page.getByRole('link', { name: 'Add card' }).locator('.button__label');

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByRole('link', { name: 'Add card' })).toBeVisible();
  const narrow = await label.boundingBox();
  expect(narrow?.width ?? 0).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1024, height: 780 });
  await expect.poll(async () => (await label.boundingBox())?.width ?? 0).toBeGreaterThan(20);

  // every icon-only control keeps a 44 px hit area
  await page.goto(webUrl(`/i/${textCard(webDeck).id}`));
  for (const control of await page.locator('.card__bar .icon-button').all()) {
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('a long press shows the tooltip without running the action @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}`));
  const more = moreActions(page);
  await expect(more).toHaveAttribute('data-tip', 'More actions');

  const box = await more.boundingBox();
  if (!box) throw new Error('More actions has no box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(more).toHaveAttribute('data-tip-open', '');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // the click that follows the release is swallowed: no menu opened
  await expect(page.getByRole('menu')).toHaveCount(0);
});

/** The tooltip's box (the control's `::after`), or null while it is hidden. */
async function tipBox(control: Locator) {
  return control.evaluate((el) => {
    const style = getComputedStyle(el, '::after');
    if (style.display === 'none') return null;
    const box = el.getBoundingClientRect();
    const shift = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    const pad = (a: string, b: string) =>
      style.boxSizing === 'border-box' ? 0 : parseFloat(a) + parseFloat(b);
    const left = box.left + parseFloat(style.left) + shift.m41;
    const top = box.top + parseFloat(style.top) + shift.m42;
    return {
      left,
      top,
      right: left + parseFloat(style.width) + pad(style.paddingLeft, style.paddingRight),
      bottom: top + parseFloat(style.height) + pad(style.paddingTop, style.paddingBottom),
    };
  });
}

/** D217: the tooltip is shown and fully on screen. */
async function expectTipOnScreen(page: Page, control: Locator) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  await expect.poll(() => tipBox(control)).not.toBeNull();
  const tip = await tipBox(control);
  expect(tip?.top ?? -1).toBeGreaterThanOrEqual(0);
  expect(tip?.left ?? -1).toBeGreaterThanOrEqual(0);
  expect(tip?.right ?? Infinity).toBeLessThanOrEqual(viewport.width);
  expect(tip?.bottom ?? Infinity).toBeLessThanOrEqual(viewport.height);
}

test.describe('with a mouse', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1024, height: 780 } });

  test('hovering an icon control shows its tooltip on screen (D217) @full', async ({
    page,
    webDeck,
  }) => {
    await page.goto(webUrl(`/i/${textCard(webDeck).id}`));
    const controls = [
      page.getByRole('link', { name: 'Back' }),
      page.getByRole('link', { name: 'Settings' }),
      page.getByRole('button', { name: 'Sign out' }),
      page.getByRole('link', { name: 'Edit' }),
      moreActions(page),
    ];
    for (const control of controls) {
      await control.hover();
      await expectTipOnScreen(page, control);
    }

    // a right-click keeps the browser menu: nothing is swallowed or opened
    await page.mouse.move(0, 0);
    await moreActions(page).click({ button: 'right' });
    await expect(moreActions(page)).not.toHaveAttribute('data-tip-open', '');
  });
});

test('a long press on a header control shows its tooltip on screen (D217) @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}`));
  const back = page.getByRole('link', { name: 'Back' });
  await expect(back).toBeVisible();

  const box = await back.boundingBox();
  if (!box) throw new Error('Back has no box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(back).toHaveAttribute('data-tip-open', '');
  await expectTipOnScreen(page, back);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // the release does not follow the link
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
});

test('offline, server actions stay in the menu and say why they do nothing @full', async ({
  page,
  context,
  api,
  webDeck,
}) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}`));
  await expect(moreActions(page)).toBeVisible();

  await context.setOffline(true);
  try {
    await moreActions(page).click();
    const archive = page.getByRole('menuitem', { name: 'Archive' });
    await expect(archive).toHaveAttribute('aria-disabled', 'true');
    await expect(archive).toHaveAttribute('data-tip', /needs a connection/);
    await archive.click({ force: true });
  } finally {
    await context.setOffline(false);
  }
  const res = await api.get(`items/${card.id}`);
  expect(((await res.json()) as { status: string }).status).toBe('published');
});

test('the editor stylesheet does not restyle the card bar @full', async ({ page, webDeck }) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}`));
  const before = await barStyle(moreActions(page));

  // the editor's lazy chunk loads editor.css; back in-app (no reload) it stays in the document
  await page.goto(webUrl(`/i/${card.id}/edit`));
  await expect(page.getByRole('textbox').first()).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  await expect(moreActions(page)).toBeVisible();
  expect(await barStyle(moreActions(page))).toEqual(before);
});
