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

/** 042 (T098, D377): an event proposal (the ingest pipeline's shape) is edited fully and published. */
test('an event proposal is edited fully from review, keeps its notify time and publishes @full', async ({
  page,
  api,
  webDeck,
}) => {
  const cats = await api.get(`decks/${webDeck.id}/categories`);
  expect(cats.status(), 'list categories').toBe(200);
  const { data } = (await cats.json()) as { data: { id: string; isDefault: boolean }[] };
  const title = `Proposed event ${webDeck.slug}`;
  const start = new Date(Math.ceil((Date.now() + 5 * DAY) / 60_000) * 60_000);
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'event',
      title,
      status: 'proposed',
      categoryIds: data.filter((c) => c.isDefault).map((c) => c.id),
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
  expect(res.status(), 'create proposal').toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto(webUrl(`/d/${webDeck.slug}/review`));
  const card = page.getByRole('article', { name: title });
  await expect(card).toContainText('Town hall');
  await card.getByRole('link', { name: 'Edit fully' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${id}/edit\\?from=review$`));

  await page.getByText('Notifications', { exact: true }).click();
  await page.getByLabel('Notify time 1 amount').fill('2');
  await page.getByLabel('Notify time 1 unit').selectOption('hours');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/review$`));

  await page.getByRole('article', { name: title }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('article', { name: title })).toHaveCount(0);

  const item = await api.get(`items/${id}`);
  expect(item.status(), 'read item').toBe(200);
  expect(await item.json()).toMatchObject({
    status: 'published',
    payload: { notify: { before: [{ amount: 2, unit: 'hours' }] } },
  });
});
