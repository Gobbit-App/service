import { describe, it, expect } from 'vitest';
import { asLinkPayload, asImagePayload, asTablePayload, asCalcPayload } from './payload-guards';

describe('payload-guards', () => {
  describe('asLinkPayload', () => {
    it('returns valid link payload with url only', () => {
      const result = asLinkPayload({ url: 'https://example.com' });
      expect(result).toEqual({ url: 'https://example.com' });
    });

    it('returns valid link payload with preview object', () => {
      const result = asLinkPayload({
        url: 'https://example.com',
        preview: {
          title: 'Example',
          description: 'A description',
          image: 'https://example.com/image.jpg',
        },
      });
      expect(result).toEqual({
        url: 'https://example.com',
        preview: {
          title: 'Example',
          description: 'A description',
          image: 'https://example.com/image.jpg',
        },
      });
    });

    it('keeps only string fields in preview', () => {
      const result = asLinkPayload({
        url: 'https://example.com',
        preview: {
          title: 'Example',
          description: 123,
          image: null,
        },
      });
      expect(result).toEqual({
        url: 'https://example.com',
        preview: { title: 'Example' },
      });
    });

    it('omits preview if no string fields', () => {
      const result = asLinkPayload({
        url: 'https://example.com',
        preview: { title: 123, description: null, image: undefined },
      });
      expect(result).toEqual({ url: 'https://example.com' });
    });

    it('returns null for null input', () => {
      expect(asLinkPayload(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(asLinkPayload(123)).toBeNull();
      expect(asLinkPayload('url')).toBeNull();
      expect(asLinkPayload([])).toBeNull();
    });

    it('returns null when url is missing', () => {
      expect(asLinkPayload({ preview: { title: 'Title' } })).toBeNull();
    });

    it('returns null when url is not a string', () => {
      expect(asLinkPayload({ url: 123 })).toBeNull();
    });
  });

  describe('asImagePayload', () => {
    it('returns valid image payload', () => {
      const result = asImagePayload({
        publicId: 'my-image',
        alt: 'An image',
      });
      expect(result).toEqual({ publicId: 'my-image', alt: 'An image' });
    });

    it('returns null for empty publicId', () => {
      expect(asImagePayload({ publicId: '', alt: 'An image' })).toBeNull();
    });

    it('returns null for missing publicId', () => {
      expect(asImagePayload({ alt: 'An image' })).toBeNull();
    });

    it('returns null for missing alt', () => {
      expect(asImagePayload({ publicId: 'my-image' })).toBeNull();
    });

    it('returns null for non-string publicId', () => {
      expect(asImagePayload({ publicId: 123, alt: 'An image' })).toBeNull();
    });

    it('returns null for non-string alt', () => {
      expect(asImagePayload({ publicId: 'my-image', alt: 123 })).toBeNull();
    });

    it('returns null for null input', () => {
      expect(asImagePayload(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(asImagePayload(123)).toBeNull();
      expect(asImagePayload('publicId')).toBeNull();
      expect(asImagePayload([])).toBeNull();
    });
  });

  describe('asTablePayload', () => {
    it('returns valid table payload', () => {
      const result = asTablePayload({
        columns: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
      });
      expect(result).toEqual({
        columns: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
      });
    });

    it('pads rows shorter than columns', () => {
      const result = asTablePayload({
        columns: ['Name', 'Age', 'City'],
        rows: [['Alice', '30'], ['Bob']],
      });
      expect(result).toEqual({
        columns: ['Name', 'Age', 'City'],
        rows: [
          ['Alice', '30', ''],
          ['Bob', '', ''],
        ],
      });
    });

    it('truncates rows longer than columns', () => {
      const result = asTablePayload({
        columns: ['Name', 'Age'],
        rows: [
          ['Alice', '30', 'NYC'],
          ['Bob', '25', 'LA'],
        ],
      });
      expect(result).toEqual({
        columns: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
      });
    });

    it('returns null for empty columns', () => {
      expect(asTablePayload({ columns: [], rows: [['Alice', '30']] })).toBeNull();
    });

    it('returns null when columns contains non-string', () => {
      expect(
        asTablePayload({
          columns: ['Name', 123],
          rows: [['Alice', '30']],
        }),
      ).toBeNull();
    });

    it('returns null when rows is not an array', () => {
      expect(
        asTablePayload({
          columns: ['Name', 'Age'],
          rows: 'not an array',
        }),
      ).toBeNull();
    });

    it('returns null when a row is not an array', () => {
      expect(
        asTablePayload({
          columns: ['Name', 'Age'],
          rows: [['Alice', '30'], 'not an array'],
        }),
      ).toBeNull();
    });

    it('returns null when a row contains non-string', () => {
      expect(
        asTablePayload({
          columns: ['Name', 'Age'],
          rows: [['Alice', 30]],
        }),
      ).toBeNull();
    });

    it('returns null for null input', () => {
      expect(asTablePayload(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(asTablePayload(123)).toBeNull();
      expect(asTablePayload('table')).toBeNull();
      expect(asTablePayload([])).toBeNull();
    });

    it('returns null for missing columns', () => {
      expect(asTablePayload({ rows: [['Alice', '30']] })).toBeNull();
    });

    it('returns null for missing rows', () => {
      expect(asTablePayload({ columns: ['Name', 'Age'] })).toBeNull();
    });
  });

  describe('asCalcPayload', () => {
    it('returns valid calc payload', () => {
      const result = asCalcPayload({
        fields: [{ key: 'x', label: 'Input' }],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
      expect(result).toEqual({
        fields: [{ key: 'x', label: 'Input' }],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
    });

    it('includes optional field properties', () => {
      const result = asCalcPayload({
        fields: [
          {
            key: 'x',
            label: 'Input',
            unit: 'km',
            default: 10,
          },
        ],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
      expect(result).toEqual({
        fields: [
          {
            key: 'x',
            label: 'Input',
            unit: 'km',
            default: 10,
          },
        ],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
    });

    it('drops extra field properties', () => {
      const result = asCalcPayload({
        fields: [
          {
            key: 'x',
            label: 'Input',
            unit: 'km',
            default: 10,
            extra: 'ignored',
            another: 123,
          },
        ],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
      expect(result).toEqual({
        fields: [
          {
            key: 'x',
            label: 'Input',
            unit: 'km',
            default: 10,
          },
        ],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
    });

    it('returns null when default is NaN', () => {
      const result = asCalcPayload({
        fields: [{ key: 'x', label: 'Input', default: NaN }],
        expression: 'x * 2',
        resultLabel: 'Result',
      });
      expect(result).toBeNull();
    });

    it('returns null for empty fields array', () => {
      expect(
        asCalcPayload({
          fields: [],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when field missing key', () => {
      expect(
        asCalcPayload({
          fields: [{ label: 'Input' }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when field key is not string', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 123, label: 'Input' }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when field missing label', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x' }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when field label is not string', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 123 }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when unit is not string', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input', unit: 123 }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when default is Infinity', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input', default: Infinity }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when default is -Infinity', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input', default: -Infinity }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when default is not a number', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input', default: '10' }],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null for missing fields', () => {
      expect(
        asCalcPayload({
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null for missing expression', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input' }],
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null for missing resultLabel', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input' }],
          expression: 'x * 2',
        }),
      ).toBeNull();
    });

    it('returns null for null input', () => {
      expect(asCalcPayload(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(asCalcPayload(123)).toBeNull();
      expect(asCalcPayload('payload')).toBeNull();
      expect(asCalcPayload([])).toBeNull();
    });

    it('returns null when fields is not array', () => {
      expect(
        asCalcPayload({
          fields: { key: 'x', label: 'Input' },
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when field is not object', () => {
      expect(
        asCalcPayload({
          fields: ['not an object'],
          expression: 'x * 2',
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when expression is not string', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input' }],
          expression: 123,
          resultLabel: 'Result',
        }),
      ).toBeNull();
    });

    it('returns null when resultLabel is not string', () => {
      expect(
        asCalcPayload({
          fields: [{ key: 'x', label: 'Input' }],
          expression: 'x * 2',
          resultLabel: 123,
        }),
      ).toBeNull();
    });
  });
});
