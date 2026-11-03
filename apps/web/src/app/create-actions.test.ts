import { describe, expect, it } from 'vitest';
import { createActions } from './create-actions';

const labels = (role: Parameters<typeof createActions>[0]['role'], slug = 'family') =>
  createActions({ slug, role }).map((a) => a.label);

describe('createActions (D275)', () => {
  it('gives owners and maintainers all four, in order', () => {
    expect(labels('owner')).toEqual(['New card', 'Paste or share', 'Import', 'Shares']);
    expect(labels('maintainer')).toEqual(['New card', 'Paste or share', 'Import', 'Shares']);
  });

  it('gives editors everything but Import', () => {
    expect(labels('editor')).toEqual(['New card', 'Paste or share', 'Shares']);
  });

  it('gives readers nothing', () => {
    expect(labels('reader')).toEqual([]);
  });

  it('targets the same routes as the old links', () => {
    expect(createActions({ slug: 'a b', role: 'owner' }).map((a) => a.href)).toEqual([
      '/d/a%20b/new',
      '/share?deck=a%20b',
      '/d/a%20b/import',
      '/d/a%20b/shares',
    ]);
  });

  it('keeps the personal deck rules (owner)', () => {
    expect(labels('owner', 'me')).toContain('New card');
  });
});
