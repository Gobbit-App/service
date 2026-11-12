import { useState } from 'react';
import type { ReactElement } from 'react';
import type { CardCover } from '@gobbit/shared/card-cover';
import { CloudImage } from './CloudImage';
import type { ImageLoading } from './ImageCard';
import { useCloudName } from './use-cloud-name';

/** D391: the decorative cover bar on top of a card; renders nothing when absent or broken. */
export function CoverBar({
  cover,
  image,
}: {
  cover: CardCover | null | undefined;
  image?: ImageLoading;
}): ReactElement | null {
  const cloudName = useCloudName();
  const [failedId, setFailedId] = useState<string | null>(null);

  if (!cover || !cloudName || failedId === cover.publicId) return null;

  return (
    <CloudImage
      className="card__cover"
      cloudName={cloudName}
      publicId={cover.publicId}
      alt=""
      width={cover.width}
      height={cover.height}
      priority={image?.priority}
      onError={() => setFailedId(cover.publicId)}
    />
  );
}
