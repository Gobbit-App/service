import type { ReactElement } from 'react';

/** FR-017: a media card whose file can't be shown (no media storage, a rejected or gone file). */
export function MediaUnavailable({ label = 'File unavailable' }: { label?: string }): ReactElement {
  return <p className="card-muted media-unavailable">{label}</p>;
}
