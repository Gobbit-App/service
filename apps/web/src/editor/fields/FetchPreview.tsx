import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { LinkPreview as FetchedPreview } from '@pb/shared';
import { useOnline } from '../../api/offline';
import { useLinkPreview } from '../use-link-preview';
import { isHttpUrl } from '../validate';
import type { LinkPreview, LinkPreviewSlotContext } from './LinkFields';
import { Button } from '../../ui/buttons/Button';

export const NO_PREVIEW = 'No preview available';

const filled = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

/**
 * Text the member already wrote wins over the fetched text, so a refetch never undoes an edit;
 * a fetched image replaces the old one. Unknown keys are kept.
 */
export function mergePreview(current: LinkPreview, fetched: FetchedPreview): LinkPreview {
  const next: LinkPreview = { ...current };
  if (!filled(current.title) && fetched.title) next.title = fetched.title;
  if (!filled(current.description) && fetched.description) {
    next.description = fetched.description;
  }
  if (fetched.image) next.image = fetched.image;
  return next;
}

type Outcome = 'filled' | 'none' | null;

/** D134: "Fetch preview" for a link card. Any failure reads "No preview available"; Save stays on. */
export function FetchPreview({
  deckId,
  disabled,
  ...ctx
}: LinkPreviewSlotContext & { deckId: string; disabled: boolean }): ReactElement {
  const online = useOnline();
  const lookup = useLinkPreview(deckId);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // The result lands after the click; apply it to the draft as it is then, not as it was.
  const latest = useRef(ctx);
  useEffect(() => {
    latest.current = ctx;
  });

  const fetchPreview = () => {
    setOutcome(null);
    lookup.mutate(ctx.url, {
      onSuccess: (fetched) => {
        if (!fetched) {
          setOutcome('none');
          return;
        }
        const now = latest.current;
        now.setPreview(mergePreview(now.preview, fetched));
        if (fetched.title) now.setTitleIfEmpty(fetched.title);
        setOutcome('filled');
      },
      onError: () => setOutcome('none'),
    });
  };

  const canFetch = online && !disabled && !lookup.isPending && isHttpUrl(ctx.url);

  return (
    <div className="fetch-preview">
      <Button
        icon="link"
        label={lookup.isPending ? 'Fetching preview…' : 'Fetch preview'}
        variant="ghost"
        onClick={fetchPreview}
        disabled={!canFetch}
        aria-busy={lookup.isPending || undefined}
      />
      <p className="muted fetch-preview__status" role="status">
        {!online
          ? 'Fetching a preview needs a connection.'
          : outcome === 'none'
            ? NO_PREVIEW
            : outcome === 'filled'
              ? 'Preview filled in. You can edit it below.'
              : ''}
      </p>
    </div>
  );
}
