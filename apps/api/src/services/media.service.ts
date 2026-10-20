import { MEDIA_SIGN_RATE_PER_HOUR, type MediaSignResponse } from '@pb/shared';
import type { DeckRow } from '@pb/db';
import { authorize, type MembershipLookup } from '../access/authorize';
import { serviceUnavailable } from '../errors/http-errors';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';
import { rateKeys } from '../lib/rate-window';
import { resolveDeck } from '../lib/resolve-deck';
import { signEditorUpload } from '../media/sign-upload';
import type { CurrentUser } from '../types';
import type { RateLimitService } from './rate-limit.service';

export interface DeckLookup {
  findById(id: string): Promise<DeckRow | null>;
  findBySlug(slug: string): Promise<DeckRow | null>;
  findDefaultForAccount(accountId: string): Promise<DeckRow | null>;
}

/** D133: signed direct uploads for the card editor. Callable without HTTP (FR-016). */
export function createMediaService(deps: {
  decks: DeckLookup;
  memberships: MembershipLookup;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  /** Null without `CLOUDINARY_URL` → 503. */
  cloudinary: CloudinaryCredentials | null;
  now: () => Date;
}) {
  const { decks, memberships, rateLimits, cloudinary, now } = deps;

  return {
    /** Only members who may create cards get an upload permission, scoped to that deck. */
    async signUpload(input: { user: CurrentUser; deckId: string }): Promise<MediaSignResponse> {
      const deck = await resolveDeck(decks, input.deckId, input.user);
      await authorize(input.user, deck, 'item.create', memberships);
      if (!cloudinary) throw serviceUnavailable('Image uploads are not configured');
      await rateLimits.enforce(rateKeys.mediaSignUser(input.user.id), MEDIA_SIGN_RATE_PER_HOUR);
      return signEditorUpload(cloudinary, deck.id, now());
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
