import type { Item } from '@pb/shared';
import { useLinkCheck, type LinkCheckAction } from '../api/link-checks';
import { lifecycleErrorMessage } from '../api/problem-messages';
import { LINK_HEALTH_COPY } from '../cards/LinkHealthBadge';
import { showToast } from '../ui/toast-store';

export const LINK_CHECK_LABEL: Record<LinkCheckAction, string> = {
  check: 'Check again',
  dismiss: 'Dismiss',
};

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

/** D165: Check again / Dismiss for a flagged link card (the caller gates on `linkCheckActions`). */
export function useLinkCheckRun(
  item: Item,
  deckSlug: string,
): { run: (action: LinkCheckAction) => void; isPending: boolean } {
  const mutation = useLinkCheck(deckSlug);

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

  return { run, isPending: mutation.isPending };
}
