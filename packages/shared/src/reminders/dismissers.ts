import { can } from '../authz/can';
import type { CategoryVisibility, MemberRole } from '../enums';
import type { DismissMode } from './constants';

export interface DismisserMember {
  userId: string;
  role: MemberRole;
}

export interface DismissersInput {
  mode: DismissMode;
  userIds: readonly string[];
  createdBy: string | null;
  /** Live, accepted members of the deck (account owners included as `owner`). */
  members: readonly DismisserMember[];
  /** Visibility of the card's live categories (empty for a card without categories). */
  categoryVisibilities: readonly CategoryVisibility[];
  /** Personal decks only ever use `me` (FR-004). */
  personalDeck: boolean;
}

/** A writer who can still see the card (D293); also gates the Upcoming list of `/me/pending`. */
export function canStillAct(
  member: DismisserMember,
  visibilities: readonly CategoryVisibility[],
): boolean {
  if (!can(member.role, 'item.update')) return false;
  if (can(member.role, 'category.read_private')) return true;
  return visibilities.some((v) => v !== 'private');
}

/**
 * D293: who may dismiss a reminder right now. Candidates by rule, kept only while they are live
 * writers who can see the card; when nobody remains, the deck's owners. One function serves the
 * dismiss check, `canDismiss`, the pending list and the notifier.
 */
export function reminderDismissers(input: DismissersInput): string[] {
  const mode: DismissMode = input.personalDeck ? 'me' : input.mode;
  const byId = new Map(input.members.map((m) => [m.userId, m]));
  const candidates = new Set<string>();
  if (input.createdBy) candidates.add(input.createdBy);
  if (mode === 'writers') {
    for (const m of input.members) candidates.add(m.userId);
  } else if (mode === 'people') {
    for (const id of input.userIds) candidates.add(id);
  }
  const eligible = [...candidates].filter((id) => {
    const m = byId.get(id);
    return m !== undefined && canStillAct(m, input.categoryVisibilities);
  });
  if (eligible.length > 0) return eligible;
  return input.members.filter((m) => m.role === 'owner').map((m) => m.userId);
}

/** D293: the creator changes who can dismiss; once the creator is no longer a member, owners may. */
export function canChangeDismissers(input: {
  userId: string;
  role: MemberRole;
  createdBy: string | null;
  creatorIsMember: boolean;
}): boolean {
  if (input.createdBy !== null && input.createdBy === input.userId) return true;
  return !input.creatorIsMember && input.role === 'owner';
}
