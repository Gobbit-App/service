import {
  MEDIA_SIGN_RATE_PER_HOUR,
  MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
  type MediaSignResponse,
  type MediaUploadFailureRequest,
} from '@pb/shared';
import type { DeckRow } from '@pb/db';
import { authorize, type MembershipLookup } from '../access/authorize';
import { serviceUnavailable } from '../errors/http-errors';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';
import { childLogger, type Logger } from '../lib/logger';
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
  log?: Logger;
}) {
  const { decks, memberships, rateLimits, cloudinary, now, log = childLogger('media') } = deps;

  /** The deck, once the user is allowed to add cards (and so photos) to it. */
  async function uploadableDeck(user: CurrentUser, deckId: string): Promise<DeckRow> {
    const deck = await resolveDeck(decks, deckId, user);
    await authorize(user, deck, 'item.create', memberships);
    return deck;
  }

  return {
    /** Only members who may create cards get an upload permission, scoped to that deck. */
    async signUpload(input: { user: CurrentUser; deckId: string }): Promise<MediaSignResponse> {
      const deck = await uploadableDeck(input.user, input.deckId);
      if (!cloudinary) throw serviceUnavailable('Image uploads are not configured');
      await rateLimits.enforce(rateKeys.mediaSignUser(input.user.id), MEDIA_SIGN_RATE_PER_HOUR);
      return signEditorUpload(cloudinary, deck.id, now());
    },

    /** Writes the browser's failed-upload report to the log; nothing is stored. */
    async reportUploadFailure(input: {
      user: CurrentUser;
      deckId: string;
      report: MediaUploadFailureRequest;
    }): Promise<void> {
      const deck = await uploadableDeck(input.user, input.deckId);
      await rateLimits.enforce(
        rateKeys.mediaUploadFailureUser(input.user.id),
        MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
      );
      const { status, message, fileType, fileBytes } = input.report;
      log.warn(
        {
          deckId: deck.id,
          userId: input.user.id,
          cloudName: cloudinary?.cloudName ?? null,
          uploadStatus: status,
          uploadError: message,
          fileType,
          fileBytes,
        },
        'browser upload to cloudinary failed',
      );
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
