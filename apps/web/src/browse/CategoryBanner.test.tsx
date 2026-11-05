import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANNER_MS,
  bannerText,
  CategoryBanner,
  categoryAnnouncement,
  useBanner,
} from './CategoryBanner';

const recipes = { slug: 'recipes', name: 'Recipes' };

describe('banner copy', () => {
  it('shows the count when known, else just the name', () => {
    expect(bannerText({ kind: 'category', entry: recipes, count: 12 })).toBe('Recipes · 12 cards');
    expect(bannerText({ kind: 'category', entry: recipes, count: null })).toBe('Recipes');
    expect(bannerText({ kind: 'end', direction: 'next' })).toBe('No next category');
    expect(bannerText({ kind: 'end', direction: 'prev' })).toBe('No previous category');
  });

  it('announces "Recipes, 12 cards"', () => {
    expect(categoryAnnouncement(recipes, 12)).toBe('Recipes, 12 cards');
    expect(categoryAnnouncement(recipes, 1)).toBe('Recipes, 1 card');
    expect(categoryAnnouncement(recipes, null)).toBe('Recipes');
  });
});

describe('useBanner', () => {
  afterEach(() => vi.useRealTimers());

  it('hides the banner 2 s after the last show', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show({ kind: 'end', direction: 'next' }));
    act(() => vi.advanceTimersByTime(BANNER_MS - 100));
    act(() => result.current.show({ kind: 'end', direction: 'next' }));
    expect(result.current.banner?.nonce).toBe(2);
    act(() => vi.advanceTimersByTime(BANNER_MS - 100));
    expect(result.current.banner).not.toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.banner).toBeNull();
  });
});

describe('CategoryBanner', () => {
  it('is hidden from assistive tech and opens the list on tap', () => {
    const onOpenList = vi.fn();
    render(
      <CategoryBanner
        banner={{ kind: 'category', entry: recipes, count: 3, nonce: 1 }}
        onOpenList={onOpenList}
      />,
    );
    const banner = screen.getByTestId('browse-banner');
    expect(banner).toHaveAttribute('aria-hidden', 'true');
    expect(banner).toHaveTextContent('Recipes · 3 cards');
    fireEvent.click(banner);
    expect(onOpenList).toHaveBeenCalledOnce();
  });

  it('does not open the list from the end banner, and renders nothing without a banner', () => {
    const onOpenList = vi.fn();
    const { rerender } = render(
      <CategoryBanner
        banner={{ kind: 'end', direction: 'prev', nonce: 1 }}
        onOpenList={onOpenList}
      />,
    );
    fireEvent.click(screen.getByTestId('browse-banner'));
    expect(onOpenList).not.toHaveBeenCalled();
    rerender(<CategoryBanner banner={null} onOpenList={onOpenList} />);
    expect(screen.queryByTestId('browse-banner')).not.toBeInTheDocument();
  });
});
