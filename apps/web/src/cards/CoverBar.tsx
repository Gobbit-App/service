import { useState, type ReactElement } from 'react';
import type { CardCover } from '@gobbit/shared/card-cover';
import { CloudImage } from './CloudImage';

/** D411: the card cover, a 16:9 bar sharing the link snapshot's CSS; gone if the image fails. */
export function CoverBar({
  cover,
  cloudName,
  loading = 'lazy',
}: {
  cover: CardCover | null | undefined;
  cloudName: string | null | undefined;
  loading?: 'lazy' | 'eager';
}): ReactElement | null {
  const [failed, setFailed] = useState<string | null>(null);
  if (!cover || !cloudName || failed === cover.publicId) return null;
  return (
    <CloudImage
      className="card__cover link-card__image--stored"
      cloudName={cloudName}
      publicId={cover.publicId}
      alt=""
      width={cover.width}
      height={cover.height}
      priority={loading === 'eager'}
      onError={() => setFailed(cover.publicId)}
    />
  );
}
