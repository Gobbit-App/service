import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ImagePayload } from './payload-guards';
import { cloudinaryImageUrl, cloudinarySrcSet } from './cloudinary';

/** Image loading hints (D144): Browse gives the current card priority and its measured width. */
export interface ImageLoading {
  /** The `sizes` attribute; defaults to `100vw`. */
  sizes?: string;
  /** Load now with high fetch priority instead of lazily. */
  priority?: boolean;
}

/** Renders an image card with Cloudinary image or a fallback message if unavailable. */
export function ImageCard({
  payload,
  cloudName,
  sizes = '100vw',
  priority = false,
}: {
  payload: ImagePayload;
  cloudName: string | null;
} & ImageLoading): ReactElement {
  const [hasError, setHasError] = useState(false);

  if (!cloudName || hasError) {
    return <p className="card-muted">Image unavailable</p>;
  }

  return (
    <figure className="image-card">
      <img
        className="image-card__img"
        src={cloudinaryImageUrl(cloudName, payload.publicId, 720)}
        srcSet={cloudinarySrcSet(cloudName, payload.publicId)}
        sizes={sizes}
        alt={payload.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onError={() => setHasError(true)}
      />
    </figure>
  );
}
