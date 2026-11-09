import type { Deck, Item } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { useState, type ReactElement } from 'react';
import type { LifecycleAction } from '../api/item-lifecycle';
import { linkCheckActions } from '../api/link-checks';
import { useOnline } from '../api/offline';
import { availableActions, LIFECYCLE_LABEL, useCardLifecycle } from '../items/use-card-lifecycle';
import { LINK_CHECK_LABEL, useLinkCheckRun } from '../items/use-link-check-run';
import { IconButton } from '../ui/buttons/IconButton';
import { deckHref } from '../ui/chip-order';
import type { IconName } from '../ui/icons/Icon';
import { MoreMenu, type MenuAction } from '../ui/MoreMenu';
import { CardBar, ReaderActions } from './CardBar';
import { EditLink } from './EditLink';
import { DismissDialog } from '../reminders/DismissDialog';
import {
  ADD_TO_CALENDAR_FAILED,
  ADD_TO_CALENDAR_LABEL,
  canAddToCalendar,
  downloadEventIcs,
} from '../event-cards/add-to-calendar';
import { showToast } from '../ui/toast-store';

export const OFFLINE_REASON = 'needs a connection';

export const DISMISS_LABEL = 'Dismiss';

/** 037 (D294): the Dismiss action shows for eligible dismissers of a pending, live reminder. */
export function canDismissReminder(item: Item): boolean {
  return (
    item.deletedAt === undefined &&
    item.status === 'published' &&
    item.reminder?.state === 'pending' &&
    item.reminder.canDismiss
  );
}

const LIFECYCLE_ICON: Record<LifecycleAction, IconName> = {
  archive: 'archive',
  restore: 'restore',
  delete: 'trash',
  undelete: 'undo',
};

/** The deck log narrowed to one card (D188). */
export function itemHistoryHref(deckSlug: string, itemId: string): string {
  return `${deckHref(deckSlug, 'log')}?item=${encodeURIComponent(itemId)}`;
}

/**
 * D213: every action for one card, inside the card. The bar shows Edit, Favorite, Share and at
 * most one state action (Restore, Undelete or Check again); the rest go in "More actions".
 * A deleted card only offers Undelete. Offline, server actions stay visible but explain why
 * they do nothing.
 */
export function CardActionBar({
  item,
  deckSlug,
  role,
  onDone,
}: {
  item: Item;
  deckSlug: string;
  role: Deck['role'];
  onDone?: (action: LifecycleAction) => void;
}): ReactElement {
  const online = useOnline();
  const lifecycle = useCardLifecycle({ item, deckSlug, onDone });
  const linkCheck = useLinkCheckRun(item, deckSlug);
  const lifecycleActions = availableActions(item, role);
  const linkActions = linkCheckActions(item, role);
  const offline = online ? null : OFFLINE_REASON;
  const [dismissing, setDismissing] = useState(false);

  if (item.deletedAt !== undefined) {
    return (
      <CardBar>
        {lifecycleActions.includes('undelete') && (
          <IconButton
            icon="undo"
            label={LIFECYCLE_LABEL.undelete}
            disabledReason={offline}
            disabled={lifecycle.isPending}
            onClick={() => lifecycle.run('undelete')}
          />
        )}
      </CardBar>
    );
  }

  // One state action earns a bar slot: Restore for archived cards, else Check again.
  const barAction = lifecycleActions.find((action) => action === 'restore');
  const checkInBar = !barAction && linkActions.includes('check');
  const menu: MenuAction[] = [];
  if (can(role, 'event.list')) {
    menu.push({
      key: 'history',
      label: 'History',
      icon: 'history',
      href: itemHistoryHref(deckSlug, item.id),
    });
  }
  for (const action of linkActions) {
    if (action === 'check' && checkInBar) continue;
    menu.push({
      key: action,
      label: LINK_CHECK_LABEL[action],
      icon: action === 'check' ? 'refresh' : 'bell-off',
      disabledReason: offline,
      onSelect: () => linkCheck.run(action),
    });
  }
  for (const action of lifecycleActions) {
    if (action === barAction) continue;
    menu.push({
      key: action,
      label: LIFECYCLE_LABEL[action],
      icon: LIFECYCLE_ICON[action],
      tone: action === 'delete' ? 'danger' : undefined,
      disabledReason: offline,
      onSelect: () => lifecycle.run(action),
    });
  }

  return (
    <CardBar>
      <EditLink item={item} role={role} />
      <ReaderActions item={item} />
      {canDismissReminder(item) && (
        <IconButton
          icon="check"
          label={DISMISS_LABEL}
          disabledReason={offline}
          onClick={() => setDismissing(true)}
        />
      )}
      {canAddToCalendar(item) && (
        <IconButton
          icon="calendar-plus"
          label={ADD_TO_CALENDAR_LABEL}
          onClick={() =>
            void downloadEventIcs(item).catch(() => showToast({ message: ADD_TO_CALENDAR_FAILED }))
          }
        />
      )}
      {dismissing && (
        <DismissDialog item={item} deckSlug={deckSlug} onClose={() => setDismissing(false)} />
      )}
      {barAction && (
        <IconButton
          icon={LIFECYCLE_ICON[barAction]}
          label={LIFECYCLE_LABEL[barAction]}
          disabledReason={offline}
          disabled={lifecycle.isPending}
          onClick={() => lifecycle.run(barAction)}
        />
      )}
      {checkInBar && (
        <IconButton
          icon="refresh"
          label={LINK_CHECK_LABEL.check}
          disabledReason={offline}
          disabled={linkCheck.isPending}
          onClick={() => linkCheck.run('check')}
        />
      )}
      {menu.length > 0 && <MoreMenu actions={menu} />}
    </CardBar>
  );
}
