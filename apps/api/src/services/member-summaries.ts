import { initialsFor } from '@gobbit/shared/avatar';
import type { DeckKind } from '@gobbit/shared/enums';
import type { CardCreator, MemberSummary } from '@gobbit/shared';
import type { UserSummaryRow } from '../repositories/users.repo';

export type MemberSummariesDeps = {
  users: { summariesByIds(ids: string[]): Promise<UserSummaryRow[]> };
};

const PLACEHOLDER: CardCreator = {
  id: null,
  name: null,
  username: null,
  initials: '',
  photo: null,
};

/** D420-D422, D427: profile name only (never the email-derived display name); no email is read. */
export function createMemberSummaries({ users }: MemberSummariesDeps) {
  return {
    /** One repo call for the whole page; deleted/unknown users are simply absent from the map. */
    async summaries(ids: Iterable<string>): Promise<Map<string, MemberSummary>> {
      const unique = [...new Set(ids)];
      const out = new Map<string, MemberSummary>();
      for (const u of await users.summariesByIds(unique)) {
        const a = u.avatar;
        out.set(u.id, {
          id: u.id,
          name: [u.firstName, u.lastName].filter((s) => s?.trim()).join(' ') || null,
          username: u.username,
          initials: initialsFor({
            firstName: u.firstName,
            lastName: u.lastName,
            fallback: u.username,
          }),
          photo: a ? { publicId: a.publicId, width: a.width, height: a.height } : null,
        });
      }
      return out;
    },

    /** Personal decks show no creator; a missing/deleted creator gets the placeholder. */
    cardCreator(
      createdBy: string | null,
      deckKind: DeckKind,
      map: Map<string, MemberSummary>,
    ): CardCreator | null {
      if (deckKind === 'personal') return null;
      return (createdBy && map.get(createdBy)) || { ...PLACEHOLDER };
    },
  };
}

export type MemberSummaries = ReturnType<typeof createMemberSummaries>;
