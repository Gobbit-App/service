import { readFile } from 'node:fs/promises';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * 042 events (`@full`): the calendar file, Coming up and mute. Creating an event in the editor is a smoke journey
 * (`smoke/editor.spec.ts`); validation, audience and notices are covered by the API int tests.
 */

const DAY = 86_400_000;

test('Add to calendar saves the event as <title>.ics, offline too @full', async ({
  page,
  context,
  api,
  webDeck,
}) => {
  const title = `Calendar ${webDeck.slug}`;
  const start = new Date(Math.ceil((Date.now() + 3 * DAY) / 60_000) * 60_000);
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'event',
      title,
      payload: {
        allDay: false,
        start: start.toISOString(),
        timeZone: 'UTC',
        location: 'Town hall, room 2',
      },
    },
  });
  expect(res.status(), 'create event').toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto(webUrl(`/i/${id}`));
  await expect(page.getByText('Town hall, room 2')).toBeVisible();
  await context.setOffline(true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${title}.ics`);
  const ics = await readFile((await file.path())!, 'utf8');
  await context.setOffline(false);

  const stamp = start
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  expect(ics).toContain(`UID:${id}@gobbit`);
  expect(ics).toContain(`DTSTART:${stamp}`);
  expect(ics).toContain('LOCATION:Town hall\\, room 2');
  expect(ics).toMatch(/\r\n$/);
});

test('an event in its notify window is on Coming up until muted @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Coming up ${webDeck.slug}`;
  // A one-day notice for an event two hours away is already due, so it is coming up now.
  const start = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000);
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'event',
      title,
      payload: {
        allDay: false,
        start: start.toISOString(),
        timeZone: 'UTC',
        location: 'Town hall',
        notify: {
          before: [{ amount: 1, unit: 'days' }],
          audience: { mode: 'everyone', userIds: [] },
        },
      },
    },
  });
  expect(res.status(), 'create event').toBe(201);
  const { id } = (await res.json()) as { id: string };
  const entry = (scope: { getByRole: typeof page.getByRole }) =>
    scope.getByRole('link', { name: new RegExp(title) });

  const comingUp = page.getByRole('region', { name: 'Coming up' });
  await page.goto(webUrl('/notifications'));
  await expect(entry(comingUp)).toContainText('Town hall');

  await entry(comingUp).click();
  await expect(page).toHaveURL(new RegExp(`/i/${id}$`));
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Mute notifications' }).click();
  await expect(page.getByText('Notifications muted')).toBeVisible();

  await page.goto(webUrl('/notifications'));
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(entry(page)).toHaveCount(0);

  await page.goto(webUrl(`/i/${id}`));
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Unmute notifications' }).click();
  await expect(page.getByText('Notifications on')).toBeVisible();
  await page.goto(webUrl('/notifications'));
  await expect(entry(comingUp)).toBeVisible();
});
