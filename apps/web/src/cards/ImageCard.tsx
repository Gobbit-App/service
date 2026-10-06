import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ImagePayload } from './payload-guards';
import { cloudinaryImageUrl, cloudinarySrcSet } from './cloudinary';

/** Renders an image card with Cloudinary image or a fallback message if unavailable. */
export function ImageCard({
  payload,
  cloudName,
}: {
  payload: ImagePayload;
  cloudName: string | null;
}): ReactElement {
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
        sizes="100vw"
        alt={payload.alt}
        loading="lazy"
        decoding="async"
        onError={() => setHasError(true)}
      />
    </figure>
  );
}
