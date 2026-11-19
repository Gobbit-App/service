import { expect, test } from '../../fixtures/identity';
import { routeCloudName } from './helpers/cover-media';

/** 023 editor (`@full`): stubs Gobbit's own `/api/config`, so it can't run at smoke. */
test('the image type is unavailable without image storage @full', async ({ page, webDeck }) => {
  await routeCloudName(page, null);
  await page.goto(`/d/${webDeck.slug}/new?type=media`);

  // D302: `?type=media` opens the type chooser, where Media says why it is off (FR-015).
  const image = page.getByRole('radio', { name: 'Media' });
  await expect(image).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText("file storage isn't set up here")).toBeVisible();
  // `force`: Playwright never clicks an aria-disabled element; the tile must still ignore one.
  await image.click({ force: true });
  await expect(page).toHaveURL(/\?type=media$/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
});
