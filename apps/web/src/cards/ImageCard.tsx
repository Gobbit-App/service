import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ImagePayload } from './payload-guards';
import { CloudImage } from './CloudImage';

/** Image loading hints (D144): Browse gives the current card priority. */
export interface ImageLoading {
  /** Load now with high fetch priority instead of lazily. */
  priority?: boolean;
}

/**
 * Renders an image card with Cloudinary image or a fallback message if unavailable. `alt` is
 * decided by the caller with `imageAlt` (D206): it knows whether the title is shown next to it.
 */
export function ImageCard({
  payload,
  alt,
  cloudName,
  priority = false,
}: {
  payload: ImagePayload;
  alt: string;
  cloudName: string | null;
} & ImageLoading): ReactElement {
  const [hasError, setHasError] = useState(false);

  if (!cloudName || hasError) {
    return <p className="card-muted">Image unavailable</p>;
  }

  return (
    <figure className="image-card">
      <CloudImage
        cloudName={cloudName}
        publicId={payload.publicId}
        alt={alt}
        width={payload.width}
        height={payload.height}
        priority={priority}
        onError={() => setHasError(true)}
      />
    </figure>
  );
}
