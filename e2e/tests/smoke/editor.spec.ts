import type { Page } from '@playwright/test';
import {
  cloudinaryApiSecret,
  photoFile,
  routeCloudName,
  routeFakeCloudinary,
  pdfFile,
  routeImageDelivery,
} from '../../fixtures/cloudinary';
import { expect, SMOKE_CATEGORY, test, webUrl } from '../../fixtures/web';
import { switchView } from './helpers/deck-header';

/** Below 768px (Pixel 7) the preview is a tab: open it, then read the preview region. */
/** D309 (039): on a phone the top bar's Preview toggle swaps the canvas for the preview. */
async function showPreview(page: Page) {
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  return page.getByRole('region', { name: 'Preview', exact: true });
}
const save = (page: Page) => page.getByRole('button', { name: 'Save' });

test('a text card added from the editor shows in the list and survives a reload @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor text ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  // D275: a short press on the bar's + opens the create menu.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New card' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  // D301: the type chooser comes first, keyboard-ready on its first tile.
  const text = page.getByRole('radio', { name: 'Text' });
  await expect(text).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new\\?type=text$`));
  await expect(page.getByRole('button', { name: 'Card type: Text' })).toBeVisible();

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

/** 038 US2 (T018): toolbar bold and a Shift+Enter line break survive the save onto the card. */
test('a body formatted in the editor shows bold and a line break on the card @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor rich ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await page.getByLabel('Title', { exact: true }).fill(title);

  const body = page.getByLabel('Body', { exact: true });
  const bold = page.getByRole('button', { name: 'Bold' });
  await body.click();
  await page.keyboard.type('Call ');
  await bold.click();
  await page.keyboard.type('Sam');
  await bold.click();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('after five');
  await expect(body.locator('strong')).toHaveText('Sam');
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.locator('strong')).toHaveText('Sam');
  await expect(listed.locator('br')).toHaveCount(1);
  await expect(listed).toContainText('after five');
  await expect(listed).not.toContainText('**');
});

test('a link card added from the editor is listed with its url @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor link ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  // D301: a bare /new asks what kind of card first; picking replaces the URL.
  await page.getByRole('radio', { name: 'Link' }).click();
  await expect(page).toHaveURL(/\?type=link$/);
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
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

test('a 2001-character body disables Save and says why @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));

  await page.getByLabel('Title', { exact: true }).fill('Too long');
  await page.getByLabel('Body', { exact: true }).fill('x'.repeat(2001));

  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Fix 1 field')).toBeVisible();
  await expect(page.getByText('2001 / 2000 characters')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new\\?type=text$`));
});

test('the category chips start on the deck default category @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  const chips = page.getByRole('group', { name: 'Categories' }).getByRole('button');
  await expect(chips).not.toHaveCount(0);
  await expect(chips.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
});

test('a table card keeps a moved row and stops at 12 rows @smoke', async ({ page, webDeck }) => {
  const title = `Editor table ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=table`));
  // A new table starts from a sample (D270); start from scratch.
  await page.getByRole('button', { name: 'Clear table' }).click();

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
  // A new calc starts from a sample (D270); start from scratch.
  await page.getByRole('button', { name: 'Clear calculation' }).click();

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
  // D303: an existing card's type is shown, not offered.
  await expect(page.getByRole('button', { name: /^Card type/ })).toHaveCount(0);
  await expect(page.getByText('Text card')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(card.title);

  await page.getByLabel('Title', { exact: true }).fill(title);
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('the editor goes back to its card; leaving with changes asks first (022) @smoke', async ({
  page,
  webDeck,
}) => {
  const card = webDeck.items.find((item) => item.type === 'text')!;
  const editUrl = new RegExp(`/i/${card.id}/edit$`);
  const cardUrl = new RegExp(`/i/${card.id}$`);
  const discardDialog = page.getByRole('dialog', { name: 'Discard changes?' });
  await page.goto(webUrl(`/i/${card.id}/edit`));

  // Unchanged: Close leaves at once, to the card.
  const close = page.getByRole('link', { name: 'Close' });
  await close.click();
  await expect(page).toHaveURL(cardUrl);
  await expect(discardDialog).toHaveCount(0);

  // Changed: Close asks; Keep editing stays with the text.
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(editUrl);
  await page.getByLabel('Title', { exact: true }).fill(`Unsaved ${webDeck.slug}`);
  await close.click();
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(discardDialog).toHaveCount(0);
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`Unsaved ${webDeck.slug}`);

  // Discard leaves for the card, which is unchanged.
  await close.click();
  await discardDialog.getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole('heading', { name: card.title })).toBeVisible();
});

test('list cards link to the editor @smoke', async ({ page, webDeck }) => {
  const card = webDeck.items.find((item) => item.type === 'table')!;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: card.title }) })
    .getByRole('link', { name: 'Edit', exact: true })
    .click();
  // D320: the editor remembers the list it was opened from.
  const back = encodeURIComponent(`/d/${webDeck.slug}`);
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit\\?back=${back}$`));
  await expect(page.getByLabel('Column 1 heading')).toHaveValue('Day');
});

test('an unsaved card comes back after a reload; sign-out forgets it @smoke', async ({
  page,
  webDeck,
}) => {
  const newCard = webUrl(`/d/${webDeck.slug}/new?type=text`);
  const restoreOffer = page.getByText('Restore unsaved draft?');
  // 022: unsaved changes arm the browser's "leave site?" prompt; accept it on reload.
  page.on('dialog', (dialog) => void dialog.accept());
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
  // 038: the body is a rich editor (contenteditable), so it has text, not a value.
  await expect(page.getByLabel('Body', { exact: true })).toHaveText('Not saved yet');
  await page.waitForTimeout(800);

  // The smoke session is shared by the suite: answer the logout call locally so the server
  // session survives, while the app still runs its sign-out cleanup (drafts included).
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204 }));
  // D276: Sign out lives in the bottom bar's ⋯ menu, which the editor doesn't show; the draft
  // stays stored when the editor is left without saving.
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  // The app leaves for /sign-in first and clears local data afterwards; navigating away before
  // that finishes would abort it.
  await expect.poll(() => storedDraftCount(page)).toBe(0);
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
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
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
  // Cards in the list show their category chips too; open it from the header's view switcher.
  await switchView(page, category);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

/** Drafts in the editor's IndexedDB store (`gobbit-drafts`, D145). */
function storedDraftCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    // Opening a missing database would create it without its store and break idb-keyval later.
    const databases = await indexedDB.databases();
    if (!databases.some((db) => db.name === 'gobbit-drafts')) return 0;
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('gobbit-drafts');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('drafts')) {
          db.close();
          resolve(0);
          return;
        }
        const count = db.transaction('drafts').objectStore('drafts').count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => reject(count.error);
      };
    });
  });
}

test('a two-photo gallery is uploaded, described, listed and viewed @smoke', async ({
  page,
  webDeck,
}) => {
  // Saving needs the assets recorded by the real API (D160), so the upload answers must verify.
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
  const title = `Editor gallery ${webDeck.slug}`;
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));

  await expect(page.getByRole('button', { name: 'Card type: Media' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(title);
  // D398: several photos picked at once upload side by side; Save waits for both.
  await page.getByLabel('Choose photos').setInputFiles([
    { ...photoFile, name: 'first.png' },
    { ...photoFile, name: 'second.png' },
  ]);
  await expect(page.getByText('2 of 8 photos')).toBeVisible();
  expect(uploads).toHaveLength(2);
  await page.getByLabel('Description of photo 1 (optional)').fill('A test photo');
  await page.getByLabel('Description of photo 2 (optional)').fill('Another photo');
  // The preview renders the cover through the same Card as the list (FR-008).
  const preview = await showPreview(page);
  await expect(preview.getByRole('img', { name: 'A test photo' })).toBeVisible();
  const created = page.waitForResponse(
    (res) => /\/api\/decks\/[^/]+\/items$/.test(res.url()) && res.request().method() === 'POST',
  );
  await save(page).click();

  // The API wrote the dimensions it recorded at confirm time (D160), photo by photo.
  const response = await created;
  expect(response.status()).toBe(201);
  const saved = (await response.json()) as {
    payload: { images: { width?: number; alt?: string }[] };
  };
  expect(saved.payload.images.map((img) => img.alt)).toEqual(['A test photo', 'Another photo']);
  expect(saved.payload.images[0]?.width).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  const cover = listed.getByRole('img', { name: 'A test photo' });
  await expect(cover).toBeVisible();
  // CloudImage sizes from the measured column (D161) and keeps the three-width srcset.
  await expect(cover).toHaveAttribute('sizes', /^\d+px$/);
  expect((await cover.getAttribute('srcset'))?.split(', ')).toHaveLength(3);

  // D399: the cover opens the viewer; the arrow key moves to the second photo.
  await listed.getByRole('button', { name: 'Open 2 photos' }).click();
  const viewer = page.getByRole('dialog', { name: title });
  await expect(viewer.getByText('1 of 2')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('2 of 2')).toBeVisible();
  await expect(viewer.getByRole('img', { name: 'Another photo' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toHaveCount(0);
});

test('a PDF card is uploaded and read page by page @smoke', async ({ page, webDeck }) => {
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
  const title = `Editor PDF ${webDeck.slug}`;
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-pdf`, {
    kind: 'pdf',
    format: 'pdf',
    width: 600,
    height: 800,
    pages: 2,
  });
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Choose file').setInputFiles(pdfFile);
  await expect(
    page.getByRole('region', { name: 'Media' }).getByText('PDF · 2 pages'),
  ).toBeVisible();
  const created = page.waitForResponse(
    (res) => /\/api\/decks\/[^/]+\/items$/.test(res.url()) && res.request().method() === 'POST',
  );
  await save(page).click();

  const response = await created;
  expect(response.status()).toBe(201);
  const saved = (await response.json()) as { payload: { kind: string; pages?: number } };
  expect(saved.payload).toMatchObject({ kind: 'pdf', pages: 2 });
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.getByText('PDF · 2 pages')).toBeVisible();

  // D399/FR-013: Read opens the lazy viewer; page 2 is one arrow away, the original one link.
  await listed.getByRole('button', { name: 'Read' }).click();
  const viewer = page.getByRole('dialog', { name: title });
  await expect(viewer.getByText('Page 1 of 2')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(viewer.getByText('Page 2 of 2')).toBeVisible();
  await expect(viewer.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    /e2e-pdf/,
  );
});

test('a photo Cloudinary refuses shows why and is reported to the API @smoke', async ({
  page,
  webDeck,
}) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  // Registered last, so it wins over the accepting fake above.
  await page.route('https://api.cloudinary.com/**', (route) =>
    route.fulfill({
      status: 400,
      json: { error: { message: 'Resolution too high. Maximum allowed is 25 Megapixels' } },
    }),
  );
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));

  const reported = page.waitForResponse(
    (res) => res.url().includes('/media/upload-failures') && res.request().method() === 'POST',
  );
  await page.getByLabel('Choose photos').setInputFiles(photoFile);
  await expect(
    page.getByText("This photo's resolution is too high.", { exact: false }),
  ).toBeVisible();
  const response = await reported;
  expect(response.status()).toBe(204);
  expect(response.request().postDataJSON()).toMatchObject({ status: 400, fileType: 'image/png' });
  await expect(save(page)).toBeDisabled();
});

test('an image card needs a photo but no description (D206) @smoke', async ({ page, webDeck }) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));

  await page.getByLabel('Title', { exact: true }).fill('No description');
  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Add a photo')).toBeVisible();
  await page.getByLabel('Take photo').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue('');
  await expect(save(page)).toBeEnabled();
});

test('an image card without a description saves and is decorative under its title @smoke', async ({
  page,
  webDeck,
}) => {
  // Saving needs the asset recorded by the real API (D160), so the upload answer must verify.
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
  const title = `No description ${webDeck.slug}`;
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Choose photos').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  const created = page.waitForResponse(
    (res) => /\/api\/decks\/[^/]+\/items$/.test(res.url()) && res.request().method() === 'POST',
  );
  await save(page).click();

  const response = await created;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { payload: { images: { alt?: string }[] } };
  expect(body.payload.images[0]?.alt).toBeUndefined();
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.locator('img.cloud-image__img')).toHaveAttribute('alt', '');
});

test('the image type is unavailable without image storage @smoke', async ({ page, webDeck }) => {
  await routeCloudName(page, null);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));

  // D302: `?type=media` opens the type chooser, where Media says why it is off (FR-015).
  const image = page.getByRole('radio', { name: 'Media' });
  await expect(image).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText("file storage isn't set up here")).toBeVisible();
  // `force`: Playwright never clicks an aria-disabled element; the tile must still ignore one.
  await image.click({ force: true });
  await expect(page).toHaveURL(/\?type=media$/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
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

test('a link typed without https:// is stored with it (D205) @smoke', async ({ page, webDeck }) => {
  const title = `Bare host ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  const url = page.getByLabel('URL', { exact: true });
  await url.focus();
  await expect(url).toHaveValue('https://');
  await url.fill('example.org');
  await url.blur();
  await expect(url).toHaveValue('https://example.org');

  const created = page.waitForResponse(
    (res) => /\/api\/decks\/[^/]+\/items$/.test(res.url()) && res.request().method() === 'POST',
  );
  await save(page).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(((await response.json()) as { payload: { url: string } }).payload.url).toBe(
    'https://example.org',
  );
});

test('a category tap on an existing card saves without Save (D207) @smoke', async ({
  page,
  api,
  webDeck,
}) => {
  const card = webDeck.items.find((item) => item.type === 'text')!;
  await page.goto(webUrl(`/i/${card.id}/edit`));
  const chip = page.getByRole('button', { name: SMOKE_CATEGORY.name });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');

  const saved = page.waitForResponse(
    (res) => res.url().endsWith(`/api/items/${card.id}`) && res.request().method() === 'PATCH',
  );
  await chip.click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Categories saved')).toBeVisible();
  // 038: the body toolbar has its own Undo; this one is the toast's.
  await expect(page.getByRole('status').getByRole('button', { name: 'Undo' })).toBeVisible();

  // Leaving without Save keeps the category: it is already on the server.
  await page.goto(webUrl(`/i/${card.id}`));
  const res = await api.get(`items/${card.id}`);
  const categories = (await (await api.get(`decks/${webDeck.slug}/categories`)).json()) as {
    data: { id: string; slug: string }[];
  };
  const smokeId = categories.data.find((c) => c.slug === SMOKE_CATEGORY.slug)!.id;
  expect(((await res.json()) as { categoryIds: string[] }).categoryIds).toContain(smokeId);
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

/** 042 (T024): an event made in the editor shows on the deck with its status line and place. */
test('an event added from the editor shows its status line and location @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Event ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=event`));
  await expect(page.getByRole('button', { name: 'Card type: Event' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(title);
  // A new event starts tomorrow at 18:00 in the device's zone.
  const start = page.getByLabel('Starts');
  await expect(start).toHaveValue(/T18:00$/);
  await page.getByLabel('Where (optional)').fill('Town hall');

  // Negative path: an end before the start is flagged on the field and the card isn't saved.
  const day = (await start.inputValue()).slice(0, 10);
  const end = page.getByLabel('Ends (optional)');
  await end.fill(`${day}T10:00`);
  await expect(page.getByText('The end must be after the start')).toBeVisible();
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/new\?type=event$/);

  await end.fill(`${day}T20:00`);
  await expect(page.getByText('The end must be after the start')).toHaveCount(0);
  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card).toContainText(/(Tomorrow|In \d+ days?) · 18:00/);
  await expect(card).toContainText('18:00–20:00');
  await expect(card).toContainText('Town hall');
});
