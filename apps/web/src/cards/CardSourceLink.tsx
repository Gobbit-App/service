import type { ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { sourceLink } from '../lib/source-link';
import { ButtonLink } from '../ui/buttons/ButtonLink';
import { asLinkPayload } from './payload-guards';

/**
 * The card's http(s) source as an external link button. A link card whose URL is its source
 * already has "Open link", so it gets none.
 */
export function CardSourceLink({ item }: { item: Item }): ReactElement | null {
  const link = sourceLink(item.sourceUrl);
  if (!link) return null;
  if (item.type === 'link') {
    const payloadUrl = asLinkPayload(item.payload)?.url ?? null;
    if (sourceLink(payloadUrl)?.href === link.href) return null;
  }
  return (
    <ButtonLink
      className="card__source"
      href={link.href}
      icon="external"
      label={`Source: ${link.host}`}
      variant="ghost"
      external
    />
  );
}
