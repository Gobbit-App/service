import { describe, it, expect } from 'vitest';
import { OG_TEMPLATE_VERSION, ogContentHash, ogPublicId, type OgContent } from './content-hash';

describe('ogContentHash', () => {
  const baseContent: OgContent = {
    title: 'Test Title',
    excerpt: 'Test excerpt',
    categoryName: 'Tech',
    deckName: 'My Deck',
    imagePublicId: 'image-123',
  };

  it('returns 64 hex chars for valid input', () => {
    const hash = ogContentHash(baseContent);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for equal input', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash(baseContent);
    expect(hash1).toBe(hash2);
  });

  it('changes when title changes', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash({
      ...baseContent,
      title: 'Different Title',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when excerpt changes', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash({
      ...baseContent,
      excerpt: 'Different excerpt',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when categoryName changes', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash({
      ...baseContent,
      categoryName: 'Different',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when categoryName is null vs string', () => {
    const hash1 = ogContentHash({
      ...baseContent,
      categoryName: 'Tech',
    });
    const hash2 = ogContentHash({
      ...baseContent,
      categoryName: null,
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when deckName changes', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash({
      ...baseContent,
      deckName: 'Different Deck',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when imagePublicId changes', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash({
      ...baseContent,
      imagePublicId: 'different-image',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when imagePublicId is null vs string', () => {
    const hash1 = ogContentHash({
      ...baseContent,
      imagePublicId: 'image-123',
    });
    const hash2 = ogContentHash({
      ...baseContent,
      imagePublicId: null,
    });
    expect(hash1).not.toBe(hash2);
  });

  it('changes when templateVersion changes', () => {
    const hash1 = ogContentHash(baseContent, 1);
    const hash2 = ogContentHash(baseContent, 2);
    expect(hash1).not.toBe(hash2);
  });

  it('detects field-boundary issues', () => {
    const hash1 = ogContentHash({
      ...baseContent,
      title: 'ab',
      excerpt: 'c',
    });
    const hash2 = ogContentHash({
      ...baseContent,
      title: 'a',
      excerpt: 'bc',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('uses OG_TEMPLATE_VERSION by default', () => {
    const hash1 = ogContentHash(baseContent);
    const hash2 = ogContentHash(baseContent, OG_TEMPLATE_VERSION);
    expect(hash1).toBe(hash2);
  });
});

describe('ogPublicId', () => {
  it('returns correct format', () => {
    const itemId = 'item-123';
    const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const publicId = ogPublicId(itemId, hash);
    expect(publicId).toBe('og/item-123-abcdef123456');
  });

  it('takes first 12 chars of hash', () => {
    const itemId = 'test-item';
    const hash = '0123456789abcdef' + 'x'.repeat(48);
    const publicId = ogPublicId(itemId, hash);
    expect(publicId).toBe('og/test-item-0123456789ab');
  });

  it('handles different item IDs', () => {
    const hash = 'a'.repeat(64);
    const publicId1 = ogPublicId('item-1', hash);
    const publicId2 = ogPublicId('item-2', hash);
    expect(publicId1).not.toBe(publicId2);
  });
});
