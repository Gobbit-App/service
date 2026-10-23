import {
  MEDIA_CONFIRM_RATE_PER_HOUR,
  MEDIA_SIGN_RATE_PER_HOUR,
  MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
  type MediaAsset,
  type MediaAssetConfirmRequest,
  type MediaSignResponse,
  type MediaUploadFailureRequest,
} from '@pb/shared';
import type { DeckRow } from '@pb/db';
import { authorize, type MembershipLookup } from '../access/authorize';
import { serviceUnavailable, unprocessableField } from '../errors/http-errors';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';
import { childLogger, type Logger } from '../lib/logger';
import { rateKeys } from '../lib/rate-window';
import { resolveDeck } from '../lib/resolve-deck';
import { toMediaAsset } from '../media/asset-dto';
import type { MediaStore } from '../media/media-store';
import { editorUploadFolder, signEditorUpload } from '../media/sign-upload';
import type { AssetsRepo } from '../repositories/assets.repo';
import type { SafeImageFetch } from '../fetch/safe-fetch';
import type { CurrentUser } from '../types';
import { createAssetUploader } from './media-upload-from-url';
import { createOrphanSweeper } from './media-sweep';
import type { RateLimitService } from './rate-limit.service';

export interface DeckLookup {
  findById(id: string): Promise<DeckRow | null>;
  findBySlug(slug: string): Promise<DeckRow | null>;
  findDefaultForAccount(accountId: string): Promise<DeckRow | null>;
}

export type { UploadFromUrlResult } from './media-upload-from-url';
export type { SweepSummary } from './media-sweep';

/** D133, D156–D159: signed uploads, the asset registry and its cleanup. Callable without HTTP. */
export function createMediaService(deps: {
  decks: DeckLookup;
  memberships: MembershipLookup;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  /** Null without `CLOUDINARY_URL` → 503. */
  cloudinary: CloudinaryCredentials | null;
  assets: AssetsRepo;
  /** Null without `CLOUDINARY_URL`. */
  store: MediaStore | null;
  imageFetch: SafeImageFetch;
  now: () => Date;
  log?: Logger;
}) {
  const { decks, memberships, rateLimits, cloudinary, assets, store, now } = deps;
  const log = deps.log ?? childLogger('media');
  const uploader = createAssetUploader({ assets, store, imageFetch: deps.imageFetch, log });
  const sweeper = createOrphanSweeper({
    assets,
    store,
    log: deps.log ?? childLogger('media-sweep'),
  });

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

    /**
     * D157: records a finished editor upload once Cloudinary's response signature verifies and
     * the image sits in this deck's editor folder. Repeats are idempotent (`created: false`).
     */
    async confirmUpload(input: {
      user: CurrentUser;
      deckId: string;
      body: MediaAssetConfirmRequest;
    }): Promise<{ asset: MediaAsset; created: boolean }> {
      const deck = await uploadableDeck(input.user, input.deckId);
      if (!store) throw serviceUnavailable('Image uploads are not configured');
      await rateLimits.enforce(
        rateKeys.mediaConfirmUser(input.user.id),
        MEDIA_CONFIRM_RATE_PER_HOUR,
      );
      const { publicId, version, signature, width, height, bytes, format } = input.body;
      if (!store.verifyResponse(publicId, version, signature)) {
        throw unprocessableField('signature', 'Upload signature does not verify');
      }
      if (!publicId.startsWith(`${editorUploadFolder(deck.id)}/`)) {
        throw unprocessableField('publicId', "Image is outside this deck's upload folder");
      }
      const recorded = await assets.upsert({
        deckId: deck.id,
        publicId,
        source: 'editor',
        width,
        height,
        bytes,
        format,
        uploadedBy: input.user.id,
      });
      if (!recorded) throw unprocessableField('publicId', 'Image belongs to another deck');
      return { asset: toMediaAsset(recorded.row), created: recorded.created };
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

    /** D159: copies a public image into a deck's storage; never throws. */
    uploadFromUrl: uploader.uploadFromUrl,

    /** D158: deletes unreferenced assets past the grace period. */
    sweepOrphans: sweeper.sweepOrphans,

    /**
     * D158: after a deck is deleted (and its rows cascaded), drops every image stored under its
     * prefixes. Logged on failure; never fails the caller.
     */
    async deleteForDeck(deckId: string): Promise<void> {
      await sweeper.deleteForDeck(deckId);
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
