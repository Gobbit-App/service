import { expect, test } from '../../fixtures/api';
import { recordMediaAsset, type FakeMediaFile } from '../../fixtures/cloudinary';
import { webUrl } from '../../fixtures/web';

/**
 * 045 US6 (T047, `@full`): a public deck shows each media kind without scripts, and share
 * previews pick the cover, the video still or the PDF's first page (D397). Files are recorded
 * through the real confirm step with a locally signed answer; nothing reaches Cloudinary.
 */
test('public pages and share previews show every media kind @full', async ({
  api,
  anon,
  smokeDeck,
}) => {
  const record = (file: FakeMediaFile) => recordMediaAsset(api, smokeDeck.id, file);
  const cover = await record({ kind: 'image', format: 'png', width: 30, height: 40 });
  test.skip(cover === null, 'needs CLOUDINARY_API_SECRET to sign confirms');
  const second = await record({ kind: 'image', format: 'png', width: 30, height: 40 });
  const pdf = await record({ kind: 'pdf', format: 'pdf', width: 595, height: 842, pages: 3 });
  const video = await record({
    kind: 'video',
    format: 'mp4',
    width: 720,
    height: 1280,
    durationMs: 65_000,
  });
  const audio = await record({ kind: 'audio', format: 'm4a', durationMs: 4_000 });

  const category = await api.post(`decks/${smokeDeck.slug}/categories`, {
    data: { name: 'Media public' },
  });
  expect(category.status()).toBe(201);
  const { id: categoryId } = (await category.json()) as { id: string };
  await api.patch(`decks/${smokeDeck.slug}/categories/${categoryId}`, {
    data: { visibility: 'public' },
  });
  expect((await api.patch(`decks/${smokeDeck.slug}`, { data: { isPublic: true } })).status()).toBe(
    200,
  );

  const card = async (title: string, payload: Record<string, unknown>) => {
    const res = await api.post(`decks/${smokeDeck.slug}/items`, {
      data: { type: 'media', title, payload, categoryIds: [categoryId] },
    });
    expect(res.status(), title).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const ids = {
    gallery: await card('School play', {
      kind: 'image',
      images: [{ publicId: cover }, { publicId: second }],
    }),
    pdf: await card('Term calendar', { kind: 'pdf', publicId: pdf }),
    video: await card('Boiler reset', { kind: 'video', publicId: video }),
    audio: await card('Grandma memo', { kind: 'audio', publicId: audio }),
  };

  const page = async (id: string) => {
    const res = await anon.get(webUrl(`/p/${smokeDeck.slug}/i/${id}`), { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const scripts = (html.match(/<script\b[^>]*>/gi) ?? []).filter(
      (tag) => !tag.startsWith('<script defer src="/analytics/page.js" '),
    );
    expect(scripts).toEqual([]);
    expect(html).not.toContain('autoplay');
    return html;
  };

  const gallery = await page(ids.gallery);
  expect(gallery.indexOf(cover!)).toBeLessThan(gallery.indexOf(second!));
  expect(await page(ids.pdf)).toContain(`${pdf}.pdf"`);
  expect(await page(ids.video)).toContain('<video controls playsinline preload="none"');
  expect(await page(ids.audio)).toContain('<audio controls preload="none"');

  const ogImage = async (id: string) => {
    const res = await anon.get(webUrl(`/s/${id}`), { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    return /property="og:image" content="([^"]+)"/.exec(await res.text())?.[1] ?? '';
  };
  expect(await ogImage(ids.gallery)).toContain(`/image/upload/c_fill,w_1200,h_630,f_jpg/${cover}`);
  expect(await ogImage(ids.video)).toContain(
    `/video/upload/so_auto,c_fill,w_1200,h_630/${video}.jpg`,
  );
  expect(await ogImage(ids.pdf)).toContain(
    `/image/upload/pg_1,c_fill,g_north,w_1200,h_630,f_jpg/${pdf}`,
  );
  expect(await ogImage(ids.audio)).not.toContain('/video/upload/');
});
