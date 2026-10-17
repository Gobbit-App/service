import type { OpenAPIHono } from '@hono/zod-openapi';
import { Webhook } from 'svix';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import type { Services } from '../services';
import { emailIngestDomain } from '../ai/providers';
import { unauthorized } from '../errors/http-errors';
import { createEmailIngest } from '../ingest/email-ingest';
import { createResendInbound, type ResendInbound } from '../ingest/resend-inbound';

export const RESEND_INBOUND_PATH = '/webhooks/resend/inbound';

/** A signed but malformed body is acknowledged as ignored rather than retried forever. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

type WebhookEnv = Pick<Env, 'INGEST_EMAIL_DOMAIN' | 'RESEND_WEBHOOK_SECRET' | 'RESEND_API_KEY'>;

/**
 * D104: Resend inbound-mail webhook. Registered only when email-in is configured, so the path
 * is a plain 404 otherwise. Kept out of the OpenAPI document (not a client API). The Svix
 * signature over the raw body is the only credential; after it checks out the answer is
 * always 200 unless Resend or the database failed (then 5xx, and Resend retries).
 */
export function registerWebhookRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: { env: WebhookEnv; services: Services; inbound?: ResendInbound },
): void {
  const { env, services } = deps;
  const domain = emailIngestDomain(env);
  if (!domain || !env.RESEND_WEBHOOK_SECRET || !env.RESEND_API_KEY) {
    return;
  }

  const webhook = new Webhook(env.RESEND_WEBHOOK_SECRET);
  const emailIngest = createEmailIngest({
    domain,
    inbound: deps.inbound ?? createResendInbound({ apiKey: env.RESEND_API_KEY }),
    tokens: services.ingestTokens,
    ingest: services.ingest,
  });

  app.post(RESEND_INBOUND_PATH, async (c) => {
    const raw = await c.req.text();
    try {
      // svix 2.x only verifies (signature + 5-minute timestamp window); it returns nothing.
      webhook.verify(raw, {
        'svix-id': c.req.header('svix-id') ?? '',
        'svix-timestamp': c.req.header('svix-timestamp') ?? '',
        'svix-signature': c.req.header('svix-signature') ?? '',
      });
    } catch {
      throw unauthorized('Invalid webhook signature');
    }
    const outcome = await emailIngest.handle(parseJson(raw));
    return c.json({ outcome: outcome === 'ignored' ? 'ignored' : 'received' }, 200);
  });
}
