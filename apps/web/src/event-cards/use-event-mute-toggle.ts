import type { Item } from '@gobbit/shared';
import { canMuteEvent, useEventMute } from '../api/event-mute';
import { lifecycleErrorMessage } from '../api/problem-messages';
import type { IconName } from '../ui/icons/Icon';
import { showToast } from '../ui/toast-store';

export const MUTE_LABEL = 'Mute notifications';
export const UNMUTE_LABEL = 'Unmute notifications';

export interface EventMuteToggle {
  label: string;
  icon: IconName;
  toggle: () => void;
}

/**
 * D364: Mute/Unmute for an event that would notify the caller; null when it doesn't apply. The
 * caller disables it offline.
 */
export function useEventMuteToggle(item: Item, deckSlug: string): EventMuteToggle | null {
  const mutation = useEventMute(deckSlug);
  if (!canMuteEvent(item)) return null;
  const muted = item.event?.muted === true;

  function toggle(): void {
    if (mutation.isPending) return;
    mutation
      .mutateAsync({ item, muted: !muted })
      .then(() => showToast({ message: muted ? 'Notifications on' : 'Notifications muted' }))
      .catch((error: unknown) =>
        showToast({
          message: lifecycleErrorMessage(
            error,
            muted ? "Couldn't unmute this event." : "Couldn't mute this event.",
          ),
        }),
      );
  }

  return {
    label: muted ? UNMUTE_LABEL : MUTE_LABEL,
    icon: muted ? 'bell' : 'bell-off',
    toggle,
  };
}
