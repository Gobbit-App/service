import { useQuery } from '@tanstack/react-query';
import { meQuery } from '../api/queries';
import { membersQuery } from '../deck-admin/deck-admin-queries';

export const SOMEONE = 'someone';

/**
 * Names a deck member for reminder copy: "you" for the viewer, the member's display name when
 * the member list has it, else "someone" (e.g. a member who has since left).
 */
export function useMemberName(deckId: string, enabled: boolean): (userId: string | null) => string {
  const me = useQuery({ ...meQuery(), enabled });
  const members = useQuery({ ...membersQuery(deckId), enabled });
  return (userId) => {
    if (!userId) return SOMEONE;
    if (userId === me.data?.user.id) return 'you';
    return members.data?.find((m) => m.userId === userId)?.displayName ?? SOMEONE;
  };
}
