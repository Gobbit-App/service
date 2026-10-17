import { describe, expect, it, vi } from 'vitest';
import { badRequest } from '../errors/http-errors';
import { createEmailIngest } from './email-ingest';
import type { InboundEmail } from './email-mapping';

type Deps = Parameters<typeof createEmailIngest>[0];

const BODY = 'a'.repeat(43);
const AUTH = { user: { id: 'u1' } as never, tokenId: 't1', deckId: 'd1' };
const FILES = [{ bytes: new Uint8Array([1]), mime: 'image/png' }];
const EMAIL: InboundEmail = {
  to: [],
  subject: 'Re: Soup',
  text: 'Try https://ex.com/a.\n\nOn Mon, Bob wrote:\n> old',
  html: null,
  attachments: [{ id: 'a1', filename: 'p.png', contentType: 'image/png', size: 5 }],
};

function event(to: string[]): unknown {
  return { type: 'email.received', data: { email_id: 'em_1', to, received_for: [] } };
}

function setup(
  auth: typeof AUTH | null = AUTH,
  overrides: {
    submit?: () => Promise<{ id: string; status: 'queued' }>;
    getEmail?: () => Promise<InboundEmail>;
  } = {},
) {
  const inbound = {
    getEmail: vi.fn(overrides.getEmail ?? (async () => EMAIL)),
    downloadAttachments: vi.fn(async () => FILES),
  };
  const tokens = { authenticate: vi.fn(async (_token: string) => auth) };
  const submit = vi.fn(
    overrides.submit ?? (async () => ({ id: 'job1', status: 'queued' as const })),
  );
  const log = vi.fn((_line: string) => undefined);
  const deps = {
    domain: 'in.example.com',
    inbound,
    tokens,
    ingest: { submit },
    log,
  } as unknown as Deps;
  return { deps, inbound, tokens, submit, log };
}

describe('createEmailIngest (D104)', () => {
  it('ignores non-object events and other event types', async () => {
    const { deps, tokens } = setup();
    const { handle } = createEmailIngest(deps);
    await expect(handle(null)).resolves.toBe('ignored');
    await expect(handle('nope')).resolves.toBe('ignored');
    const sent = { type: 'email.sent', data: { email_id: 'em_1', to: [`${BODY}@in.example.com`] } };
    await expect(handle(sent)).resolves.toBe('ignored');
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('answers unknown-token when no recipient is at the domain', async () => {
    const { deps, tokens } = setup();
    const { handle } = createEmailIngest(deps);
    await expect(handle(event(['x@other.com']))).resolves.toBe('unknown-token');
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('answers unknown-token when the local part is not a valid token body', async () => {
    const { deps, tokens } = setup();
    const { handle } = createEmailIngest(deps);
    await expect(handle(event(['short@in.example.com']))).resolves.toBe('unknown-token');
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('answers unknown-token when authentication fails without reading the email', async () => {
    const { deps, inbound } = setup(null);
    const { handle } = createEmailIngest(deps);
    await expect(handle(event([`${BODY}@in.example.com`]))).resolves.toBe('unknown-token');
    expect(inbound.getEmail).not.toHaveBeenCalled();
  });

  it('accepts a valid share and submits the mapped fields', async () => {
    const { deps, inbound, tokens, submit, log } = setup();
    const { handle } = createEmailIngest(deps);
    const outcome = await handle(event([`Gobbit <${BODY}@in.example.com>`]));

    expect(outcome).toBe('accepted');
    expect(tokens.authenticate).toHaveBeenCalledWith(`ing_${BODY}`);
    expect(inbound.downloadAttachments).toHaveBeenCalledWith('em_1', ['a1']);
    expect(submit).toHaveBeenCalledWith(
      { user: AUTH.user, via: 'email', tokenDeckId: 'd1' },
      {
        title: 'Soup',
        text: 'Try https://ex.com/a.',
        url: 'https://ex.com/a',
        files: FILES,
      },
    );

    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('em_1');
    expect(line).toContain('accepted');
    expect(JSON.stringify(log.mock.calls)).not.toContain(BODY);
  });

  it('answers rejected when submit raises a sender-side HTTP error', async () => {
    const { deps, log } = setup(AUTH, {
      submit: async () => {
        throw badRequest('Share some text');
      },
    });
    const { handle } = createEmailIngest(deps);
    await expect(handle(event([`${BODY}@in.example.com`]))).resolves.toBe('rejected');
    expect(String(log.mock.calls[0]?.[0])).toContain('rejected');
  });

  it('rethrows unexpected submit errors so the webhook retries', async () => {
    const { deps } = setup(AUTH, {
      submit: async () => {
        throw new Error('db down');
      },
    });
    const { handle } = createEmailIngest(deps);
    await expect(handle(event([`${BODY}@in.example.com`]))).rejects.toThrow('db down');
  });

  it('rethrows when fetching the email fails', async () => {
    const { deps } = setup(AUTH, {
      getEmail: async () => {
        throw new Error('resend down');
      },
    });
    const { handle } = createEmailIngest(deps);
    await expect(handle(event([`${BODY}@in.example.com`]))).rejects.toThrow('resend down');
  });
});
