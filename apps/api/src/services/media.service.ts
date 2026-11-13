import { createHash } from 'node:crypto';
import {
  MEDIA_CONFIRM_RATE_PER_HOUR,
  MEDIA_MAX_BYTES_DEFAULTS,
  MEDIA_SIGN_RATE_PER_HOUR,
  MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
  kindForFormat,
  resourceTypeForKind,
  type AssetResourceType,
  type MediaKind,
  type MediaMaxBytes,
  type MediaAsset,
  type MediaAssetConfirmRequest,
  type MediaSignResponse,
  type MediaUploadFailureRequest,
} from '@gobbit/shared';
import type { DeckRow } from '@gobbit/db';
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
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { MEDIA_DECISION_LEVELS, TAMPER_REASONS, type MediaDecisions } from './media.events';

/** Correlates log lines about one stored file without spelling out its storage path. */
function hashForLog(publicId: string): string {
  return createHash('sha256').update(publicId).digest('hex').slice(0, 16);
}

export interface DeckLookup {
  findById(id: string): Promise<DeckRow | null>;
  findBySlug(slug: string): Promise<DeckRow | null>;
  findDefaultForAccount(accountId: string): Promise<DeckRow | null>;
}

/** The member-facing message of each confirm refusal (field `file`). */
const CONFIRM_MESSAGES: Record<NonNullable<MediaDecisions['media.confirm']['reason']>, string> = {
  format: "This kind of file can't be added",
  kind_mismatch: "The file doesn't match the kind it was uploaded as",
  too_large: 'This file is over the size limit',
  unreadable: "This file can't be read (a password-protected or damaged file?)",
  bad_signature: 'Upload signature does not verify',
  wrong_folder: "File is outside this deck's upload folder",
  other_deck: 'File belongs to another deck',
};

/** Pre-045 refusals keep their fields; the 045 ones name `file`. */
const REFUSAL_PATHS: Partial<
  Record<NonNullable<MediaDecisions['media.confirm']['reason']>, string>
> = {
  bad_signature: 'signature',
  wrong_folder: 'publicId',
  other_deck: 'publicId',
};

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
  /** D393: effective per-kind upload limits; defaults to the shared defaults. */
  maxBytes?: MediaMaxBytes;
  /** 045 Accountability: `media.sign`, `media.confirm`, `media.refused_delete`. */
  decisions?: DecisionLogger<MediaDecisions>;
}) {
  const { decks, memberships, rateLimits, cloudinary, assets, store, now } = deps;
  const log = deps.log ?? childLogger('media');
  const maxBytes = deps.maxBytes ?? MEDIA_MAX_BYTES_DEFAULTS;
  const decisions =
    deps.decisions ??
    decisionLogger<MediaDecisions>('media', { levels: MEDIA_DECISION_LEVELS, parent: deps.log });
  const tamper =
    deps.decisions ??
    decisionLogger<MediaDecisions>('media', {
      levels: { ...MEDIA_DECISION_LEVELS, 'media.confirm': 'warn' },
      parent: deps.log,
    });
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

  type ConfirmReason = NonNullable<MediaDecisions['media.confirm']['reason']>;
  type Context = { requestId: string; actorId: string; deckId: string };

  function refuseConfirm(
    ctx: Context,
    reason: ConfirmReason,
    fields: { kind: MediaKind | null; bytes: number; publicId: string },
  ): never {
    (TAMPER_REASONS.has(reason) ? tamper : decisions).record('media.confirm', {
      outcome: 'refused',
      reason,
      ...ctx,
      kind: fields.kind,
      bytes: fields.bytes,
      publicIdHash: hashForLog(fields.publicId),
    });
    const path = REFUSAL_PATHS[reason] ?? 'file';
    throw unprocessableField(path, CONFIRM_MESSAGES[reason], CONFIRM_MESSAGES[reason]);
  }

  /** D390: a refused upload's stored file is removed before the refusal is answered. */
  async function deleteRefused(
    ctx: Context,
    publicId: string,
    resourceType: AssetResourceType,
  ): Promise<void> {
    let outcome: 'deleted' | 'failed';
    try {
      const result = await store!.deleteMany([publicId], resourceType);
      outcome = result.get(publicId) === 'failed' ? 'failed' : 'deleted';
    } catch {
      outcome = 'failed';
    }
    decisions.record('media.refused_delete', {
      outcome,
      requestId: ctx.requestId,
      deckId: ctx.deckId,
      publicIdHash: hashForLog(publicId),
    });
  }

  return {
    /**
     * D389: only members who may create cards get an upload permission for one kind of file,
     * scoped to that deck, with the kind's formats, size limit and eager renditions signed in.
     */
    async signUpload(input: {
      user: CurrentUser;
      deckId: string;
      kind?: MediaKind;
      requestId?: string;
    }): Promise<MediaSignResponse> {
      const kind = input.kind ?? 'image';
      const deck = await uploadableDeck(input.user, input.deckId);
      const ctx = {
        requestId: input.requestId ?? 'internal',
        actorId: input.user.id,
        deckId: deck.id,
      };
      if (!cloudinary) {
        decisions.record('media.sign', { outcome: 'refused', reason: 'unavailable', ...ctx, kind });
        throw serviceUnavailable('Media uploads are not configured');
      }
      await rateLimits.enforce(rateKeys.mediaSignUser(input.user.id), MEDIA_SIGN_RATE_PER_HOUR);
      decisions.record('media.sign', { outcome: 'accepted', ...ctx, kind });
      return signEditorUpload(cloudinary, deck.id, now(), { kind, maxBytes: maxBytes[kind] });
    },

    /**
     * D157/D390: records a finished editor upload once Cloudinary's response signature verifies
     * and the file sits in this deck's editor folder. The kind comes from the stored format,
     * never the request; a file of the wrong kind, over its limit, or without its pages or
     * duration is refused and deleted. Repeats are idempotent (`created: false`).
     */
    async confirmUpload(input: {
      user: CurrentUser;
      deckId: string;
      body: MediaAssetConfirmRequest;
      requestId?: string;
    }): Promise<{ asset: MediaAsset; created: boolean }> {
      const deck = await uploadableDeck(input.user, input.deckId);
      if (!store) throw serviceUnavailable('Media uploads are not configured');
      await rateLimits.enforce(
        rateKeys.mediaConfirmUser(input.user.id),
        MEDIA_CONFIRM_RATE_PER_HOUR,
      );
      const b = input.body;
      const ctx = {
        requestId: input.requestId ?? 'internal',
        actorId: input.user.id,
        deckId: deck.id,
      };
      const facts = { kind: b.kind, bytes: b.bytes, publicId: b.publicId };
      if (!store.verifyResponse(b.publicId, b.version, b.signature)) {
        refuseConfirm(ctx, 'bad_signature', facts);
      }
      if (!b.publicId.startsWith(`${editorUploadFolder(deck.id)}/`)) {
        // Not this deck's file: nothing is deleted.
        refuseConfirm(ctx, 'wrong_folder', facts);
      }

      const kind = kindForFormat(b.format);
      const reason: ConfirmReason | null =
        kind === null
          ? 'format'
          : kind !== b.kind || b.resourceType !== resourceTypeForKind(kind)
            ? 'kind_mismatch'
            : b.bytes > maxBytes[kind]
              ? 'too_large'
              : (kind === 'pdf' && !b.pages) ||
                  ((kind === 'audio' || kind === 'video') && !b.durationMs)
                ? 'unreadable'
                : null;
      if (reason !== null || kind === null) {
        await deleteRefused(ctx, b.publicId, b.resourceType);
        refuseConfirm(ctx, reason ?? 'format', { ...facts, kind });
      }

      const sized = kind === 'image' || kind === 'pdf' || kind === 'video';
      const recorded = await assets.upsert({
        deckId: deck.id,
        publicId: b.publicId,
        source: 'editor',
        kind,
        resourceType: resourceTypeForKind(kind),
        width: sized ? (b.width ?? null) : null,
        height: sized ? (b.height ?? null) : null,
        bytes: b.bytes,
        format: b.format.toLowerCase(),
        durationMs: kind === 'audio' || kind === 'video' ? (b.durationMs ?? null) : null,
        pages: kind === 'pdf' ? (b.pages ?? null) : null,
        etag: b.etag ?? null,
        originalFilename: b.originalFilename ?? null,
        uploadedBy: input.user.id,
      });
      if (!recorded) refuseConfirm(ctx, 'other_deck', { ...facts, kind });
      decisions.record('media.confirm', {
        outcome: 'accepted',
        ...ctx,
        assetId: recorded.row.id,
        kind,
        bytes: b.bytes,
      });
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
