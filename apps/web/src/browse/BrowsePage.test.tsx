import { describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { BrowsePage } from './BrowsePage';

vi.mock('../cards/use-cloud-name', () => ({ useCloudName: () => 'demo' }));

const item = makeItem({
  id: 'i1',
  title: 'Pizza place',
  cover: { publicId: 'gobbit/items/d/cover', width: 1200, height: 300 },
});

function coverLoading(current: boolean): string | null {
  const { container } = renderWithClient(
    <BrowsePage item={item} deckSlug="family" categories={[]} current={current} mounted />,
  );
  return container.querySelector('.card__cover .cloud-image__img')?.getAttribute('loading') ?? null;
}

describe('BrowsePage cover bar (D391)', () => {
  it('loads the current card cover eagerly', () => {
    expect(coverLoading(true)).toBe('eager');
  });

  it('loads a neighbour card cover lazily', () => {
    expect(coverLoading(false)).toBe('lazy');
  });
});
