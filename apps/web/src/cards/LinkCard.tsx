import { useState } from 'react';
import type { ReactElement } from 'react';
import type { LinkHealth } from '@gobbit/shared';
import { lockedHostOf } from '@gobbit/shared/links';
import { CloudImage } from './CloudImage';
import { LinkHealthBadge } from './LinkHealthBadge';
import type { LinkPayload } from './payload-guards';
import { Icon } from '../ui/icons/Icon';

/** Which preview image is shown: the stored copy, the page's own image, or none (D163). */
type ImageSource = 'stored' | 'remote' | 'none';

function initialSource(payload: LinkPayload, cloudName: string | null): ImageSource {
  if (payload.preview?.publicId && cloudName) return 'stored';
  return payload.preview?.image ? 'remote' : 'none';
}

/** Displays a link card with optional preview information and its link check flag (D165). */
export function LinkCard({
  payload,
  cloudName = null,
  health = null,
}: {
  payload: LinkPayload;
  cloudName?: string | null;
  health?: LinkHealth | null;
}): ReactElement {
  // A new photo or page image (e.g. in the editor preview) starts over from the stored copy.
  const imageKey = `${payload.preview?.publicId ?? ''}|${payload.preview?.image ?? ''}`;
  const [failed, setFailed] = useState<{ key: string; source: ImageSource } | null>(null);
  const source = failed?.key === imageKey ? failed.source : initialSource(payload, cloudName);
  const setSource = (next: ImageSource) => setFailed({ key: imageKey, source: next });

  const parsed = URL.canParse(payload.url) ? new URL(payload.url) : null;
  const isWebUrl = parsed?.protocol === 'https:' || parsed?.protocol === 'http:';
  const domain = isWebUrl ? parsed.hostname.replace(/^www\./, '') : null;
  // D168: social hosts are named by their label ("Instagram") instead of the domain line.
  const hostLabel = isWebUrl ? (lockedHostOf(payload.url)?.label ?? null) : null;

  const preview = payload.preview;

  return (
    <div className="link-card">
      {source === 'stored' && cloudName && preview?.publicId && (
        <CloudImage
          className="link-card__image link-card__image--stored"
          cloudName={cloudName}
          publicId={preview.publicId}
          alt=""
          width={preview.width}
          height={preview.height}
          onError={() => setSource(preview.image ? 'remote' : 'none')}
        />
      )}
      {source === 'remote' && preview?.image && (
        <img
          className="link-card__image"
          src={preview.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setSource('none')}
        />
      )}
      {health && <LinkHealthBadge health={health} />}
      {preview?.title && (
        <p className="link-card__title" dir="auto">
          {preview.title}
        </p>
      )}
      {preview?.description && (
        <p className="link-card__description" dir="auto">
          {preview.description}
        </p>
      )}
      {hostLabel ? (
        <p className="link-card__host">{hostLabel}</p>
      ) : (
        domain && <p className="link-card__domain">{domain}</p>
      )}
      {!preview?.title && <p className="link-card__url">{payload.url}</p>}
      {isWebUrl && (
        <a
          className="button button--icon link-card__open"
          href={payload.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="external" />
          <span className="button__label">Open</span>
        </a>
      )}
    </div>
  );
}
