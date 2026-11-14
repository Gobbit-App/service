import { describe, expect, it } from 'vitest';
import type { PublicItem } from '@gobbit/shared';
import { mediaDeliveryUrl } from '@gobbit/shared/media-constants';
import {
  defaultCalcResult,
  formatDuration,
  renderItem,
  USER_LINK_REL,
  type ImageUrlFor,
  type MediaUrlFor,
} from './render-item';

const imageUrl: ImageUrlFor = (id, t) => `https://res.cloudinary.com/demo/image/upload/${t}/${id}`;
const noMedia: ImageUrlFor = () => null;

function item(over: Partial<PublicItem>): PublicItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'text',
    title: 'Card',
    body: '',
    payload: {},
    entities: {},
    sourceUrl: null,
    verifiedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    categories: [],
    ...over,
  } as PublicItem;
}

const render = (i: PublicItem, urls: ImageUrlFor = imageUrl) => renderItem(i, urls).toString();

describe('renderItem (D177)', () => {
  it('text: title escaped, body as markdown', () => {
    const out = render(item({ title: 'Hi <b>there</b>', body: 'Call **112**' }));
    expect(out).toContain('<h1>Hi &lt;b&gt;there&lt;/b&gt;</h1>');
    expect(out).toContain('<strong>112</strong>');
  });

  it('link: rel, host, stored preview image first', () => {
    const out = render(
      item({
        type: 'link',
        payload: {
          url: 'https://example.com/page?a=1&b=2',
          preview: {
            title: 'Example',
            publicId: 'snap/1',
            width: 600,
            height: 300,
            image: 'https://x/remote.jpg',
          },
        },
      }),
    );
    expect(out).toContain(`href="https://example.com/page?a=1&amp;b=2" rel="${USER_LINK_REL}"`);
    expect(out).toContain('example.com</span>');
    expect(out).toContain('snap/1');
    expect(out).not.toContain('remote.jpg');
    expect(out).toContain('width="600" height="300"');
  });

  it('link: falls back to the remote image without a snapshot', () => {
    const out = render(
      item({
        type: 'link',
        payload: { url: 'https://example.com', preview: { image: 'https://x/remote.jpg' } },
      }),
    );
    expect(out).toContain('src="https://x/remote.jpg"');
  });

  it('image: limited width URL, alt and dimensions', () => {
    const out = render(
      item({
        type: 'media',
        payload: { publicId: 'p/1', alt: 'A "map"', width: 800, height: 600 },
      }),
    );
    expect(out).toContain('c_limit,w_1280');
    expect(out).toContain('alt="A &quot;map&quot;"');
    expect(out).toContain('width="800" height="600"');
  });

  it('image without media configured shows the alt text', () => {
    const out = render(
      item({ type: 'media', payload: { publicId: 'p/1', alt: 'A map' } }),
      noMedia,
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('A map');
  });

  it('image without alt is decorative under its title (D206)', () => {
    const out = render(item({ type: 'media', payload: { publicId: 'p/1' } }));
    expect(out).toContain('alt=""');
    const blank = render(item({ type: 'media', payload: { publicId: 'p/1', alt: '  ' } }));
    expect(blank).toContain('alt=""');
  });

  it('image without alt and without media configured prints nothing (D206)', () => {
    const out = render(item({ type: 'media', payload: { publicId: 'p/1' } }), noMedia);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('undefined');
  });

  it('table: header row and escaped cells', () => {
    const out = render(
      item({ type: 'table', payload: { columns: ['Name', 'Phone'], rows: [['<x>', '112']] } }),
    );
    expect(out).toContain('<th scope="col">Name</th>');
    expect(out).toContain('<td>&lt;x&gt;</td>');
  });

  it('calc: the default result', () => {
    const out = render(
      item({
        type: 'calc',
        payload: {
          fields: [
            { key: 'a', label: 'Adults', default: 2 },
            { key: 'b', label: 'Per adult', unit: 'L', default: 3 },
          ],
          expression: 'a * b',
          resultLabel: 'Water',
        },
      }),
    );
    expect(out).toContain('<dt>Water</dt><dd class="result">6</dd>');
    expect(out).toContain('3 L');
  });

  it('calc without a default has no result', () => {
    expect(
      defaultCalcResult({
        fields: [{ key: 'a', label: 'A' }],
        expression: 'a * 2',
        resultLabel: 'R',
      }),
    ).toBeNull();
  });

  it('an invalid payload renders the title and body only', () => {
    const out = render(item({ type: 'table', payload: { nope: true }, body: 'still here' }));
    expect(out).toContain('still here');
    expect(out).not.toContain('<table');
  });

  it('event: absolute when in its zone, location and link; no notify settings', () => {
    const out = render(
      item({
        type: 'event',
        title: 'Fair',
        payload: {
          allDay: false,
          start: '2030-06-01T18:00:00+03:00',
          timeZone: 'Asia/Jerusalem',
          location: 'Town <Hall>',
          url: 'https://example.com/fair',
          preview: { title: 'Summer fair' },
        },
      }),
    );
    expect(out).toContain('class="event-when"');
    expect(out).toContain('18:00');
    expect(out).toContain('(Asia/Jerusalem)');
    expect(out).toContain('Town &lt;Hall&gt;');
    expect(out).toContain(`rel="${USER_LINK_REL}"`);
    expect(out).toContain('Summer fair');
  });

  it('event without a link or location renders the when only', () => {
    const out = render(
      item({
        type: 'event',
        payload: { allDay: true, start: '2030-06-01', timeZone: 'UTC' },
      }),
    );
    expect(out).toContain('class="event-when"');
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('event-location');
  });
});

describe('renderItem media (045, D397, D398)', () => {
  const mediaUrl: MediaUrlFor = (r, id) => mediaDeliveryUrl('demo', r, id);
  const renderMedia = (
    payload: Record<string, unknown>,
    urls: MediaUrlFor | undefined = mediaUrl,
  ) => renderItem(item({ type: 'media', title: 'Card', payload }), imageUrl, urls).toString();

  it('shows every gallery photo in order, without scripts', () => {
    const out = renderMedia({
      kind: 'image',
      images: [
        { publicId: 'p/2', alt: 'Second', width: 30, height: 40 },
        { publicId: 'p/1', alt: 'First' },
      ],
    });
    expect(out.indexOf('p/2')).toBeLessThan(out.indexOf('p/1'));
    expect(out.match(/<img /g)).toHaveLength(2);
    expect(out).not.toContain('<script');
  });

  it('plays a video with its still, never before a tap', () => {
    const out = renderMedia({
      kind: 'video',
      publicId: 'v/1',
      width: 720,
      height: 1280,
      durationMs: 65_000,
    });
    expect(out).toContain('<video controls playsinline preload="none"');
    expect(out).toContain('poster="https://res.cloudinary.com/demo/video/upload/so_auto');
    expect(out).toContain('video/upload/c_limit,w_1280,h_1280,q_auto,vc_auto/v/1.mp4');
    expect(out).toContain('width="720" height="1280"');
    expect(out).toContain('Video · 1:05');
    expect(out).not.toContain('autoplay');
  });

  it('plays audio with the browser controls and its duration', () => {
    const out = renderMedia({ kind: 'audio', publicId: 'a/1', durationMs: 4_100 });
    expect(out).toContain('<audio controls preload="none"');
    expect(out).toContain('video/upload/q_auto/a/1.mp3');
    expect(out).toContain('Audio · 0:04');
  });

  it('links a PDF’s first page to the original with its page count', () => {
    const out = renderMedia({ kind: 'pdf', publicId: 'd/1', pages: 3, alt: 'Term dates' });
    expect(out).toContain('image/upload/pg_1,f_auto,q_auto,c_limit,w_1080/d/1"');
    expect(out).toContain('href="https://res.cloudinary.com/demo/image/upload/d/1.pdf"');
    expect(out).toContain('alt="Term dates"');
    expect(out).toContain('3 pages');
    expect(out).toContain(`rel="${USER_LINK_REL}"`);
  });

  it('says unavailable without media storage', () => {
    const out = renderMedia({ kind: 'video', publicId: 'v/1' }, () => null);
    expect(out).toContain('File unavailable');
    expect(out).not.toContain('<video');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [65_000, '1:05'],
    [3_725_000, '1:02:05'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
