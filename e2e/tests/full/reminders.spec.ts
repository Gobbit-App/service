import type { APIRequestContext } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * 037 reminders (`@full`): create one in the editor, a hidden one listed only on Upcoming, and
 * dismiss with Done. Who may see or dismiss (readers, picked people, races) is covered by the
 * API integration tests; the smoke tier has no reminder journey (plan: E2E tier full).
 */

const DAY = 86_400_000;

async function createReminder(
  api: APIRequestContext,
  deck: WebDeck,
  title: string,
  deadline: Date,
  showBefore: { amount: number; unit: 'minutes' | 'hours' | 'days' },
): Promise<string> {
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: {
      type: 'reminder',
      title,
      payload: {
        deadline: deadline.toISOString(),
        timeZone: 'UTC',
        showBefore,
        dismiss: { mode: 'writers', userIds: [] },
      },
    },
  });
  expect(res.status(), `create reminder ${title}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('a reminder created in the editor shows its due line on the deck @full', async ({
  page,
  webDeck,
}) => {
  const title = `Reminder ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=reminder`));
  await expect(page.getByRole('radio', { name: 'Reminder' })).toBeChecked();
  await page.getByLabel('Title', { exact: true }).fill(title);
  // Default deadline: tomorrow 09:00; two days' notice makes it show straight away.
  await expect(page.getByLabel('Deadline')).not.toHaveValue('');
  await page.getByLabel('Show before amount').fill('2');
  await page.getByLabel('Show before unit').selectOption('days');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card).toContainText(/Due in \d+ (hours?|minutes?)/);
});

test('a reminder before its reveal time is only on Upcoming @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Later ${webDeck.slug}`;
  await createReminder(api, webDeck, title, new Date(Date.now() + 10 * DAY), {
    amount: 1,
    unit: 'days',
  });

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: title })).toHaveCount(0);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Upcoming' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/upcoming$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed).toContainText(/Shows on .+ · Due /);
});

test('dismissing with Done closes the reminder and says who did it @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Due ${webDeck.slug}`;
  const id = await createReminder(api, webDeck, title, new Date(Date.now() + 2 * 3_600_000), {
    amount: 1,
    unit: 'days',
  });

  await page.goto(webUrl(`/i/${id}`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();

  const dialog = page.getByRole('dialog', { name: `Dismiss “${title}”` });
  await expect(dialog).toBeVisible();
  const markDone = dialog.getByRole('button', { name: /Mark done/ });
  await expect(markDone).toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('switch', { name: 'Done' }).check();
  await dialog.getByLabel('What happened? (optional)').fill('Paid by card');
  await markDone.click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Reminder marked done');
  await expect(page.getByText('Done by you · Paid by card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
});
