import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, type IngestRaw } from '@gobbit/shared';
import { buildMediaProposal } from './media-proposal';

const pdf = {
  publicId: 'gobbit/ingest/d1/upload-1',
  kind: 'pdf' as const,
  bytes: 100,
  mime: 'application/pdf',
  width: 595,
  height: 842,
  pages: 3,
  fileName: 'term_calendar.pdf',
};
const raw = (over: Partial<IngestRaw> = {}): IngestRaw => ({ images: [], file: pdf, ...over });

describe('buildMediaProposal (D395)', () => {
  it('takes the share title, keeps the text as the caption and the facts from the upload', () => {
    const out = buildMediaProposal(raw({ title: 'Term calendar', text: 'For the fridge' }), 'pwa');
    expect(out?.titleSource).toBe('title');
    expect(out?.body).toBe('kept');
    expect(out?.item).toMatchObject({
      type: 'media',
      title: 'Term calendar',
      body: 'For the fridge',
      status: 'proposed',
      payload: {
        kind: 'pdf',
        publicId: pdf.publicId,
        pages: 3,
        width: 595,
        height: 842,
        fileName: 'term_calendar.pdf',
      },
    });
  });

  it("calls an email's title its subject", () => {
    expect(buildMediaProposal(raw({ title: 'Fwd: term' }), 'email')?.titleSource).toBe('subject');
  });

  it("uses the text's first line as the title and the rest as the caption", () => {
    const out = buildMediaProposal(raw({ text: 'Term calendar\nPrint it\nThanks' }), 'paste');
    expect(out?.item).toMatchObject({ title: 'Term calendar', body: 'Print it\nThanks' });
    expect(out?.titleSource).toBe('text');
  });

  it('falls back to the file name, then the kind', () => {
    expect(buildMediaProposal(raw(), 'pwa')?.item.title).toBe('term calendar');
    const nameless = buildMediaProposal(raw({ file: { ...pdf, fileName: undefined } }), 'pwa');
    expect(nameless?.item.title).toBe('Shared PDF');
    expect(nameless?.titleSource).toBe('kind');
  });

  it('drops a caption over the body limit instead of cutting it', () => {
    const long = 'x'.repeat(CARD_BODY_MAX + 1);
    const out = buildMediaProposal(raw({ title: 'T', text: long }), 'pwa');
    expect(out?.item.body).toBe('');
    expect(out?.body).toBe('dropped_too_long');
  });

  it('keeps an http(s) shared link as the source and nothing for a share without a file', () => {
    expect(
      buildMediaProposal(raw({ title: 'T', url: 'https://school.example/cal' }), 'pwa')?.item
        .sourceUrl,
    ).toBe('https://school.example/cal');
    expect(buildMediaProposal({ images: [] }, 'pwa')).toBeNull();
  });
});
