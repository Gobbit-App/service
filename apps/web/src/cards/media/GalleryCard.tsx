import { useRef, useState, type ReactElement } from 'react';
import { imageAlt } from '@gobbit/shared/image-alt';
import { MEDIA_DELIVERY } from '@gobbit/shared/media-constants';
import { ImageCard, type ImageLoading } from '../ImageCard';
import { CloudImage } from '../CloudImage';
import { mediaDeliveryUrlFor } from '../cloudinary';
import type { MediaImagesPayload } from '../payload-guards';
import { Button } from '../../ui/buttons/Button';
import { useMediaModule } from './load-media-module';
import { MediaUnavailable } from './MediaUnavailable';
import { useIntentPrefetch } from './use-intent-prefetch';

export interface GalleryCardProps extends ImageLoading {
  title: string;
  payload: MediaImagesPayload;
  cloudName: string | null;
}

/**
 * D398: one photo renders exactly as a photo card always has. Two to eight show the cover in its
 * own shape with "N photos"; tapping opens the full-screen viewer (D399). The card never scrolls
 * sideways itself, so Browse's swipe always moves between cards (ADR-065).
 */
export function GalleryCard({
  title,
  payload,
  cloudName,
  priority = false,
}: GalleryCardProps): ReactElement {
  const root = useRef<HTMLButtonElement>(null);
  const intent = useIntentPrefetch('viewer', root);
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  const { state, retry } = useMediaModule('viewer', open !== null);
  const [cover, ...rest] = payload.images;

  if (!cover) return <MediaUnavailable />;
  if (rest.length === 0) {
    return (
      <ImageCard
        key={cover.publicId}
        payload={cover}
        alt={imageAlt({ alt: cover.alt, title, titleAdjacent: true })}
        cloudName={cloudName}
        priority={priority}
      />
    );
  }
  if (!cloudName || broken) return <MediaUnavailable label="Image unavailable" />;

  const total = payload.images.length;
  const Viewer = state.status === 'ready' ? state.module.PageViewer : null;

  return (
    <figure className="image-card gallery-card">
      <button
        ref={root}
        type="button"
        className="gallery-card__open"
        aria-label={`Open ${total} photos`}
        onClick={() => setOpen(0)}
        {...intent}
      >
        <CloudImage
          cloudName={cloudName}
          publicId={cover.publicId}
          alt={imageAlt({ alt: cover.alt, title, titleAdjacent: true })}
          width={cover.width}
          height={cover.height}
          priority={priority}
          onError={() => setBroken(true)}
        />
        <span className="gallery-card__count" aria-hidden="true">
          {total} photos
        </span>
      </button>
      {state.status === 'failed' && open !== null && (
        <p className="card-muted" role="status">
          Couldn&apos;t open the photos.{' '}
          <Button icon="refresh" label="Retry" variant="ghost" onClick={retry} />
        </p>
      )}
      {open !== null && Viewer && (
        <Viewer
          title={title}
          axis="x"
          counter={(k, n) => `${k} of ${n}`}
          startIndex={open}
          pages={payload.images.map((img, i) => ({
            key: `${i}-${img.publicId}`,
            src: (w: number) =>
              mediaDeliveryUrlFor(cloudName, MEDIA_DELIVERY.image(w), img.publicId),
            width: img.width,
            height: img.height,
            alt: img.alt?.trim() || `${title}, photo ${i + 1} of ${total}`,
            ...(img.alt?.trim() ? { description: img.alt.trim() } : {}),
          }))}
          onClose={() => setOpen(null)}
        />
      )}
    </figure>
  );
}
