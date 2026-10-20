import { useSyncExternalStore } from 'react';

/** The card column's widest content box: `.browse-page__content` max width minus padding. */
const COLUMN_MAX_PX = 640;
const COLUMN_PADDING_PX = 32;

/** Contract §5: the image `sizes` for a viewport width, e.g. `328px` on a 360 px phone. */
export function imageSizesFor(viewportWidth: number): string {
  const width = Math.min(viewportWidth, COLUMN_MAX_PX) - COLUMN_PADDING_PX;
  return `${Math.max(Math.round(width), 1)}px`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** D144: images get the measured width, so the srcset picks the smallest bucket that fits. */
export function useImageSizes(): string {
  const width = useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => COLUMN_MAX_PX,
  );
  return imageSizesFor(width);
}
