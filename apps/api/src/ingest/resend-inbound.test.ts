import { INGEST_IMAGE_MAX_BYTES } from '@pb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendInboundError, createResendInbound } from './resend-inbound';

const fetch = vi.fn<typeof globalThis.fetch>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function calledUrls(): string[] {
  return fetch.mock.calls.map(([u]) => String(u));
}

const attachmentList = {
  data: [
    { id: 'at1', content_type: 'image/png', size: 10, download_url: 'https://cdn.test/1' },
    { id: 'at2', content_type: 'image/JPEG; name=x', size: 10, download_url: 'https://cdn.test/2' },
    {
      id: 'big',
      content_type: 'image/png',
      size: INGEST_IMAGE_MAX_BYTES + 1,
      download_url: 'https://cdn.test/big',
    },
  ],
};

describe('createResendInbound (D104)', () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  it('getEmail calls the receiving endpoint with auth and maps the response', async () => {
    fetch.mockImplementation(async () =>
      json({
        to: ['a@x'],
        received_for: ['t@in.example.com'],
        subject: 'S',
        text: 'T',
        html: null,
        attachments: [{ id: 'at1', filename: 'p.png', content_type: 'image/png', size: 10 }],
      }),
    );
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const email = await inbound.getEmail('em_1');

    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails/receiving/em_1', {
      headers: { Authorization: 'Bearer re_key', Accept: 'application/json' },
    });
    expect(email).toEqual({
      to: ['t@in.example.com', 'a@x'],
      subject: 'S',
      text: 'T',
      html: null,
      attachments: [{ id: 'at1', filename: 'p.png', contentType: 'image/png', size: 10 }],
    });
  });

  it('getEmail tolerates missing to, received_for and attachments', async () => {
    fetch.mockImplementation(async () => json({}));
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const email = await inbound.getEmail('em_1');

    expect(email.to).toEqual([]);
    expect(email.attachments).toEqual([]);
  });

  it('getEmail rejects with ResendInboundError carrying the 404 status', async () => {
    fetch.mockImplementation(async () => json({ message: 'not found' }, 404));
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const err = await inbound.getEmail('em_1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ResendInboundError);
    expect(err).toMatchObject({ status: 404 });
  });

  it('downloadAttachments with no ids resolves [] without calling fetch', async () => {
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    await expect(inbound.downloadAttachments('em_1', [])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloadAttachments returns files in requested order with normalized mimes', async () => {
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/attachments')) return json(attachmentList);
      if (url === 'https://cdn.test/1' || url === 'https://cdn.test/2') {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      return new Response(null, { status: 404 });
    });
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const files = await inbound.downloadAttachments('em_1', ['at2', 'at1']);

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.mime)).toEqual(['image/jpeg', 'image/png']);
    expect(files[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(files[1]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    // Signed CDN URL must be fetched without the API key.
    expect(fetch.mock.calls.find(([u]) => String(u) === 'https://cdn.test/1')).toHaveLength(1);
  });

  it('downloadAttachments skips oversize and unknown attachment ids', async () => {
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/attachments')) return json(attachmentList);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const files = await inbound.downloadAttachments('em_1', ['big', 'nope', 'at1']);

    expect(files).toHaveLength(1);
    expect(files[0]?.mime).toBe('image/png');
    expect(calledUrls()).not.toContain('https://cdn.test/big');
    expect(calledUrls()).toContain('https://cdn.test/1');
  });

  it('downloadAttachments rejects with ResendInboundError when a download fails', async () => {
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/attachments')) return json(attachmentList);
      return new Response(null, { status: 403 });
    });
    const inbound = createResendInbound({ apiKey: 're_key', fetch });

    const err = await inbound.downloadAttachments('em_1', ['at1']).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ResendInboundError);
    expect(err).toMatchObject({ status: 403 });
  });
});
