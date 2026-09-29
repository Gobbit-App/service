import { beforeAll } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { UserRow } from '@pb/db';
import type { AppEnv } from '../src/types';
import { createApp } from '../src/app';
import { parseEnv, type Env } from '../src/env';
import { MemoryMailer } from '../src/mail/memory-mailer';
import { SESSION_COOKIE } from '../src/lib/cookies';
import {
  createSampleWorld,
  fixtureId,
  openSession,
  OTHER_EMAIL,
  OWNER_EMAIL,
  withTestDb,
  type SampleWorld,
  type TestDb,
} from '@pb/db/test';

export const TEST_API_URL = 'http://api.test';

export const FAMILY_ID = fixtureId('deck/family');

/** A controllable clock handed to the app; `advance` moves time forward for expiry tests. */
export interface TestClock {
  now(): Date;
  advance(ms: number): void;
  reset(): void;
}

function createClock(): TestClock {
  let offset = 0;
  return {
    now: () => new Date(Date.now() + offset),
    advance: (ms) => {
      offset += ms;
    },
    reset: () => {
      offset = 0;
    },
  };
}

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    NODE_ENV: 'test',
    COOKIE_SECURE: 'false',
    API_URL: TEST_API_URL,
    ...overrides,
  });
}

export interface SetupApiTestOptions {
  /** Env overrides (string values, as they would appear in `process.env`). */
  env?: Record<string, string>;
}

export interface ApiTestContext {
  readonly app: OpenAPIHono<AppEnv>;
  readonly t: TestDb;
  readonly world: SampleWorld;
  readonly env: Env;
  readonly mailer: MemoryMailer;
  readonly clock: TestClock;
  /** Bearer + JSON headers for a user with a registered session (owner by default). */
  as(email?: string): Record<string, string>;
  /** Cookie + JSON headers for a user's cookie-kind session (owner by default). */
  asCookie(email?: string): Record<string, string>;
  /** JSON headers with no credentials. */
  anon(): Record<string, string>;
  /** Opens bearer and cookie sessions for `user` so `as`/`asCookie` accept their email. */
  sessionFor(user: Pick<UserRow, 'id' | 'email'>): Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setupApiTest(opts: SetupApiTestOptions = {}): ApiTestContext {
  const t = withTestDb();
  const env = testEnv(opts.env);
  const mailer = new MemoryMailer();
  const clock = createClock();
  const bearers = new Map<string, string>();
  const cookies = new Map<string, string>();
  let app: OpenAPIHono<AppEnv>;
  let world: SampleWorld;

  async function sessionFor(user: Pick<UserRow, 'id' | 'email'>): Promise<void> {
    const bearer = await openSession(t.db, user, { kind: 'bearer' });
    const cookie = await openSession(t.db, user, { kind: 'cookie' });
    bearers.set(user.email, bearer.token);
    cookies.set(user.email, cookie.token);
  }

  function tokenFor(map: Map<string, string>, email: string): string {
    const token = map.get(email);
    if (!token) {
      throw new Error(`No test session for ${email}; call ctx.sessionFor(user) first`);
    }
    return token;
  }

  beforeAll(async () => {
    world = await createSampleWorld(t.db);
    await sessionFor(world.owner);
    await sessionFor(world.other);
    app = createApp({ db: t.db, pool: t.pool, env, mailer, now: clock.now });
  });

  return {
    get app(): OpenAPIHono<AppEnv> {
      return app!;
    },
    get t(): TestDb {
      return t;
    },
    get world(): SampleWorld {
      return world!;
    },
    env,
    mailer,
    clock,
    as(email: string = OWNER_EMAIL): Record<string, string> {
      return { Authorization: `Bearer ${tokenFor(bearers, email)}`, ...JSON_HEADERS };
    },
    asCookie(email: string = OWNER_EMAIL): Record<string, string> {
      return { Cookie: `${SESSION_COOKIE}=${tokenFor(cookies, email)}`, ...JSON_HEADERS };
    },
    anon(): Record<string, string> {
      return { ...JSON_HEADERS };
    },
    sessionFor,
  };
}

/** Pulls the raw token out of a link in the last sent mail (sign-in or invite). */
export function tokenFromMail(mailer: MemoryMailer): string {
  const msg = mailer.last();
  if (!msg) {
    throw new Error('No mail was sent');
  }
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(msg.text);
  if (!match) {
    throw new Error(`No token link in mail: ${msg.text}`);
  }
  return match[1];
}

/** The session token set by a response's `Set-Cookie`, or null. */
export function sessionTokenFromSetCookie(res: Response): string | null {
  const header = res.headers.get('Set-Cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(header);
  return match && match[1] ? match[1] : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper for loosely-typed JSON bodies
export async function json(res: Response): Promise<any> {
  return res.json();
}

export { OWNER_EMAIL, OTHER_EMAIL, fixtureId };
