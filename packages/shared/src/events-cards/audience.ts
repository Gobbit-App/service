import { can } from '../authz/can';
import type { CategoryVisibility, ItemStatus, MemberRole } from '../enums';
import type { EventAudienceMode } from './constants';

export interface AudienceMember {
  userId: string;
  role: MemberRole;
}

export interface EventAudienceInput {
  mode: EventAudienceMode;
  userIds: readonly string[];
  createdBy: string | null;
  /** Live, accepted members of the deck (account owners included as `owner`). */
  members: readonly AudienceMember[];
  /** Visibility of the card's live categories. */
  categoryVisibilities: readonly CategoryVisibility[];
  /** Personal decks only ever notify the creator (FR-011). */
  personalDeck: boolean;
}

/** D362: a member who can currently read the card (role and at least one visible category). */
export function canReadEvent(
  member: AudienceMember,
  visibilities: readonly CategoryVisibility[],
): boolean {
  if (!can(member.role, 'item.read')) return false;
  if (can(member.role, 'category.read_private')) return true;
  return visibilities.some((v) => v !== 'private');
}

/**
 * D362: who an event notifies right now. Candidates by mode, kept only while they can read the card.
 * No owner fallback: "nobody" means nobody. One function serves the sweep, `stillDue`, "Coming up"
 * and the DTO's `inAudience`.
 */
export function eventAudience(input: EventAudienceInput): string[] {
  const mode: EventAudienceMode = input.personalDeck ? 'me' : input.mode;
  if (mode === 'nobody') return [];
  const candidates = new Set<string>();
  if (input.createdBy) candidates.add(input.createdBy);
  if (mode === 'everyone') for (const m of input.members) candidates.add(m.userId);
  if (mode === 'people') for (const id of input.userIds) candidates.add(id);
  const byId = new Map(input.members.map((m) => [m.userId, m]));
  return [...candidates].filter((id) => {
    const m = byId.get(id);
    return m !== undefined && canReadEvent(m, input.categoryVisibilities);
  });
}

/**
 * D363: who may change `notify`. While proposed, anyone allowed to edit the proposal; from the first
 * publish the creator, or owners once the creator is no longer a member.
 */
export function canEditEventNotify(input: {
  userId: string;
  role: MemberRole;
  createdBy: string | null;
  creatorIsMember: boolean;
  status: ItemStatus;
}): boolean {
  if (input.status === 'proposed') {
    return can(input.role, 'item.publish') || input.createdBy === input.userId;
  }
  if (input.createdBy !== null && input.createdBy === input.userId) return true;
  return !input.creatorIsMember && input.role === 'owner';
}
