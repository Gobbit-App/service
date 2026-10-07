import { describe, it, expect } from 'vitest';
import { parseCloudinaryUrl, cloudNameFrom, cloudinaryDeliveryUrl } from './cloudinary-url';

describe('cloudinary-url', () => {
  describe('parseCloudinaryUrl', () => {
    it('parses valid URL', () => {
      const creds = parseCloudinaryUrl('cloudinary://key123:shh-fake@demo');
      expect(creds).toEqual({
        cloudName: 'demo',
        apiKey: 'key123',
        apiSecret: 'shh-fake',
      });
    });

    it('decodes URL-encoded key and secret', () => {
      const creds = parseCloudinaryUrl('cloudinary://key%40123:shh%2Bfake@demo');
      expect(creds).toEqual({
        cloudName: 'demo',
        apiKey: 'key@123',
        apiSecret: 'shh+fake',
      });
    });

    it('throws on wrong protocol', () => {
      expect(() => {
        parseCloudinaryUrl('https://key123:shh-fake@demo');
      }).toThrow('Invalid CLOUDINARY_URL');
    });

    it('throws on missing secret', () => {
      expect(() => {
        parseCloudinaryUrl('cloudinary://key123@demo');
      }).toThrow('Invalid CLOUDINARY_URL');
    });

    it('throws on missing key', () => {
      expect(() => {
        parseCloudinaryUrl('cloudinary://:shh-fake@demo');
      }).toThrow('Invalid CLOUDINARY_URL');
    });

    it('throws on missing cloud name', () => {
      expect(() => {
        parseCloudinaryUrl('cloudinary://key123:shh-fake@');
      }).toThrow('Invalid CLOUDINARY_URL');
    });

    it('thrown message does not contain the secret', () => {
      try {
        parseCloudinaryUrl('cloudinary://key123:very-secret@');
        expect.fail('should throw');
      } catch (e) {
        expect((e as Error).message).not.toContain('very-secret');
      }
    });
  });

  describe('cloudNameFrom', () => {
    it('returns null when undefined', () => {
      expect(cloudNameFrom(undefined)).toBe(null);
    });

    it('returns null when empty string', () => {
      expect(cloudNameFrom('')).toBe(null);
    });

    it('returns null on invalid URL', () => {
      expect(cloudNameFrom('nonsense')).toBe(null);
    });

    it('returns cloud name for valid URL', () => {
      expect(cloudNameFrom('cloudinary://key123:shh-fake@demo')).toBe('demo');
    });
  });

  describe('cloudinaryDeliveryUrl', () => {
    it('builds URL with transformation', () => {
      const url = cloudinaryDeliveryUrl('demo', 'og/abc-123', 'c_fill,w_1200,h_630,f_jpg');
      expect(url).toBe(
        'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_630,f_jpg/og/abc-123',
      );
    });

    it('encodes public ID segments with space', () => {
      const url = cloudinaryDeliveryUrl('demo', 'folder/my image.jpg', 'c_fill');
      expect(url).toBe('https://res.cloudinary.com/demo/image/upload/c_fill/folder/my%20image.jpg');
    });

    it('omits transformation segment when empty', () => {
      const url = cloudinaryDeliveryUrl('demo', 'og/abc-123', '');
      expect(url).toBe('https://res.cloudinary.com/demo/image/upload/og/abc-123');
    });
  });
});
