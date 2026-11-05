import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { CycleEntry } from './category-cycle';
import { cardCountLabel } from './category-counts';
import type { PullDirection } from './use-end-pull';

/** D331: the banner peeks this long after a category change or an end pull. */
export const BANNER_MS = 2000;

export type BannerSpec =
  | { kind: 'category'; entry: CycleEntry; count: number | null }
  | { kind: 'end'; direction: PullDirection };

/** "Recipes · 12 cards", "Recipes" while the count isn't known, or the end copy. */
export function bannerText(banner: BannerSpec): string {
  if (banner.kind === 'end') {
    return banner.direction === 'next' ? 'No next category' : 'No previous category';
  }
  const { entry, count } = banner;
  return count === null ? entry.name : `${entry.name} · ${cardCountLabel(count)}`;
}

/** The live-region text for a category change: "Recipes, 12 cards" (contract §3). */
export function categoryAnnouncement(entry: CycleEntry, count: number | null): string {
  return count === null ? entry.name : `${entry.name}, ${cardCountLabel(count)}`;
}

/**
 * The banner on screen, replaced by each `show` and gone `BANNER_MS` after the last one. The
 * nonce restarts the timer (and the peek animation) when the same text shows twice.
 */
export function useBanner(): {
  banner: (BannerSpec & { nonce: number }) | null;
  show: (spec: BannerSpec) => void;
  hide: () => void;
} {
  const [banner, setBanner] = useState<(BannerSpec & { nonce: number }) | null>(null);
  const show = useCallback(
    (spec: BannerSpec) => setBanner((prev) => ({ ...spec, nonce: (prev?.nonce ?? 0) + 1 })),
    [],
  );
  const hide = useCallback(() => setBanner(null), []);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(hide, BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, hide]);
  return { banner, show, hide };
}

/**
 * D331: the peek banner under the top bar. It is `aria-hidden` (the live region announces the
 * change) and a pointer shortcut only: a tap opens the category list, whose accessible way in
 * is the category name button in the top bar.
 */
export function CategoryBanner({
  banner,
  onOpenList,
}: {
  banner: (BannerSpec & { nonce: number }) | null;
  onOpenList: () => void;
}): ReactElement | null {
  if (!banner) return null;
  return (
    <div
      key={banner.nonce}
      className={`browse-banner browse-banner--${banner.kind}`}
      aria-hidden="true"
      data-testid="browse-banner"
      onClick={banner.kind === 'category' ? onOpenList : undefined}
      dir="auto"
    >
      {bannerText(banner)}
    </div>
  );
}
