import { OpenAPIHono } from '@hono/zod-openapi';
import { Webhook } from 'svix';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { errorHandler } from '../middleware/error-handler';
import type { ResendInbound } from '../ingest/resend-inbound';
import { RESEND_INBOUND_PATH, registerWebhookRoutes } from './webhooks';

const SECRET = `whsec_${Buffer.from('email-in-unit-test-signing-key!!').toString('base64')}`;
const ENV = {
  INGEST_EMAIL_DOMAIN: 'in.example.com',
  RESEND_WEBHOOK_SECRET: SECRET,
  RESEND_API_KEY: 're-test-value',
};

function buildApp(env: Partial<typeof ENV> = ENV) {
  const authenticate = vi.fn(async () => null);
  const services = { ingestTokens: { authenticate }, ingest: { submit: vi.fn() } };
  const inbound: ResendInbound = { getEmail: vi.fn(), downloadAttachments: vi.fn() };
  const app = new OpenAPIHono<AppEnv>();
  registerWebhookRoutes(app, { env, services: services as unknown as Services, inbound });
  app.onError(errorHandler);
  return { app, authenticate };
}

function signed(payload: string, secret = SECRET): Record<string, string> {
  const id = 'msg_test';
  const now = new Date();
  return {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign(id, now, payload),
  };
}

const EVENT = JSON.stringify({
  type: 'email.received',
  data: { email_id: 'em_1', to: [`${'a'.repeat(43)}@in.example.com`], received_for: [] },
});

describe(`POST ${RESEND_INBOUND_PATH} (D104)`, () => {
  it('is not registered unless the domain, secret and API key are all set', async () => {
    for (const missing of Object.keys(ENV) as (keyof typeof ENV)[]) {
      const { app } = buildApp({ ...ENV, [missing]: undefined });
      const res = await app.request(RESEND_INBOUND_PATH, { method: 'POST', body: EVENT });
      expect(res.status, missing).toBe(404);
    }
  });

  it('rejects a missing or wrong signature (401) without touching tokens', async () => {
    const { app, authenticate } = buildApp();
    const unsigned = await app.request(RESEND_INBOUND_PATH, { method: 'POST', body: EVENT });
    expect(unsigned.status).toBe(401);

    const otherKey = `whsec_${Buffer.from('some-other-signing-key-entirely!').toString('base64')}`;
    const forged = await app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: signed(EVENT, otherKey),
      body: EVENT,
    });
    expect(forged.status).toBe(401);

    const tampered = await app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: signed(EVENT),
      body: EVENT.replace('em_1', 'em_2'),
    });
    expect(tampered.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('answers 200 for a signed event even when the token is unknown', async () => {
    const { app, authenticate } = buildApp();
    const res = await app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: signed(EVENT),
      body: EVENT,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'received' });
    expect(authenticate).toHaveBeenCalledWith(`ing_${'a'.repeat(43)}`);
  });

  it('acknowledges other event types as ignored', async () => {
    const { app } = buildApp();
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em_1' } });
    const res = await app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: signed(body),
      body,
    });
    expect(await res.json()).toEqual({ outcome: 'ignored' });
  });
});
