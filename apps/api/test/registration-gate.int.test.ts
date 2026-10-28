import { beforeEach, describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../src/lib/tokens';
import { captureLogger, expectDecision } from './capture-logger';
import { json, OWNER_EMAIL, setupApiTest, tokenFromMail, type ApiTestContext } from './helpers';

const IP_HEADER = 'x-test-ip';
const APP_URL = 'http://app.test';
const HOUR_MS = 3_600_000;

let ipSeq = 0;
const nextIp = () => `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
let emailSeq = 0;
const nextEmail = () => `gate-${++emailSeq}@example.test`;

function harness(ctx: ApiTestContext) {
  const requestLink = (email: string) =>
    ctx.app.request('/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [IP_HEADER]: nextIp() },
      body: JSON.stringify({ email }),
    });
  const callback = (token: string) =>
    ctx.app.request(`/auth/callback?token=${encodeURIComponent(token)}`, {
      headers: { [IP_HEADER]: nextIp() },
    });
  const user = async (email: string) =>
    (
      await ctx.t.pool.query(
        'SELECT id, registered_via, registered_by FROM users WHERE email = $1',
        [email],
      )
    ).rows[0] as
      { id: string; registered_via: string | null; registered_by: string | null } | undefined;
  const links = async (email: string) =>
    (await ctx.t.pool.query('SELECT used_at FROM magic_links WHERE email = $1', [email])).rows;
  /** A sign-in link minted outside the gate, e.g. requested before the mode switched to waitlist. */
  const plantSignInLink = async (email: string) => {
    const token = generateToken();
    await ctx.t.pool.query(
      `INSERT INTO magic_links (email, token_hash, purpose, expires_at)
       VALUES ($1, $2, 'sign_in', $3)`,
      [email, hashToken(token), new Date(ctx.clock.now().getTime() + HOUR_MS)],
    );
    return token;
  };
  return { requestLink, callback, user, links, plantSignInLink };
}

describe('registration gate in waitlist mode (D222, D241)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: IP_HEADER }, logger: capture.logger });
  const h = harness(ctx);

  beforeEach(() => {
    ctx.mailer.clear();
    capture.lines.length = 0;
  });

  it('answers an unknown address exactly like a known one and lists it instead', async () => {
    const unknown = nextEmail();

    const known = await h.requestLink(OWNER_EMAIL);
    const listed = await h.requestLink(unknown);

    expect(listed.status).toBe(known.status);
    expect(await json(listed)).toEqual(await json(known));
    expect(await h.user(unknown)).toBeUndefined();
    expect(await h.links(unknown)).toHaveLength(0);
    const { rows } = await ctx.t.pool.query(
      'SELECT source, kind FROM waitlist_entries WHERE email = $1',
      [unknown],
    );
    expect(rows).toEqual([{ source: 'sign_in', kind: 'other' }]);

    await capture.flush();
    expectDecision(capture.lines, 'auth.magic_link', { outcome: 'sent' });
    expectDecision(capture.lines, 'auth.magic_link', { outcome: 'waitlisted' });
    const logged = JSON.stringify(capture.lines);
    expect(logged).not.toContain(unknown);
    expect(logged).not.toContain(OWNER_EMAIL);
  });

  it('refuses a sign-in link for an address without a user and keeps the link unused', async () => {
    const unknown = nextEmail();
    const token = await h.plantSignInLink(unknown);

    const res = await h.callback(token);

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.type).toBe('/problems/magic-link-invalid');
    expect(body.detail).toBe('Registration is closed');
    expect(await h.user(unknown)).toBeUndefined();
    expect(await h.links(unknown)).toEqual([{ used_at: null }]);

    await capture.flush();
    expectDecision(capture.lines, 'auth.callback', { outcome: 'failed', reason: 'closed' });
    expectDecision(capture.lines, 'users.register', {
      outcome: 'refused',
      reason: 'registration_closed',
    });
    expect(JSON.stringify(capture.lines)).not.toContain(unknown);
  });

  it('registers a deck invitee as deck_invite by the inviter, who can then sign in', async () => {
    const invitee = nextEmail();
    const owner = await h.user(OWNER_EMAIL);

    const invite = await ctx.app.request('/decks/family/invites', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ email: invitee, role: 'reader' }),
    });
    expect(invite.status).toBe(201);

    expect(await h.user(invitee)).toMatchObject({
      registered_via: 'deck_invite',
      registered_by: owner!.id,
    });
    expect((await h.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    ctx.mailer.clear();
    await h.requestLink(invitee);
    expect((await h.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    await capture.flush();
    expectDecision(capture.lines, 'users.register', { outcome: 'created' });
  });

  it('leaves an existing user untouched when they are invited again', async () => {
    const before = await h.user(OWNER_EMAIL);
    await h.requestLink(OWNER_EMAIL);
    expect((await h.callback(tokenFromMail(ctx.mailer))).status).toBe(303);
    expect(await h.user(OWNER_EMAIL)).toEqual(before);
  });
});

describe('registration gate with APP_URL (D222)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: IP_HEADER, APP_URL } });
  const h = harness(ctx);

  it('redirects a closed sign-in to the web error page', async () => {
    const res = await h.callback(await h.plantSignInLink(nextEmail()));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`${APP_URL}/auth/error?reason=closed`);
  });
});

describe('registration gate in open mode (D222)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER, REGISTRATION_MODE: 'open' },
    logger: capture.logger,
  });
  const h = harness(ctx);

  it('registers an unknown address on sign-in as open_sign_in', async () => {
    const fresh = nextEmail();

    await h.requestLink(fresh);
    expect((await h.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    expect(await h.user(fresh)).toMatchObject({
      registered_via: 'open_sign_in',
      registered_by: null,
    });
    const { rows } = await ctx.t.pool.query('SELECT 1 FROM waitlist_entries WHERE email = $1', [
      fresh,
    ]);
    expect(rows).toHaveLength(0);

    await capture.flush();
    expectDecision(capture.lines, 'users.register', { outcome: 'created' });
    expect(expectDecision(capture.lines, 'auth.callback', { outcome: 'signed_in' })).toMatchObject({
      created: true,
    });
    expect(JSON.stringify(capture.lines)).not.toContain(fresh);
  });
});
