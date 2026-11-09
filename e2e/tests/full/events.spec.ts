import { readFile } from 'node:fs/promises';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * 042 events (`@full`): the calendar file. Creating an event in the editor is a smoke journey
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
