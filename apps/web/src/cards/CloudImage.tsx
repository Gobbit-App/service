import { useRef, useState, type ReactElement } from 'react';
import { cloudinaryImageUrl, cloudinaryPlaceholderUrl, cloudinarySrcSet } from './cloudinary';
import { imageSizesFor, useElementWidth } from './use-element-width';

export interface CloudImageProps {
  cloudName: string;
  publicId: string;
  /** `''` for decorative uses. */
  alt: string;
  /** Intrinsic px from the payload (012); omit when unknown. */
  width?: number;
  height?: number;
  /** Load now with high fetch priority (Browse current card, D144). */
  priority?: boolean;
  /** Extra class on the wrapper. */
  className?: string;
  /** The caller swaps in its fallback copy. */
  onError?: () => void;
}

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * The one renderer of stored images (D161): `sizes` from the measured wrapper, a box reserved
 * from the payload dimensions, and a blurred placeholder until the sharp image loads.
 */
export function CloudImage({
  cloudName,
  publicId,
  alt,
  width,
  height,
  priority = false,
  className,
  onError,
}: CloudImageProps): ReactElement {
  const wrapper = useRef<HTMLSpanElement>(null);
  const measured = useElementWidth(wrapper);
  const [state, setState] = useState<LoadState>('loading');
  const known = width !== undefined && height !== undefined;
  const loading = priority ? 'eager' : 'lazy';

  const classes = [
    'cloud-image',
    known ? null : 'cloud-image--unknown',
    state === 'loaded' ? 'cloud-image--loaded' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span ref={wrapper} className={classes}>
      {state === 'loading' && (
        <img
          className="cloud-image__placeholder"
          aria-hidden="true"
          alt=""
          src={cloudinaryPlaceholderUrl(cloudName, publicId)}
          loading={loading}
          decoding="async"
        />
      )}
      <img
        className="cloud-image__img"
        alt={alt}
        src={cloudinaryImageUrl(cloudName, publicId, 720)}
        srcSet={cloudinarySrcSet(cloudName, publicId)}
        sizes={measured === null ? imageSizesFor(window.innerWidth) : `${measured}px`}
        width={known ? width : undefined}
        height={known ? height : undefined}
        loading={loading}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => {
          setState('error');
          onError?.();
        }}
      />
    </span>
  );
}
