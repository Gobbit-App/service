import type { ReactElement } from 'react';
import type { Item } from '@pb/shared';
import { useLinkCheck, type LinkCheckAction } from '../api/link-checks';
import { lifecycleErrorMessage } from '../api/problem-messages';
import { LINK_HEALTH_COPY } from '../cards/LinkHealthBadge';
import { showToast } from '../ui/toast-store';

const LABEL: Record<LinkCheckAction, string> = { check: 'Check again', dismiss: 'Dismiss' };

const FAILED: Record<LinkCheckAction, string> = {
  check: "Couldn't check the link.",
  dismiss: "Couldn't dismiss the note.",
};

/** The toast after a check: the new flag, or that the link looks fine now. */
export function checkedMessage(item: Item): string {
  return item.linkHealth
    ? `Still flagged: ${LINK_HEALTH_COPY[item.linkHealth.status]}.`
    : 'Link looks fine';
}

/** D165: Check again and Dismiss for a flagged link card (the caller gates on `linkCheckActions`). */
export function LinkCheckButtons({
  item,
  deckSlug,
  actions,
  disabled,
}: {
  item: Item;
  deckSlug: string;
  actions: readonly LinkCheckAction[];
  disabled: boolean;
}): ReactElement | null {
  const mutation = useLinkCheck(deckSlug);
  if (actions.length === 0) return null;

  function run(action: LinkCheckAction): void {
    mutation
      .mutateAsync({ item, action })
      .then((next) =>
        showToast({ message: action === 'check' ? checkedMessage(next) : 'Note dismissed' }),
      )
      .catch((error: unknown) =>
        showToast({ message: lifecycleErrorMessage(error, FAILED[action]) }),
      );
  }

  return (
    <>
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className="button button--ghost"
          disabled={disabled || mutation.isPending}
          onClick={() => run(action)}
        >
          {LABEL[action]}
        </button>
      ))}
    </>
  );
}
