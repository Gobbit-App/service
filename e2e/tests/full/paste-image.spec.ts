import type { Locator } from '@playwright/test';
import { routeFakeCloudinary, TINY_PNG } from '../../fixtures/cloudinary';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * Pasting an image (`@full`): a screenshot pasted anywhere in the image editor uploads like a
 * picked photo; text pasted into a field keeps working even with a picture on the clipboard.
 * The link-card photo uses the same hook (unit tests in `use-paste-image.test.ts`).
 */

async function paste(target: Locator, { text }: { text?: string } = {}) {
  await target.evaluate(
    (el, { png, text }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(png)], 'image.png', { type: 'image/png' }));
      if (text) data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    { png: [...TINY_PNG], text },
  );
}

test('a pasted image becomes the photo of an image card @full', async ({ page, webDeck }) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=image`));
  await expect(page.getByText('Or paste a photo.')).toBeVisible();

  await paste(page.locator('body'));
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  expect(uploads).toHaveLength(1);
});

test('text pasted into a field with a picture on the clipboard is not an upload @full', async ({
  page,
  webDeck,
}) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=image`));
  const title = page.getByLabel('Title', { exact: true });

  await paste(title, { text: 'From Word' });
  await expect(page.getByLabel('Choose photo')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  expect(uploads).toHaveLength(0);
});
