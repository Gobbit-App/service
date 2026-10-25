import { describe, expect, it } from 'vitest';
import type { PublicItem } from '@pb/shared';
import { defaultCalcResult, renderItem, USER_LINK_REL, type ImageUrlFor } from './render-item';

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
        type: 'image',
        payload: { publicId: 'p/1', alt: 'A "map"', width: 800, height: 600 },
      }),
    );
    expect(out).toContain('c_limit,w_1280');
    expect(out).toContain('alt="A &quot;map&quot;"');
    expect(out).toContain('width="800" height="600"');
  });

  it('image without media configured shows the alt text', () => {
    const out = render(
      item({ type: 'image', payload: { publicId: 'p/1', alt: 'A map' } }),
      noMedia,
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('A map');
  });

  it('image without alt is decorative under its title (D206)', () => {
    const out = render(item({ type: 'image', payload: { publicId: 'p/1' } }));
    expect(out).toContain('alt=""');
    const blank = render(item({ type: 'image', payload: { publicId: 'p/1', alt: '  ' } }));
    expect(blank).toContain('alt=""');
  });

  it('image without alt and without media configured prints nothing (D206)', () => {
    const out = render(item({ type: 'image', payload: { publicId: 'p/1' } }), noMedia);
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
});
