import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { expect, test as base, type Identity } from '../../fixtures/identity';
import { webUrl } from '../../lib/stack';
import { swipeCard } from '../smoke/helpers/swipe';
import {
  browseUrl,
  createCard,
  dockButton,
  expectCurrent,
  fullView,
  MAIN,
  phoneContext,
  photoFile,
  routeFakeAvatar,
  seedBrowseDeck,
  skipHint,
} from './helpers/profile';

/**
 * 046 member profile (`@full`). Every test has its own signed-in owner (`user`/`page`, a Pixel 7
 * context) and, where two more members are needed, `b` and `c`: editors invited to the test's deck
 * through the real invite link. Users are fresh per test, so nothing is reset afterwards.
 */

const NOT_AVAILABLE = "That name isn't available";
const BAD_SHAPE = 'Use 3–30 letters, digits, ., _ or -';

const test = base.extend<{ tag: string; b: Identity; c: Identity }>({
  // A short unique suffix for names.
  tag: async ({ browserName: _b }, use) => use(randomUUID().slice(0, 6).replace(/-/g, 'x')),
  b: async ({ member, smokeDeck }, use) => use(await member(smokeDeck, 'editor')),
  c: async ({ member, smokeDeck }, use) => use(await member(smokeDeck, 'editor')),
  // The owner's page is a phone, like the project this spec ran in before.
  context: async ({ browser, user, serviceWorkers }, use) => {
    const context = await phoneContext(browser, user, serviceWorkers);
    await use(context);
    await context.close();
  },
});

async function setProfile(who: Identity, data: Record<string, unknown>): Promise<void> {
  const res = await who.api.patch('me/profile', { data });
  expect(res.status(), 'set profile').toBe(200);
}

const username = (page: Page) => page.getByLabel('Username');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save' });

test.describe('profile form @full', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(webUrl('/settings/profile'));
    await expect(username(page)).toBeVisible();
  });

  test('taken, reserved, invalid and held usernames say so @full', async ({
    page,
    api,
    b,
    tag,
  }) => {
    const dana = `dana${tag}`;
    await setProfile(b, { username: dana });

    // taken: the advisory check answers while typing, the save answers the same
    await username(page).fill(dana);
    await expect(page.locator('.field__error')).toHaveText(NOT_AVAILABLE);
    await username(page).fill(dana.toUpperCase());
    await expect(page.locator('.field__error')).toHaveText(NOT_AVAILABLE);

    // reserved and invalid
    await username(page).fill('admin');
    await expect(page.locator('.field__error')).toHaveText(NOT_AVAILABLE);
    await username(page).fill('a!');
    await expect(page.locator('.field__error')).toHaveText(BAD_SHAPE);

    // held: the owner takes a name and clears it; another member is refused, the holder reclaims
    const held = `held${tag}`;
    await username(page).fill(held);
    await expect(page.getByRole('status').filter({ hasText: 'Available' })).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await username(page).fill('');
    await saveButton(page).click();
    await expect.poll(async () => (await (await api.get('me')).json()).profile.username).toBeNull();

    const refused = await b.api.patch('me/profile', { data: { username: held } });
    expect(refused.status(), 'another member takes a held name').toBe(422);

    await username(page).fill(held);
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(
      ((await (await api.get('me')).json()) as { profile: { username: string } }).profile,
    ).toMatchObject({ username: held });
  });

  test('clearing one field keeps the others @full', async ({ page, api, tag }) => {
    await page.getByLabel('First name').fill(`Dana${tag}`);
    await page.getByLabel('Last name').fill('Levi');
    await page.getByLabel('Location').fill('Haifa');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.getByLabel('Location').fill('');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Location')).toHaveValue('');
    await expect(page.getByLabel('First name')).toHaveValue(`Dana${tag}`);
    await expect(page.getByLabel('Last name')).toHaveValue('Levi');
    expect(
      ((await (await api.get('me')).json()) as { profile: { location: unknown } }).profile.location,
    ).toBeNull();
  });

  test('a failed save keeps what was typed and says why @full', async ({ page, b, tag }) => {
    const taken = `taken${tag}`;
    await setProfile(b, { username: taken });

    await page.getByLabel('First name').fill(`Typed${tag}`);
    await username(page).fill(taken);
    await saveButton(page).click();

    await expect(page.locator('.field__error')).toHaveText(NOT_AVAILABLE);
    await expect(page.getByLabel('First name')).toHaveValue(`Typed${tag}`);
    await expect(username(page)).toHaveValue(taken);
  });

  test('leaving with unsaved edits asks first @full', async ({ page, tag }) => {
    await page.getByLabel('First name').fill(`Unsaved${tag}`);
    await page.getByRole('link', { name: 'Back' }).click();

    const dialog = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(dialog).toContainText('your profile');
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByLabel('First name')).toHaveValue(`Unsaved${tag}`);

    await page.getByRole('link', { name: 'Back' }).click();
    await page
      .getByRole('dialog', { name: 'Discard changes?' })
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe('member lookup @full', () => {
  const invite = (page: Page) => page.getByRole('form', { name: 'Invite someone' });
  const field = (page: Page) => invite(page).getByLabel('Email or username');
  const lookedUp = (page: Page) =>
    page.waitForResponse((res) => res.url().endsWith('/members/lookup'));

  test.beforeEach(async ({ page, webDeck }) => {
    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    await expect(field(page)).toBeVisible();
  });

  test('a deck mate shows a preview by email, a stranger shows nothing @full', async ({
    page,
    b,
    tag,
  }) => {
    await setProfile(b, { firstName: 'Dana', lastName: `L${tag}` });
    const email = b.email;

    const hit = lookedUp(page);
    await field(page).fill(email);
    expect((await hit).status()).toBe(200);
    await expect(invite(page)).toContainText(`Dana L${tag}`);
    await expect(invite(page).locator('.avatar')).toBeVisible();
    await expect(invite(page)).not.toContainText(email);

    const miss = lookedUp(page);
    await field(page).fill(`nobody-${tag}@example.test`);
    expect((await miss).status()).toBe(200);
    await expect(invite(page).locator('.avatar')).toHaveCount(0);
    await expect(invite(page)).not.toContainText('No member found');
  });

  test('a username nobody uses says "No member found" @full', async ({ page, tag }) => {
    await field(page).fill(`neverused${tag}`);
    await expect(invite(page).getByRole('status')).toHaveText('No member found');
  });
});

// A fresh member of its own: the test spends that member's whole hourly lookup budget
// (PROFILE_LOOKUP_RATE_PER_HOUR, default 30; the loop stops at the first 429 within 40).
test('the 31st lookup is limited quietly @full', async ({ newUser, tag }) => {
  const limitedUser = await newUser('limit');
  const created = await limitedUser.api.post('decks', {
    data: { name: `Limit ${tag}`, slug: `smoke-lim-${tag}`, kind: 'shared' },
  });
  expect(created.status(), 'create deck').toBe(201);
  const page = await limitedUser.page();
  const errors: Error[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(webUrl(`/d/smoke-lim-${tag}/settings`));
  const invite = page.getByRole('form', { name: 'Invite someone' });
  const field = invite.getByLabel('Email or username');
  await expect(field).toBeVisible();

  let limited = 0;
  for (let n = 0; n < 40 && !limited; n += 1) {
    const res = await limitedUser.api.post('members/lookup', {
      data: { query: `burst${tag}${n}` },
    });
    if (res.status() === 429) limited = n + 1;
    else expect(res.status()).toBe(200);
  }
  expect(limited, 'a 429 within 40 lookups').toBeGreaterThan(0);

  const answer = page.waitForResponse((res) => res.url().endsWith('/members/lookup'));
  await field.fill(`limited${tag}`);
  expect((await answer).status()).toBe(429);
  await expect(invite.locator('.avatar')).toHaveCount(0);
  await expect(invite).not.toContainText('No member found');
  await expect(field).toBeEnabled();
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------------------------------ */
/* Part 2: creator avatar                                                                      */
/* ------------------------------------------------------------------------------------------ */

const card = (page: Page, title: string): Locator =>
  page.locator('article.card').filter({ hasText: title });

async function addCard(who: APIRequestContext, deck: { slug: string }, title: string) {
  const res = await who.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: `Body of ${title}` },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const look = (avatar: Locator) =>
  avatar.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    initials: el.querySelector('.avatar__initials')?.textContent ?? null,
  }));

/** The avatar's tooltip (`::after`) is drawn: hover and focus open it through CSS alone. */
const tipShown = (avatar: Locator) =>
  avatar.evaluate((el) => getComputedStyle(el, '::after').display !== 'none');

const box = async (avatar: Locator) => {
  const b = await avatar.boundingBox();
  if (!b) throw new Error('the avatar has no box');
  return b;
};

test.describe('creator avatar @full', () => {
  test('two members see the same initials and colour for a third @full', async ({
    page,
    webDeck,
    b,
    c,
    tag,
  }) => {
    await setProfile(c, { firstName: 'Cee', lastName: `Cr${tag}`, username: `cee${tag}` });
    const title = `By C ${tag}`;
    await addCard(c.api, webDeck, title);

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const mine = await look(card(page, title).locator('.avatar'));
    expect(mine.initials).toBe('CC');
    expect(mine.background).not.toBe('rgba(0, 0, 0, 0)');

    const other = await b.page();
    await other.goto(webUrl(`/d/${webDeck.slug}`));
    expect(await look(card(other, title).locator('.avatar'))).toEqual(mine);

    // members list (settings): same colour and initials on the member's row
    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    const row = page.locator('.admin-member').filter({ hasText: `Cee Cr${tag}` });
    expect(await look(row.locator('.avatar'))).toEqual(mine);
  });

  test('Browse shows the creator and keeps swiping and the action bar @full', async ({
    page,
    api,
    smokeDeck,
    c,
    tag,
  }) => {
    await setProfile(c, { firstName: 'Cee', lastName: `Cr${tag}` });
    const deck = await seedBrowseDeck(api, smokeDeck);
    const [first, second] = deck.cards;
    await skipHint(page);
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${first!.id}`));
    await expectCurrent(page, first!);

    const stage = page.locator('.browse__stage');
    const avatar = stage.locator('article.card .avatar').first();
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('role', 'img');
    await expect(avatar).toHaveAttribute('aria-label', /^Added by /);
    const placed = await box(avatar);
    await page.waitForLoadState('networkidle');
    expect(await box(avatar)).toEqual(placed);
    const bar = stage.getByRole('button', { name: 'More actions' }).first();
    await expect(bar).toBeVisible();

    await swipeCard(page, 'next');
    await expectCurrent(page, second!);
    await expect(stage.locator('article.card .avatar').first()).toBeVisible();
    await dockButton(page, 'Previous card').click();
    await expectCurrent(page, first!);
    await expect(bar).toBeVisible();
    await expect(page).toHaveURL(/\/browse\?/);

    // the full view shows it too, in the same 24 px box
    await page.getByRole('button', { name: 'Full view', exact: true }).click();
    const fullAvatar = fullView(page, first!.title).locator('.avatar');
    await expect(fullAvatar).toBeVisible();
    await expect(fullAvatar).toHaveAttribute('aria-label', /^Added by /);
    const fullBox = await box(fullAvatar);
    await page.waitForLoadState('networkidle');
    expect(await box(fullAvatar)).toEqual(fullBox);
    expect({ w: fullBox.width, h: fullBox.height }).toEqual({ w: placed.width, h: placed.height });
    await page.getByRole('button', { name: 'Close full view' }).click();

    // a card by another member is current too: its avatar matches the list's colour
    const titleC = `Browse by C ${tag}`;
    const idC = await createCard(c.api, deck.slug, { title: titleC, categoryIds: [deck.mainId] });
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${idC}`));
    await expect(stage.getByRole('heading', { name: titleC })).toBeVisible();
    expect((await look(stage.locator('article.card .avatar').first())).initials).toBe('CC');
  });

  test('a personal deck card has no avatar @full', async ({ page, api, tag }) => {
    // The personal deck is created at sign-in.
    expect((await api.get('decks/me')).status()).toBe(200);
    const title = `Personal ${tag}`;
    const id = await addCard(api, { slug: 'me' }, title);
    try {
      await page.goto(webUrl('/d/me'));
      await expect(card(page, title)).toBeVisible();
      await expect(card(page, title).locator('.avatar')).toHaveCount(0);
    } finally {
      await api.delete(`items/${id}`);
    }
  });

  // A removed creator's placeholder glyph is covered by apps/api/test/profile.int.test.ts
  // ("is the placeholder after the creator is removed"): no route deletes a user.

  test('the label opens on tap and closes on second tap, outside tap and Escape @full', async ({
    page,
    user,
    webDeck,
    tag,
  }) => {
    await setProfile(user, { username: `lab${tag}` });
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const avatar = page.locator('article.card .avatar').first();
    await expect(avatar).toHaveAttribute('data-tip', `lab${tag}`);
    // The persisted list shows first and the fresh fetch re-renders it: let that settle so the clicks
    // below always land on the element that keeps its open state.
    await page.waitForLoadState('networkidle');

    await avatar.click();
    await expect(avatar).toHaveAttribute('data-tip-open', '');
    await avatar.click();
    await expect(avatar).not.toHaveAttribute('data-tip-open', '');

    await avatar.click();
    await expect(avatar).toHaveAttribute('data-tip-open', '');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await expect(avatar).not.toHaveAttribute('data-tip-open', '');

    await avatar.click();
    await expect(avatar).toHaveAttribute('data-tip-open', '');
    await page.keyboard.press('Escape');
    await expect(avatar).not.toHaveAttribute('data-tip-open', '');

    // keyboard focus opens it without any click
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    // `:focus-visible` follows the last input: after a click a script focus() does not match, after a key it does.
    await page.keyboard.press('Shift');
    await avatar.focus();
    await expect.poll(() => tipShown(avatar)).toBe(true);
  });

  test('the avatar is not clickable @full', async ({ page, webDeck }) => {
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const avatar = page.locator('article.card .avatar').first();
    await expect(avatar).toBeVisible();
    const url = page.url();
    await avatar.click();
    await expect(page).toHaveURL(url);
    await expect(avatar).toHaveJSProperty('tagName', 'SPAN');
    await expect(page.getByRole('link').filter({ has: avatar })).toHaveCount(0);
    await expect(page.getByRole('button').filter({ has: avatar })).toHaveCount(0);
  });

  test('the avatar box does not move or resize while the page loads @full', async ({
    page,
    webDeck,
  }) => {
    await page.goto(webUrl(`/d/${webDeck.slug}`), { waitUntil: 'commit' });
    const avatar = page.locator('article.card .avatar').first();
    await avatar.waitFor();
    const before = await box(avatar);
    await page.waitForLoadState('networkidle');
    const after = await box(avatar);
    expect({ w: after.width, h: after.height }).toEqual({ w: before.width, h: before.height });
    expect(after.x).toBeCloseTo(before.x, 0);
  });

  test('a communal deck reader sees creators @full', async ({ page, api, tag }) => {
    const slug = `smoke-com-${tag}`;
    const created = await api.post('decks', { data: { name: slug, slug, kind: 'communal' } });
    expect(created.status(), 'create communal deck').toBe(201);
    const { id } = (await created.json()) as { id: string };
    try {
      const title = `Communal ${tag}`;
      await addCard(api, { slug }, title);
      await page.goto(webUrl(`/d/${slug}`));
      await expect(card(page, title).locator('.avatar')).toBeVisible();
    } finally {
      await api.delete(`decks/${id}`);
    }
  });

  test('a seen avatar still renders from the offline cache @full', async ({
    page,
    context,
    webDeck,
  }) => {
    const title = webDeck.items[0]!.title;
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(card(page, title).locator('.avatar')).toBeVisible();
    // the persisted query cache writes on a throttle
    await page.waitForTimeout(2000);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(card(page, title).locator('.avatar')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Part 3: profile photo (Story 3)                                                             */
/* ------------------------------------------------------------------------------------------ */

/** Pick, crop in the sheet (zoom, "Use photo") and close it; the upload then runs. */
async function pickAndCrop(page: Page, label: 'Add photo' | 'Replace photo') {
  // The persisted `me` gives way to the fresh fetch: let it settle so the pick lands on the live form.
  await page.waitForLoadState('networkidle');
  await page.getByLabel(label).setInputFiles(photoFile);
  const sheet = page.getByRole('dialog', { name: 'Crop your photo' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Zoom').fill('2');
  await sheet.getByRole('button', { name: 'Use photo' }).click();
  await expect(sheet).toBeHidden();
}

const photoOn = (page: Page, title: string) =>
  card(page, title).locator('.avatar img.cloud-image__img');

test.describe('profile photo @full', () => {
  // The UI flow records the asset through the real signed confirm (the dummy secret); only Cloudinary is faked.
  // The service worker answers Cloudinary images itself, past `page.route`; block it so the fake serves.
  // Only here: the offline test in this file needs the worker.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.goto(webUrl('/settings/profile'));
    await expect(username(page)).toBeVisible();
  });

  test('upload, crop, save shows the photo on a card; replace; remove brings initials back @full', async ({
    page,
    api,
    user,
    webDeck,
    tag,
  }) => {
    await setProfile(user, { firstName: 'Pho', lastName: `To${tag}` });
    await page.reload();
    const title = `Photo card ${tag}`;
    await addCard(api, webDeck, title);

    await routeFakeAvatar(page, api, `first-${tag}`);
    await pickAndCrop(page, 'Add photo');
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(photoOn(page, title)).toBeVisible();

    // replace
    await page.goto(webUrl('/settings/profile'));
    await pickAndCrop(page, 'Replace photo');
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(photoOn(page, title)).toBeVisible();

    // remove: the initials return
    await page.goto(webUrl('/settings/profile'));
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(card(page, title).locator('.avatar__initials')).toHaveText('PT');
    await expect(photoOn(page, title)).toHaveCount(0);
  });

  test('a failed upload keeps the previous photo and other edits and says so @full', async ({
    page,
    api,
    tag,
  }) => {
    const publicId = await routeFakeAvatar(page, api, `prev-${tag}`);
    // The previous photo comes through the real upload flow, so its asset is recorded.
    await pickAndCrop(page, 'Add photo');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();

    await page.getByLabel('First name').fill(`Keep${tag}`);
    // Registered last, so it wins over the fake upload answer.
    await page.route('https://api.cloudinary.com/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await pickAndCrop(page, 'Replace photo');

    await expect(page.locator('.photo-field').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue(`Keep${tag}`);

    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    const me = (await (await api.get('me')).json()) as {
      profile: { firstName: string; avatar: { publicId: string } | null };
    };
    expect(me.profile.firstName).toBe(`Keep${tag}`);
    expect(me.profile.avatar?.publicId).toBe(publicId);
  });

  test('a too large, wrong-type or unreadable file is refused with a message @full', async ({
    page,
    api,
    tag,
  }) => {
    await routeFakeAvatar(page, api, `refused-${tag}`);
    const field = page.locator('.photo-field');

    await page.getByLabel('Add photo').setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(9 * 1024 * 1024),
    });
    await expect(field.getByRole('alert')).toContainText(/at most \d+ MB/);

    await page.getByLabel('Add photo').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a photo'),
    });
    await expect(field.getByRole('alert')).toContainText('Choose a JPEG, PNG, WebP or HEIC photo.');

    await page.getByLabel('Add photo').setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('this is not a png'),
    });
    await expect(field.getByRole('alert')).toContainText("Couldn't read this photo");
    await expect(page.getByRole('dialog', { name: 'Crop your photo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  });

  test('a broken photo falls back to initials @full', async ({ page, api, webDeck, tag }) => {
    await routeFakeAvatar(page, api, `broken-${tag}`);
    await page.goto(webUrl('/settings/profile'));
    await page.getByLabel('First name').fill('Bro');
    await page.getByLabel('Last name').fill(`Ken${tag}`);
    await pickAndCrop(page, 'Add photo');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    const title = `Broken photo ${tag}`;
    await addCard(api, webDeck, title);
    // Registered last, so it wins over the fake delivery.
    await page.route('https://res.cloudinary.com/**', (route) => route.abort());

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(card(page, title).locator('.avatar__initials')).toHaveText('BK');
    await expect(photoOn(page, title)).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Part 4: names show up everywhere without signing out (Story 5)                              */
/* ------------------------------------------------------------------------------------------ */

test.describe('profile names everywhere @full', () => {
  test('a new name shows in the members row and the activity log; clearing restores the old @full', async ({
    page,
    api,
    webDeck,
    tag,
  }) => {
    const me = (await (await api.get('me')).json()) as { user: { displayName: string } };
    const before = me.user.displayName;

    // a log entry written by the owner
    expect((await api.post(`items/${webDeck.items[0]!.id}/archive`)).status()).toBe(200);

    await page.goto(webUrl('/settings/profile'));
    await page.getByLabel('First name').fill('Nia');
    await page.getByLabel('Last name').fill(`Name${tag}`);
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const named = `Nia Name${tag}`;
    const row = page.locator('.admin-member');
    const archived = page.locator('.event-row', { hasText: 'Archived' }).first();
    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    await expect(row.filter({ hasText: named })).toBeVisible();
    await expect(row.filter({ hasText: named }).locator('.avatar')).toBeVisible();
    await page.goto(webUrl(`/d/${webDeck.slug}/log`));
    await expect(archived).toContainText(named);

    await page.goto(webUrl('/settings/profile'));
    await page.getByLabel('First name').fill('');
    await page.getByLabel('Last name').fill('');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    await expect(row.filter({ hasText: before }).first()).toBeVisible();
    await expect(page.getByText(named)).toHaveCount(0);
    await page.goto(webUrl(`/d/${webDeck.slug}/log`));
    await expect(archived).toContainText(before);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Part 5: location stays private (Story 6)                                                    */
/* ------------------------------------------------------------------------------------------ */

test.describe('profile location @full', () => {
  test('persists, clears, and never shows to other members @full', async ({
    page,
    api,
    webDeck,
    tag,
  }) => {
    const place = `Nowhereville${tag}`;
    const title = `Place card ${tag}`;
    await addCard(api, webDeck, title);

    await page.goto(webUrl('/settings/profile'));
    await page.getByLabel('Location').fill(place);
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Location')).toHaveValue(place);

    // never on a shared-deck card (label, tooltip) or in the members list
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(card(page, title).locator('.avatar')).toBeVisible();
    await card(page, title).locator('.avatar').click();
    await expect(page.getByText(place)).toHaveCount(0);
    await page.goto(webUrl(`/d/${webDeck.slug}/settings`));
    await expect(page.locator('.admin-member').first()).toBeVisible();
    await expect(page.getByText(place)).toHaveCount(0);

    // clear: gone
    await page.goto(webUrl('/settings/profile'));
    await page.getByLabel('Location').fill('');
    await saveButton(page).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Location')).toHaveValue('');
  });
});
