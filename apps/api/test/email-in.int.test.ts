import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { ingestJobs } from '@gobbit/db';
import type { IngestQueue } from '../src/jobs/ingest-queue';
import type { InboundEmail } from '../src/ingest/email-mapping';
import type { ResendInbound } from '../src/ingest/resend-inbound';
import { MemoryIngestUploads } from '../src/media/ingest-uploads';
import { RESEND_INBOUND_PATH } from '../src/routes/webhooks';
import { json, setupApiTest } from './helpers';

const SECRET = `whsec_${Buffer.from('email-in-integration-signing-key').toString('base64')}`;
const DOMAIN = 'in.example.com';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class RecordingQueue implements IngestQueue {
  readonly ids: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }
}

/** Resend stand-in: one stored email per id, every attachment is a tiny PNG. */
class FakeInbound implements ResendInbound {
  readonly emails = new Map<string, InboundEmail>();
  async getEmail(emailId: string): Promise<InboundEmail> {
    const email = this.emails.get(emailId);
    if (!email) throw new Error(`no email ${emailId}`);
    return email;
  }
  async downloadAttachments(_emailId: string, ids: readonly string[]) {
    return ids.map(() => ({ bytes: PNG, mime: 'image/png' }));
  }
}

describe(`POST ${RESEND_INBOUND_PATH} (D104)`, () => {
  const queue = new RecordingQueue();
  const inbound = new FakeInbound();
  const ctx = setupApiTest({
    env: { INGEST_EMAIL_DOMAIN: DOMAIN, RESEND_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're-test' },
    ingest: { enabled: true, uploads: new MemoryIngestUploads(), queue, emailInbound: inbound },
  });

  const createToken = async (body: unknown): Promise<string> => {
    const res = await ctx.app.request('/me/ingest-tokens', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    return (await json(res)).token;
  };

  /** Stores the email and posts a signed `email.received` event addressed to `to`. */
  const deliver = (emailId: string, to: string, email: Omit<InboundEmail, 'to'>) => {
    inbound.emails.set(emailId, { ...email, to: [to] });
    const payload = JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: { email_id: emailId, from: 'me@example.org', to: [to], subject: email.subject },
    });
    const now = new Date();
    return ctx.app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': `msg_${emailId}`,
        'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
        'svix-signature': new Webhook(SECRET).sign(`msg_${emailId}`, now, payload),
      },
      body: payload,
    });
  };

  const jobsFor = (userId: string) =>
    ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.userId, userId));

  it('turns a mail to a bound token address into an email-channel job in that deck', async () => {
    const token = await createToken({ label: 'mail', deckId: ctx.world.decks.family.id });
    const res = await deliver('em_bound', `Gobbit <${token.slice(4)}@${DOMAIN}>`, {
      subject: 'Fwd: Plumber',
      text: 'Dan 050-1234567 https://example.com/dan\n\nOn Mon, Bob wrote:\n> older',
      html: null,
      attachments: [
        { id: 'a1', filename: 'card.png', contentType: 'image/png', size: 8 },
        { id: 'a2', filename: 'notes.pdf', contentType: 'application/pdf', size: 8 },
      ],
    });
    expect(res.status).toBe(200);

    const [job] = (await jobsFor(ctx.world.owner.id)).filter((j) => j.channel === 'email');
    expect(job).toBeDefined();
    expect(job?.deckId).toBe(ctx.world.decks.family.id);
    expect(queue.ids).toContain(job?.id);
    expect(job?.raw).toMatchObject({
      title: 'Plumber',
      text: 'Dan 050-1234567 https://example.com/dan',
      url: 'https://example.com/dan',
    });
    expect(job?.raw?.images).toHaveLength(1);
  });

  it('drops mail to an unknown or revoked token with a 200 (no oracle)', async () => {
    const before = (await jobsFor(ctx.world.owner.id)).length;
    const unknown = await deliver('em_unknown', `${'A'.repeat(43)}@${DOMAIN}`, {
      subject: 'x',
      text: 'hello',
      attachments: [],
    });
    expect(unknown.status).toBe(200);

    const created = await json(
      await ctx.app.request('/me/ingest-tokens', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ label: 'gone' }),
      }),
    );
    await ctx.app.request(`/me/ingest-tokens/${created.id}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    const revoked = await deliver('em_revoked', `${created.token.slice(4)}@${DOMAIN}`, {
      subject: 'x',
      text: 'hello',
      attachments: [],
    });
    expect(revoked.status).toBe(200);
    expect(await jobsFor(ctx.world.owner.id)).toHaveLength(before);
  });

  it('acknowledges an empty mail without creating a job', async () => {
    const token = await createToken({ label: 'empty' });
    const before = (await jobsFor(ctx.world.owner.id)).length;
    const res = await deliver('em_empty', `${token.slice(4)}@${DOMAIN}`, {
      subject: null,
      text: '   ',
      attachments: [],
    });
    expect(res.status).toBe(200);
    expect(await jobsFor(ctx.world.owner.id)).toHaveLength(before);
  });

  it('rejects an unsigned post (401)', async () => {
    const res = await ctx.app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received', data: { email_id: 'em_x' } }),
    });
    expect(res.status).toBe(401);
  });
});

describe(`${RESEND_INBOUND_PATH} when email-in is off`, () => {
  const ctx = setupApiTest();

  it('is not routed (404)', async () => {
    const res = await ctx.app.request(RESEND_INBOUND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
