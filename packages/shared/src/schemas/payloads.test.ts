import { describe, it, expect } from 'vitest';
import { payloadWithinBudget, payloadSchemaFor, payloadSchemas } from './payloads';
import { PAYLOAD_MAX_BYTES } from '../limits';

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

    it('rejects unknown key (strict)', () => {
      const schema = payloadSchemaFor('link');

      const result = schema.safeParse({
        url: 'https://example.com',
        unknownKey: 'value',
      } as any);
      expect(result.success).toBe(false);
    });
  });

  describe('image payload', () => {
    it('rejects missing alt', () => {
      const schema = payloadSchemaFor('image');

      const result = schema.safeParse({
        publicId: 'abc123',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid image', () => {
      const schema = payloadSchemaFor('image');

      const validPayload = {
        publicId: 'abc123',
        alt: 'A beautiful image',
      };
      expect(schema.safeParse(validPayload).success).toBe(true);
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
