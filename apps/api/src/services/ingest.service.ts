import { randomUUID } from 'node:crypto';
import {
  can,
  INGEST_CAP_WINDOW_MS,
  INGEST_IMAGE_MAX_BYTES,
  INGEST_IMAGE_MIMES,
  INGEST_MAX_IMAGES,
  RESERVED_DECK_SLUG,
  type IngestAccepted,
  type IngestChannel,
  type IngestImage,
  type IngestJob,
  type IngestRaw,
  type IngestRequest,
} from '@pb/shared';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import { authorize, resolveRole, type MembershipLookup } from '../access/authorize';
import { badRequest, notFound, rateLimited, serviceUnavailable } from '../errors/http-errors';
import type { IngestQueue } from '../jobs/ingest-queue';
import { toIngestJobDto } from '../lib/ingest-mappers';
import { isUuid, resolveDeck } from '../lib/resolve-deck';
import type { IngestUploadStore } from '../media/ingest-uploads';
import type { CurrentUser } from '../types';

/** An uploaded image as received (before Cloudinary). */
export interface IngestFile {
  bytes: Uint8Array;
  mime: string;
}

/** Who is sharing: a session user, or a token's user (with the token's bound deck). */
export interface IngestCaller {
  user: CurrentUser;
  via: 'session' | 'token' | 'email';
  /** D99: a token bound to a deck always ingests into it. */
  tokenDeckId?: string | null;
}

export interface IngestSubmission extends IngestRequest {
  files: IngestFile[];
}

/** Retry-After for the daily cap: the window is rolling, so an hour is a fair hint. */
const CAP_RETRY_AFTER_SECONDS = 3600;

const isAllowedMime = (mime: string): boolean =>
  (INGEST_IMAGE_MIMES as readonly string[]).includes(mime);

/** D101: rejects a submission with nothing to ingest or bad images. */
export function assertSubmissionShape(s: IngestSubmission): void {
  if (!s.text?.trim() && !s.url && s.files.length === 0) {
    throw badRequest('Share some text, a URL or an image');
  }
  if (s.files.length > INGEST_MAX_IMAGES) {
    throw badRequest(`At most ${INGEST_MAX_IMAGES} images per share`);
  }
  for (const f of s.files) {
    if (!isAllowedMime(f.mime)) {
      throw badRequest(`Unsupported image type: ${f.mime || 'unknown'}`);
    }
    if (f.bytes.byteLength > INGEST_IMAGE_MAX_BYTES) {
      throw badRequest(`Images must be at most ${INGEST_IMAGE_MAX_BYTES / (1024 * 1024)} MB`);
    }
  }
}

/** D93/D99: token shares are `shortcut`, email is `email`, session shares say pwa or paste. */
export function channelFor(caller: IngestCaller, requested?: 'pwa' | 'paste'): IngestChannel {
  if (caller.via === 'token') return 'shortcut';
  if (caller.via === 'email') return 'email';
  return requested ?? 'paste';
}

export function createIngestService(deps: {
  /** D93: off without an extraction provider (POST /ingest → 503). */
  enabled: boolean;
  decks: DecksRepo;
  memberships: MembershipLookup;
  jobs: IngestJobsRepo;
  uploads: IngestUploadStore | null;
  queue: IngestQueue;
  dailyCap: number;
  now: () => Date;
  newId?: () => string;
}) {
  const { enabled, decks, memberships, jobs, uploads, queue, dailyCap, now } = deps;
  const newId = deps.newId ?? randomUUID;

  async function uploadAll(jobId: string, deckId: string, files: IngestFile[]) {
    if (files.length === 0) return [];
    if (!uploads) {
      throw serviceUnavailable('Image uploads are not configured');
    }
    const images: IngestImage[] = [];
    try {
      for (const f of files) {
        const { publicId } = await uploads.upload(jobId, deckId, f);
        images.push({ publicId, bytes: f.bytes.byteLength, mime: f.mime });
      }
    } catch (err) {
      console.error(
        `[ingest] upload failed for job ${jobId}:`,
        err instanceof Error ? err.message : err,
      );
      await uploads.deleteForJob(jobId).catch(() => undefined);
      throw serviceUnavailable('Image upload failed, try again');
    }
    return images;
  }

  return {
    /** D93: validates, uploads images, records a queued job and enqueues it → 202. */
    async submit(caller: IngestCaller, s: IngestSubmission): Promise<IngestAccepted> {
      if (!enabled) {
        throw serviceUnavailable('Ingestion is not configured');
      }
      assertSubmissionShape(s);

      const { user } = caller;
      const deckRef = caller.tokenDeckId ?? s.deckId ?? RESERVED_DECK_SLUG;
      const deck = await resolveDeck(decks, deckRef, user);
      await authorize(user, deck, 'item.create', memberships);

      const since = new Date(now().getTime() - INGEST_CAP_WINDOW_MS);
      if ((await jobs.countByUserSince(user.id, since)) >= dailyCap) {
        throw rateLimited(CAP_RETRY_AFTER_SECONDS);
      }

      const id = newId();
      const images = await uploadAll(id, deck.id, s.files);
      const raw: IngestRaw = { images };
      if (s.text?.trim()) raw.text = s.text;
      if (s.url) raw.url = s.url;
      if (s.title?.trim()) raw.title = s.title.trim();

      await jobs.create({
        id,
        userId: user.id,
        deckId: deck.id,
        channel: channelFor(caller, s.channel),
        status: 'queued',
        raw,
      });
      await queue.enqueue(id);
      return { id, status: 'queued' };
    },

    /** D109: the sharer or a deck publisher may see a job; anyone else gets 404. */
    async get(user: CurrentUser, id: string): Promise<IngestJob> {
      const job = isUuid(id) ? await jobs.findById(id) : null;
      if (!job) throw notFound('Ingest job not found');

      if (job.userId !== user.id) {
        const deck = await decks.findById(job.deckId);
        if (!deck) throw notFound('Ingest job not found');
        const membership =
          deck.ownerAccountId === user.accountId
            ? null
            : await memberships.findActive(deck.id, user.id);
        const role = resolveRole(user, deck, membership);
        if (!role || !can(role, 'item.publish')) {
          throw notFound('Ingest job not found');
        }
      }

      return toIngestJobDto(job, await jobs.costUsd(job.id));
    },
  };
}

export type IngestService = ReturnType<typeof createIngestService>;
