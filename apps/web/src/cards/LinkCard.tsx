import { useState } from 'react';
import type { ReactElement } from 'react';
import type { LinkPayload } from './payload-guards';

/** Displays a link card with optional preview information. */
export function LinkCard({ payload }: { payload: LinkPayload }): ReactElement {
  const [imageFailed, setImageFailed] = useState(false);

  const parsed = URL.canParse(payload.url) ? new URL(payload.url) : null;
  const isWebUrl = parsed?.protocol === 'https:' || parsed?.protocol === 'http:';
  const domain = isWebUrl ? parsed.hostname.replace(/^www\./, '') : null;

  const hasPreview = payload.preview;
  const hasImage = hasPreview?.image && !imageFailed;

  return (
    <div className="link-card">
      {hasImage && (
        <img
          className="link-card__image"
          src={payload.preview!.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
      {hasPreview?.title && (
        <p className="link-card__title" dir="auto">
          {payload.preview!.title}
        </p>
      )}
      {hasPreview?.description && (
        <p className="link-card__description" dir="auto">
          {payload.preview!.description}
        </p>
      )}
      {domain && <p className="link-card__domain">{domain}</p>}
      {!hasPreview?.title && <p className="link-card__url">{payload.url}</p>}
      {isWebUrl && (
        <a
          className="button link-card__open"
          href={payload.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
      )}
    </div>
  );
}
