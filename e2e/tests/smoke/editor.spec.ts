import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/** Below 768px (Pixel 7) the preview is a tab: open it, then read the preview region. */
async function showPreview(page: Page) {
  await page.getByRole('tab', { name: 'Preview' }).click();
  return page.getByRole('region', { name: 'Preview' });
}
const save = (page: Page) => page.getByRole('button', { name: 'Save card' });

test('a text card added from the editor shows in the list and survives a reload @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor text ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Add card' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Body', { exact: true }).fill('Written from the editor');
  const previewText = await (await showPreview(page)).getByRole('article').innerText();
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed).toBeVisible();
  // The preview is the same Card component as the list (D136), minus its actions.
  for (const text of [title, 'Written from the editor']) {
    expect(previewText).toContain(text);
    await expect(listed).toContainText(text);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a link card added from the editor is listed with its url @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor link ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  await page.getByRole('radio', { name: 'Link' }).check();
  await expect(page).toHaveURL(/\?type=link$/);
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/recipes');
  await page.getByLabel('Preview title', { exact: true }).fill('Recipes');
  await expect(await showPreview(page)).toContainText('Recipes');
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a 601-character body disables Save and says why @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  await page.getByLabel('Title', { exact: true }).fill('Too long');
  await page.getByLabel('Body', { exact: true }).fill('x'.repeat(601));

  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Fix 1 field')).toBeVisible();
  await expect(page.getByText('601 / 600 characters')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
});

test('the category chips start on the deck default category @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  const chips = page.getByRole('group', { name: 'Categories' }).getByRole('button');
  await expect(chips).not.toHaveCount(0);
  await expect(chips.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
});

test('a table card keeps a moved row and stops at 12 rows @smoke', async ({ page, webDeck }) => {
  const title = `Editor table ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=table`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Column 1 heading').fill('Day');
  await page.getByLabel('Column 2 heading').fill('Meal');
  await page.getByLabel('Row 1, Day').fill('Monday');
  await page.getByLabel('Row 1, Meal').fill('Soup');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Row 2, Day').fill('Tuesday');
  await page.getByLabel('Row 2, Meal').fill('Pasta');
  await page.getByRole('button', { name: 'Move row 2 up' }).click();
  await expect(page.getByLabel('Row 1, Day')).toHaveValue('Tuesday');

  const addRow = page.getByRole('button', { name: 'Add row' });
  for (let rows = 2; rows < 12; rows += 1) await addRow.click();
  await expect(addRow).toBeDisabled();
  for (let row = 12; row > 2; row -= 1) {
    await page.getByRole('button', { name: `Remove row ${row}` }).click();
  }

  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.getByRole('row').nth(1)).toContainText('Tuesday');
  await expect(card.getByRole('row').nth(2)).toContainText('Monday');
});

test('a calc card shows its live result; a bad expression disables Save @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor calc ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=calc`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  const first = page.getByRole('group', { name: 'Field 1' });
  await first.getByLabel('Label').fill('Price');
  await first.getByLabel('Default').fill('3');
  await page.getByRole('button', { name: 'Add field' }).click();
  const second = page.getByRole('group', { name: 'Field 2' });
  await second.getByLabel('Label').fill('Count');
  await second.getByLabel('Default').fill('4');
  await page.getByLabel('Result label', { exact: true }).fill('Total');

  await page.getByLabel('Expression', { exact: true }).fill('a * (');
  await expect(save(page)).toBeDisabled();

  await page.getByLabel('Expression', { exact: true }).fill('a * b');
  await expect(page.getByText('Total: 12').first()).toBeVisible();
  await expect(save(page)).toBeEnabled();
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a card is edited from its page; the type is fixed @smoke', async ({ page, webDeck }) => {
  const card = webDeck.items.find((item) => item.type === 'text')!;
  const title = `Edited ${webDeck.slug}`;
  await page.goto(webUrl(`/i/${card.id}`));
  await page.getByRole('link', { name: 'Edit', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));
  await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(card.title);

  await page.getByLabel('Title', { exact: true }).fill(title);
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('list cards link to the editor @smoke', async ({ page, webDeck }) => {
  const card = webDeck.items.find((item) => item.type === 'table')!;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: card.title }) })
    .getByRole('link', { name: 'Edit', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));
  await expect(page.getByLabel('Column 1 heading')).toHaveValue('Day');
});

test('an unsaved card comes back after a reload; sign-out forgets it @smoke', async ({
  page,
  webDeck,
}) => {
  const newCard = webUrl(`/d/${webDeck.slug}/new`);
  const restoreOffer = page.getByText('Restore unsaved draft?');
  await page.goto(newCard);
  await page.getByLabel('Title', { exact: true }).fill('Half-written');
  await page.getByLabel('Body', { exact: true }).fill('Not saved yet');
  // Autosave is debounced (500 ms); wait for it before leaving.
  await page.waitForTimeout(800);

  await page.reload();
  await expect(restoreOffer).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Half-written');
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('Not saved yet');
  await page.waitForTimeout(800);

  // The smoke session is shared by the suite: answer the logout call locally so the server
  // session survives, while the app still runs its sign-out cleanup (drafts included).
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204 }));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.unroute('**/auth/logout');

  await page.goto(newCard);
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  await page.waitForTimeout(300);
  await expect(restoreOffer).toHaveCount(0);
});

test('a category created inline is selected and the card is saved in it @smoke', async ({
  page,
  webDeck,
}) => {
  const category = `School ${webDeck.slug}`;
  const title = `Editor category ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill(title);

  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('New category name').fill(category);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: category })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Creating the same name again (409) picks the existing category instead of failing.
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('New category name').fill(category);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: category })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await page.getByRole('link', { name: category }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const photoFile = { name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG };

/** 008: `/config` as the real API answers it, with the cloud name overridden for this page. */
async function routeCloudName(page: Page, cloudName: string | null) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, cloudinaryCloudName: cloudName } });
  });
}

/** 008: Cloudinary image delivery, answered locally. */
async function routeImageDelivery(page: Page) {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

/** 008: a fake upload permission and Cloudinary; tests never reach the real service (D133). */
async function routeFakeCloudinary(page: Page, publicId: string) {
  const cloud = 'e2e-cloud';
  await routeCloudName(page, cloud);
  await page.route('**/api/decks/*/media/sign', (route) =>
    route.fulfill({
      json: {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        apiKey: 'e2e-key',
        timestamp: Math.floor(Date.now() / 1000),
        signature: 'e2e-signature',
        folder: 'gobbit/items/e2e',
        tags: 'editor,deck:e2e',
        allowedFormats: 'jpg,png,webp,heic,heif',
        maxBytes: 8 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
      },
    }),
  );
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/**', (route) => {
    uploads.push(route.request().url());
    return route.fulfill({ json: { public_id: publicId } });
  });
  await routeImageDelivery(page);
  return uploads;
}

test('an image card is uploaded, described and listed @smoke', async ({ page, webDeck }) => {
  const title = `Editor image ${webDeck.slug}`;
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=image`));

  await expect(page.getByRole('radio', { name: 'Image' })).toBeChecked();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Choose photo').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible();
  expect(uploads).toHaveLength(1);
  await page.getByLabel('Alt text', { exact: true }).fill('A test photo');
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.getByRole('img', { name: 'A test photo' })).toBeVisible();
});

test('an image card cannot be saved without alt text @smoke', async ({ page, webDeck }) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=image`));

  await page.getByLabel('Title', { exact: true }).fill('No alt');
  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Add a photo')).toBeVisible();
  await page.getByLabel('Take photo').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Alt text is required')).toBeVisible();
  await expect(page.getByText('Fix 1 field')).toBeVisible();
});

test('the image type is unavailable without image storage @smoke', async ({ page, webDeck }) => {
  await routeCloudName(page, null);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=image`));

  // `?type=image` opens a text card, and the picker says why image is off.
  await expect(page.getByRole('radio', { name: 'Text' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Image' })).toBeDisabled();
  await expect(page.getByText("image storage isn't set up here")).toBeVisible();
});

test('Fetch preview fills a link card @smoke', async ({ page, webDeck }) => {
  const fetchedTitle = `Fetched ${webDeck.slug}`;
  // The API's guarded fetcher refuses local addresses, so a page served by this test can't be
  // fetched; the lookup is faked here and covered for real by link-preview.int.test.ts (D134).
  await page.route('**/api/decks/*/link-preview', (route) =>
    route.fulfill({
      json: {
        preview: {
          title: fetchedTitle,
          description: 'A page about bread',
          image: 'https://res.cloudinary.com/e2e-cloud/image/upload/og.png',
        },
      },
    }),
  );
  await routeImageDelivery(page);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/bread');
  await page.getByRole('button', { name: 'Fetch preview' }).click();

  await expect(page.getByLabel('Preview title', { exact: true })).toHaveValue(fetchedTitle);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(fetchedTitle);
  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: fetchedTitle })).toBeVisible();
});

test('a link without a preview still saves @smoke', async ({ page, webDeck }) => {
  const title = `No preview ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  // A private address: the API's guarded fetcher never contacts it and answers no preview.
  await page.getByLabel('URL', { exact: true }).fill('http://10.0.0.1/private');
  await page.getByRole('button', { name: 'Fetch preview' }).click();

  await expect(page.getByText('No preview available')).toBeVisible();
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
