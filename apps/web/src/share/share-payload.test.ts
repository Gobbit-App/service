import { describe, expect, it } from 'vitest';
import { INGEST_MAX_IMAGES } from '@pb/shared/ingest-constants';
import {
  SHARE_TTL_MS,
  acceptedImages,
  buildIngestForm,
  hasContent,
  isExpired,
  isHttpUrl,
  normalizeShared,
  payloadFromFormData,
} from './share-payload';

const img = (name = 'a.jpg', type = 'image/jpeg') => new File(['x'], name, { type });

describe('acceptedImages (D98)', () => {
  it('keeps jpeg, png, webp and heic files', () => {
    expect(
      acceptedImages([img('a.jpg'), img('b.png', 'image/png'), img('c.webp', 'image/webp')]).map(
        (f) => f.name,
      ),
    ).toEqual(['a.jpg', 'b.png', 'c.webp']);
    expect(acceptedImages([img('d.heic', 'image/heic')])).toHaveLength(1);
  });

  it('drops gif, pdf, non-File values and empty files', () => {
    const files: unknown[] = [
      img('g.gif', 'image/gif'),
      img('p.pdf', 'application/pdf'),
      'not-a-file',
      new File([], 'e.jpg', { type: 'image/jpeg' }),
      img('ok.png', 'image/png'),
    ];
    expect(acceptedImages(files).map((f) => f.name)).toEqual(['ok.png']);
  });

  it('caps at INGEST_MAX_IMAGES, keeping the first ones in order', () => {
    const files = [1, 2, 3, 4, 5].map((n) => img(`${n}.jpg`));
    const kept = acceptedImages(files);
    expect(kept).toHaveLength(INGEST_MAX_IMAGES);
    expect(kept.map((f) => f.name)).toEqual(
      ['1.jpg', '2.jpg', '3.jpg'].slice(0, INGEST_MAX_IMAGES),
    );
  });
});

describe('isHttpUrl (D98)', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(isHttpUrl('https://a.example/x')).toBe(true);
    expect(isHttpUrl('http://a.example')).toBe(true);
  });

  it('rejects other schemes, non-URLs and empty strings', () => {
    expect(isHttpUrl('ftp://a')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('normalizeShared (D98)', () => {
  it('moves a text-only URL into url', () => {
    expect(normalizeShared({ title: '', text: 'https://a.example', url: '' })).toEqual({
      title: '',
      text: '',
      url: 'https://a.example',
    });
  });

  it('keeps url when already set and leaves text unchanged', () => {
    expect(
      normalizeShared({ title: 't', text: 'https://b.example', url: 'https://a.example' }),
    ).toEqual({ title: 't', text: 'https://b.example', url: 'https://a.example' });
  });

  it('leaves caption plus URL as text with empty url', () => {
    expect(normalizeShared({ title: '', text: 'see https://a.example', url: '' })).toEqual({
      title: '',
      text: 'see https://a.example',
      url: '',
    });
  });
});

describe('payloadFromFormData (D98)', () => {
  it('builds the payload from a multipart form, trimming and dropping non-images', () => {
    const form = new FormData();
    form.set('title', '  T  ');
    form.set('text', 'hello');
    form.set('url', 'https://a.example/');
    form.append('files', new File(['x'], 'pic.png', { type: 'image/png' }), 'pic.png');
    form.append('files', new File(['x'], 'doc.pdf', { type: 'application/pdf' }), 'doc.pdf');

    const payload = payloadFromFormData(form, 'id1', 1000);

    expect(payload.id).toBe('id1');
    expect(payload.createdAt).toBe(1000);
    expect(payload.title).toBe('T');
    expect(payload.text).toBe('hello');
    expect(payload.url).toBe('https://a.example/');
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]?.name).toBe('pic.png');
  });

  it('turns missing fields into empty strings', () => {
    const payload = payloadFromFormData(new FormData(), 'id2', 5);
    expect(payload).toEqual({
      id: 'id2',
      createdAt: 5,
      title: '',
      text: '',
      url: '',
      files: [],
    });
  });

  it('moves a text-only URL to url', () => {
    const form = new FormData();
    form.set('text', 'https://a.example/x');
    const payload = payloadFromFormData(form, 'id3', 0);
    expect(payload.text).toBe('');
    expect(payload.url).toBe('https://a.example/x');
  });
});

describe('isExpired (D98)', () => {
  it('is false at exactly the TTL boundary', () => {
    expect(isExpired({ createdAt: 0 }, SHARE_TTL_MS)).toBe(false);
  });

  it('is true one millisecond past the TTL', () => {
    expect(isExpired({ createdAt: 0 }, SHARE_TTL_MS + 1)).toBe(true);
  });
});

describe('hasContent (D98)', () => {
  it('is false for empty or whitespace-only drafts with no files', () => {
    expect(hasContent({ text: '', url: '', files: [] })).toBe(false);
    expect(hasContent({ text: '   ', url: '  \n', files: [] })).toBe(false);
  });

  it('is true for text, for a url, or for files only', () => {
    expect(hasContent({ text: 'hi', url: '', files: [] })).toBe(true);
    expect(hasContent({ text: '', url: 'https://a.example', files: [] })).toBe(true);
    expect(hasContent({ text: '', url: '', files: [img()] })).toBe(true);
  });
});

describe('buildIngestForm (D98)', () => {
  it('builds the POST /ingest body, omitting empty fields', () => {
    const form = buildIngestForm({
      deckId: 'd1',
      channel: 'pwa',
      title: '',
      text: ' hi ',
      url: '',
      files: [img()],
      channel_placeholder: undefined,
    } as Parameters<typeof buildIngestForm>[0]);

    expect(form.get('deckId')).toBe('d1');
    expect(form.get('channel')).toBe('pwa');
    expect(form.get('text')).toBe('hi');
    expect(form.has('title')).toBe(false);
    expect(form.has('url')).toBe(false);
    expect((form.getAll('files')[0] as File).name).toBe('a.jpg');
  });
});
