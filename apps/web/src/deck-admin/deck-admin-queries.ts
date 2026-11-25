import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CategoryPatch,
  Deck,
  DeckPatch,
  InviteCreateInput,
  InviteLink,
  InviteLinkCreate,
  Member,
  MemberRole,
} from '@gobbit/shared';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/query-keys';

type DeckRef = Pick<Deck, 'id' | 'slug'>;

/** D184: `GET /decks/{id}/members` (`member.list`, every role). */
export const membersQuery = (idOrSlug: string) =>
  queryOptions({
    queryKey: queryKeys.members(idOrSlug),
    queryFn: async ({ signal }): Promise<Member[]> =>
      (await unwrap(api.GET('/decks/{id}/members', { params: { path: { id: idOrSlug } }, signal })))
        .data,
  });

/** `GET /decks/{id}/invite-links` (owners; D476). */
export const inviteLinksQuery = (idOrSlug: string) =>
  queryOptions({
    queryKey: queryKeys.inviteLinks(idOrSlug),
    queryFn: async ({ signal }): Promise<InviteLink[]> =>
      (
        await unwrap(
          api.GET('/decks/{id}/invite-links', { params: { path: { id: idOrSlug } }, signal }),
        )
      ).links,
  });

export const useInviteLinks = (idOrSlug: string) => useQuery(inviteLinksQuery(idOrSlug));

/** The screen reads by slug, other screens by id: refresh both keys. */
function invalidateBoth(
  qc: QueryClient,
  deck: DeckRef,
  key: (idOrSlug: string) => readonly unknown[],
) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: key(deck.slug) }),
    qc.invalidateQueries({ queryKey: key(deck.id) }),
  ]);
}

/** Rename and the owner-only public switch (`PATCH /decks/{id}`). */
export function useUpdateDeck(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: DeckPatch): Promise<Deck> =>
      unwrap(api.PATCH('/decks/{id}', { params: { path: { id: deck.id } }, body: patch })),
    onSettled: () =>
      Promise.all([
        invalidateBoth(qc, deck, queryKeys.deck),
        qc.invalidateQueries({ queryKey: queryKeys.decks, exact: true }),
      ]),
  });
}

/** D176: rename or change visibility (`PATCH /decks/{id}/categories/{categoryId}`). */
export function useUpdateCategory(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, patch }: { categoryId: string; patch: CategoryPatch }) =>
      unwrap(
        api.PATCH('/decks/{id}/categories/{categoryId}', {
          params: { path: { id: deck.id, categoryId } },
          body: patch,
        }),
      ),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.categories),
  });
}

/** Invite or re-invite (`POST /decks/{id}/invites`); a re-invite replaces the pending one. */
export function useInviteMember(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invite: InviteCreateInput) =>
      unwrap(api.POST('/decks/{id}/invites', { params: { path: { id: deck.id } }, body: invite })),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.members),
  });
}

/** `POST /decks/{id}/invite-links`; the response carries the one-time `url`. */
export function useCreateInviteLink(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteLinkCreate): Promise<InviteLink> =>
      unwrap(
        api.POST('/decks/{id}/invite-links', { params: { path: { id: deck.id } }, body: input }),
      ),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.inviteLinks),
  });
}

/** `DELETE /decks/{id}/invite-links/{linkId}` (owners; waiting or invalid links). */
export function useRevokeInviteLink(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      unwrap(
        api.DELETE('/decks/{id}/invite-links/{linkId}', {
          params: { path: { id: deck.id, linkId } },
        }),
      ),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.inviteLinks),
  });
}

/** D185: `PATCH /decks/{id}/members/{userId}`. */
export function useChangeRole(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }): Promise<Member> =>
      unwrap(
        api.PATCH('/decks/{id}/members/{userId}', {
          params: { path: { id: deck.id, userId } },
          body: { role },
        }),
      ),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.members),
  });
}

/** Remove a member or cancel a pending invite (`DELETE /decks/{id}/members/{userId}`). */
export function useRemoveMember(deck: DeckRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.DELETE('/decks/{id}/members/{userId}', { params: { path: { id: deck.id, userId } } }),
      ),
    onSettled: () => invalidateBoth(qc, deck, queryKeys.members),
  });
}
