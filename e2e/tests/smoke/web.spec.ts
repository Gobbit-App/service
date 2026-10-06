import { resolveE2eEnv } from '../../lib/env';
import { SMOKE_CATEGORY, expect, test, webUrl } from '../../fixtures/web';

const { expectedSha } = resolveE2eEnv();
const NARROW = { width: 360, height: 780 };

test('shell loads and /version.json reports the deployed commit @smoke', async ({
  page,
  request,
}) => {
  const res = await request.get(webUrl('/version.json'));
  expect(res.status()).toBe(200);
  const { commit } = (await res.json()) as { commit: string };
  if (expectedSha) expect(commit).toBe(expectedSha);

  await page.goto(webUrl('/?all=true'));
  await expect(page.getByRole('banner')).toBeVisible();
});

test('the deck list shows the smoke deck @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl('/?all=true'));
  await expect(page.getByRole('link', { name: `Smoke ${webDeck.slug}` })).toBeVisible();
});

test('a signed-out deep link lands on sign-in with next @smoke', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(webUrl('/d/x'));
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fd%2Fx$/);
    await expect(page.getByRole('button', { name: /sign-in link/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('every card type renders without horizontal overflow at 360 px @smoke', async ({
  page,
  webDeck,
}) => {
  await page.setViewportSize(NARROW);
  await page.goto(webUrl(`/d/${webDeck.slug}`));

  for (const item of webDeck.items) {
    await expect(page.getByRole('heading', { name: item.title })).toBeVisible();
  }

  const overflowing = await page
    .locator('article.card')
    .evaluateAll((cards) =>
      cards
        .filter((card) => card.scrollWidth > card.clientWidth)
        .map((card) => card.querySelector('h2')?.textContent ?? '?'),
    );
  expect(overflowing).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    NARROW.width,
  );

  const calc = page.getByRole('article', { name: 'Smoke calc' });
  const result = calc.locator('output');
  await expect(result).toHaveText('400');
  await calc.getByLabel('Servings', { exact: true }).fill('6');
  await expect(result).toHaveText('600');
});

test('a category chip filters the deck and updates the URL @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page
    .getByRole('navigation', { name: 'Categories' })
    .getByRole('link', { name: SMOKE_CATEGORY.name })
    .click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/c/${SMOKE_CATEGORY.slug}$`));
  await expect(page.getByRole('heading', { name: 'Smoke table' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smoke text' })).toHaveCount(0);
});

test('a favorite survives a reload @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const card = page.getByRole('article', { name: 'Smoke text' });

  const saved = page.waitForResponse(
    (res) => res.url().endsWith('/favorite') && res.request().method() === 'POST',
  );
  await card.getByRole('button', { name: 'Add to favorites' }).click();
  expect((await saved).status()).toBe(204);

  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Smoke text' }).getByRole('button', {
      name: 'Remove from favorites',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
});
