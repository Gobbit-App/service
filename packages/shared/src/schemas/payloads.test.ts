import { describe, it, expect } from 'vitest';
import { payloadWithinBudget, payloadSchemaFor, payloadSchemas } from './payloads';
import { PAYLOAD_MAX_BYTES } from '../limits';
import { MEDIA_ALT_MAX, MEDIA_GALLERY_MAX, normalizeLegacyMediaPayload } from '../media/constants';

describe('payloads', () => {
  describe('payloadWithinBudget', () => {
    it('returns true for payload exactly at PAYLOAD_MAX_BYTES', () => {
      const basePayload = { t: '' };
      const baseStringified = JSON.stringify(basePayload);
      const baseBytes = new TextEncoder().encode(baseStringified).length;
      const availableBytes = PAYLOAD_MAX_BYTES - baseBytes;
      const payload = { t: 'a'.repeat(availableBytes) };

      const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
      expect(bytes).toBe(PAYLOAD_MAX_BYTES);
      expect(payloadWithinBudget(payload)).toBe(true);
    });

    it('returns false for payload exceeding PAYLOAD_MAX_BYTES by 1 byte', () => {
      const basePayload = { t: '' };
      const baseStringified = JSON.stringify(basePayload);
      const baseBytes = new TextEncoder().encode(baseStringified).length;
      const availableBytes = PAYLOAD_MAX_BYTES - baseBytes;
      const payload = { t: 'a'.repeat(availableBytes + 1) };

      expect(payloadWithinBudget(payload)).toBe(false);
    });

    it('returns false when Greek text has char count < 8192 but byte count > 8192', () => {
      const greekCount = 4100;
      const payload = { t: 'γ'.repeat(greekCount) };

      const stringified = JSON.stringify(payload);
      const bytes = new TextEncoder().encode(stringified).length;

      expect(greekCount).toBeLessThan(8192);
      expect(bytes).toBeGreaterThan(PAYLOAD_MAX_BYTES);
      expect(payloadWithinBudget(payload)).toBe(false);
    });
  });

  describe('text payload', () => {
    it('rejects oversized payload', () => {
      const schema = payloadSchemaFor('text');

      const basePayload = { t: '' };
      const baseStringified = JSON.stringify(basePayload);
      const baseBytes = new TextEncoder().encode(baseStringified).length;
      const availableBytes = PAYLOAD_MAX_BYTES - baseBytes;
      const oversizedPayload = { t: 'a'.repeat(availableBytes + 1) };

      const result = schema.safeParse(oversizedPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('link payload', () => {
    it('accepts valid link', () => {
      const schema = payloadSchemaFor('link');

      const validPayload = {
        url: 'https://example.com',
      };
      expect(schema.safeParse(validPayload).success).toBe(true);
    });

    it('accepts link with preview', () => {
      const schema = payloadSchemaFor('link');

      const payloadWithPreview = {
        url: 'https://example.com',
        preview: {
          title: 'Example',
          description: 'A test site',
          image: 'https://example.com/image.png',
        },
      };
      expect(schema.safeParse(payloadWithPreview).success).toBe(true);
    });

    it('rejects invalid URL', () => {
      const schema = payloadSchemaFor('link');

      const result = schema.safeParse({
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('rejects javascript: URL', () => {
      const schema = payloadSchemaFor('link');

      const result = schema.safeParse({
        url: 'javascript:alert(1)',
      });
      expect(result.success).toBe(false);
    });

    it('D163: old payloads without the snapshot fields still parse', () => {
      const schema = payloadSchemaFor('link');
      const old = {
        url: 'https://example.com',
        preview: { title: 'T', image: 'https://e.com/a.jpg' },
      };
      expect(schema.parse(old)).toEqual(old);
    });

    it('D163: accepts the server-owned snapshot fields within the dimension bounds', () => {
      const schema = payloadSchemaFor('link');
      const preview = { publicId: 'gobbit/links/d/a', width: 1200, height: 630 };
      expect(schema.safeParse({ url: 'https://example.com', preview }).success).toBe(true);
      for (const bad of [{ width: 0 }, { height: -1 }, { width: 1.5 }, { publicId: '' }]) {
        expect(
          schema.safeParse({ url: 'https://example.com', preview: { ...preview, ...bad } }).success,
        ).toBe(false);
      }
    });

    it('D350: accepts the server-owned image markers and rejects bad values', () => {
      const schema = payloadSchemaFor('link');
      const preview = { title: 'T', imageLookup: 1, imageRemoved: true };
      expect(schema.safeParse({ url: 'https://example.com', preview }).success).toBe(true);
      for (const bad of [{ imageLookup: 0 }, { imageLookup: 1.5 }, { imageRemoved: false }]) {
        expect(
          schema.safeParse({ url: 'https://example.com', preview: { ...preview, ...bad } }).success,
        ).toBe(false);
      }
    });

    it('rejects unknown key (strict)', () => {
      const schema = payloadSchemaFor('link');

      const result = schema.safeParse({
        url: 'https://example.com',
        unknownKey: 'value',
      } as any);
      expect(result.success).toBe(false);
    });
  });

  describe('media payload (D386, D398)', () => {
    const schema = payloadSchemaFor('media');
    const gallery = (...images: Record<string, unknown>[]) => ({ kind: 'image', images });

    it('accepts a missing or empty alt (D206)', () => {
      expect(schema.safeParse(gallery({ publicId: 'abc123' })).success).toBe(true);
      expect(schema.safeParse(gallery({ publicId: 'abc123', alt: '' })).success).toBe(true);
      expect(schema.safeParse(gallery({ publicId: 'abc123', alt: 5 })).success).toBe(false);
    });

    it('accepts optional dimensions within 1..20000 (D160)', () => {
      const base = { publicId: 'abc123', alt: 'A' };
      expect(schema.safeParse(gallery({ ...base, width: 3024, height: 4032 })).success).toBe(true);
      expect(schema.safeParse(gallery({ ...base, width: 1, height: 20000 })).success).toBe(true);
      expect(schema.safeParse(gallery({ ...base, width: 0 })).success).toBe(false);
      expect(schema.safeParse(gallery({ ...base, height: 20001 })).success).toBe(false);
      expect(schema.safeParse(gallery({ ...base, width: 1.5 })).success).toBe(false);
    });

    it('holds 1 to 8 photos with no repeats', () => {
      const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ publicId: `p${i}` }));
      expect(schema.safeParse(gallery()).success).toBe(false);
      expect(schema.safeParse(gallery(...photos(MEDIA_GALLERY_MAX))).success).toBe(true);
      expect(schema.safeParse(gallery(...photos(MEDIA_GALLERY_MAX + 1))).success).toBe(false);
      const repeated = schema.safeParse(gallery({ publicId: 'a' }, { publicId: 'a' }));
      expect(repeated.success).toBe(false);
      expect(repeated.error?.issues[0]?.path).toEqual(['images', 1, 'publicId']);
    });

    it('caps each description at 200 code points', () => {
      const alt = '😀'.repeat(MEDIA_ALT_MAX);
      expect(schema.safeParse(gallery({ publicId: 'a', alt })).success).toBe(true);
      expect(schema.safeParse(gallery({ publicId: 'a', alt: alt + 'x' })).success).toBe(false);
    });

    it('fits a full gallery of maximal descriptions in the payload budget', () => {
      const images = Array.from({ length: MEDIA_GALLERY_MAX }, (_, i) => ({
        publicId: `gobbit/items/00000000-0000-0000-0000-000000000000/${'x'.repeat(20)}${i}`,
        alt: '😀'.repeat(MEDIA_ALT_MAX),
        width: 20000,
        height: 20000,
      }));
      expect(schema.safeParse(gallery(...images)).success).toBe(true);
    });

    it('takes one file for pdf, audio and video', () => {
      for (const kind of ['pdf', 'audio', 'video']) {
        expect(schema.safeParse({ kind, publicId: 'f', alt: 'x', durationMs: 1200 }).success).toBe(
          true,
        );
        expect(schema.safeParse({ kind, images: [{ publicId: 'f' }] }).success).toBe(false);
      }
      expect(schema.safeParse({ kind: 'pdf', publicId: 'f', pages: 0 }).success).toBe(false);
    });

    it('requires a known kind and stays strict', () => {
      expect(schema.safeParse({ publicId: 'abc123' }).success).toBe(false);
      expect(schema.safeParse({ kind: 'zip', publicId: 'abc123' }).success).toBe(false);
      expect(schema.safeParse({ ...gallery({ publicId: 'a' }), format: 'jpg' }).success).toBe(
        false,
      );
    });
  });

  describe('normalizeLegacyMediaPayload (D387)', () => {
    it('turns a flat image payload into a one-photo gallery', () => {
      expect(normalizeLegacyMediaPayload({ publicId: 'a', alt: 'x', width: 3, height: 4 })).toEqual(
        { kind: 'image', images: [{ publicId: 'a', alt: 'x', width: 3, height: 4 }] },
      );
      expect(normalizeLegacyMediaPayload({ publicId: 'a', alt: undefined })).toEqual({
        kind: 'image',
        images: [{ publicId: 'a' }],
      });
    });

    it('leaves new payloads and other values alone', () => {
      const current = { kind: 'pdf', publicId: 'a' };
      expect(normalizeLegacyMediaPayload(current)).toBe(current);
      expect(normalizeLegacyMediaPayload(null)).toBe(null);
      expect(normalizeLegacyMediaPayload({ url: 'https://x' })).toEqual({ url: 'https://x' });
    });
  });

  describe('table payload', () => {
    it('accepts 12 rows', () => {
      const schema = payloadSchemaFor('table');

      const payload = {
        columns: ['Col1', 'Col2'],
        rows: Array(12).fill(['Cell1', 'Cell2']),
      };
      expect(schema.safeParse(payload).success).toBe(true);
    });

    it('rejects 13 rows', () => {
      const schema = payloadSchemaFor('table');

      const payload = {
        columns: ['Col1', 'Col2'],
        rows: Array(13).fill(['Cell1', 'Cell2']),
      };
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects ragged rows with issue path [rows, 1]', () => {
      const schema = payloadSchemaFor('table');

      const payload = {
        columns: ['Col1', 'Col2'],
        rows: [['Cell1', 'Cell2'], ['Cell1']],
      };
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i: { path: PropertyKey[] }) => i.path[0] === 'rows' && i.path[1] === 1,
        );
        expect(issue).toBeDefined();
      }
    });

    it('rejects 7 columns', () => {
      const schema = payloadSchemaFor('table');

      const payload = {
        columns: Array(7).fill('Col'),
        rows: [Array(7).fill('Cell')],
      };
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('calc payload', () => {
    it('accepts valid calc expression', () => {
      const schema = payloadSchemaFor('calc');

      const payload = {
        fields: [
          { key: 'price', label: 'Price' },
          { key: 'qty', label: 'Qty' },
        ],
        expression: 'price * qty',
        resultLabel: 'Total',
      };
      expect(schema.safeParse(payload).success).toBe(true);
    });

    it('rejects expression using unknown field with issue path [expression]', () => {
      const schema = payloadSchemaFor('calc');

      const payload = {
        fields: [
          { key: 'price', label: 'Price' },
          { key: 'qty', label: 'Qty' },
        ],
        expression: 'price * tax',
        resultLabel: 'Total',
      };
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i: { path: PropertyKey[] }) => i.path[0] === 'expression',
        );
        expect(issue).toBeDefined();
      }
    });

    it('rejects 7 fields', () => {
      const schema = payloadSchemaFor('calc');

      const payload = {
        fields: Array.from({ length: 7 }, (_, i) => ({
          key: `field${i}`,
          label: `Field ${i}`,
        })),
        expression: 'field0',
        resultLabel: 'Result',
      };
      const result = schema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('type mismatch', () => {
    it('rejects table payload parsed with link schema', () => {
      const linkSchema = payloadSchemas.link;

      const tablePayload = {
        columns: ['Col1', 'Col2'],
        rows: [['Cell1', 'Cell2']],
      };
      const result = linkSchema.safeParse(tablePayload);
      expect(result.success).toBe(false);
    });
  });
});
