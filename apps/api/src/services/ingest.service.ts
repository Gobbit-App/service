import { randomUUID } from 'node:crypto';
import {
  can,
  DIRECT_PROPOSAL_MODEL,
  INGEST_CLIENT_LABEL_MAX,
  INGEST_MAX_BYTES_DEFAULTS,
  MEDIA_FILE_NAME_MAX,
  INGEST_MAX_IMAGES,
  directCardTypes,
  itemCreateSchema,
  LEGACY_IMAGE_TYPE,
  normalizeLegacyMediaPayload,
  NAME_MAX,
  RESERVED_DECK_SLUG,
  type DedupVerdict,
  type IngestAccepted,
  type IngestChannel,
  type IngestImage,
  type IngestRawFile,
  type MediaKind,
  type IngestJob,
  type IngestRaw,
  type IngestRequest,
  type ItemCreate,
  type ItemCreateResolved,
  type MemberRole,
} from '@gobbit/shared';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { authorize, resolveRole, type MembershipLookup } from '../access/authorize';
import { badRequest, notFound, serviceUnavailable } from '../errors/http-errors';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import type { IngestQueue } from '../jobs/ingest-queue';
import { proposeItem } from '../ingest/propose';
import { createCapGuard } from '../ingest/caps';
import type { RunDedupInput } from '../ingest/run-dedup';
import { toIngestJobDto } from '../lib/ingest-mappers';
import { isUuid, resolveDeck } from '../lib/resolve-deck';
import type { IngestUploadStore } from '../media/ingest-uploads';
import type { AssetsRepo } from '../repositories/assets.repo';
import type { CurrentUser } from '../types';
import { lineSink } from '../lib/logger';
import { decisionLogger } from '../lib/decision-event';
import type { ItemDecisions } from './items.events';
import type { IngestMediaDecisions } from '../ingest/media.events';
import {
  classifyShareFiles,
  type ClassifiedFile,
  type ClassifiedShare,
  type IngestMaxBytes,
} from '../ingest/classify-files';
import type { StoredUpload } from '../media/ingest-uploads';

/** An uploaded image as received (before Cloudinary). */
export interface IngestFile {
  /** The name it was shared with, when known (title fallback, D395). */
  name?: string;
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

/** A card an AI app (or a later importer/agent) proposes as is: no fetch, no extraction. */
export type DirectDraft = ItemCreate & {
  /** A category the reviewer may create on publish (`createCategory`). */
  newCategory?: string | null;
};

export interface DirectProposal {
  user: CurrentUser;
  /** Deck id or slug. */
  deck: string;
  draft: DirectDraft;
  channel: IngestChannel;
  /** Propose an edit of this published card instead of a new card (dedup via `explicit`). */
  targetItemId?: string;
  /** The app's name for the review source line, e.g. "Claude". */
  clientLabel?: string;
}

export interface DirectProposalResult {
  jobId: string;
  itemId: string;
  dedup: DedupVerdict | null;
}

/** D101: rejects a submission with nothing to ingest or too many files. */
export function assertSubmissionShape(s: IngestSubmission): void {
  if (!s.text?.trim() && !s.url && s.files.length === 0) {
    throw badRequest('Share some text, a URL or a file');
  }
  if (s.files.length > INGEST_MAX_IMAGES) {
    throw badRequest(`At most ${INGEST_MAX_IMAGES} files per share`);
  }
}

/**
 * D395/FR-027: which files the share uses. A share that would be left with nothing (no text, no
 * URL and no usable file) is refused, with the first file's reason.
 */
export function classifySubmission(s: IngestSubmission, limits: IngestMaxBytes): ClassifiedShare {
  const classified = classifyShareFiles(s.files, limits);
  const usable = classified.images.length > 0 || classified.file !== null;
  if (!usable && !s.text?.trim() && !s.url && classified.unused.length > 0) {
    const reason = classified.unused[0]!.reason;
    throw badRequest(
      reason === 'too_large'
        ? 'This file is over the size limit for shares'
        : "This kind of file can't be shared into Gobbit",
    );
  }
  return classified;
}

/** D93/D99: token shares are `shortcut`, email is `email`, session shares say pwa or paste. */
export function channelFor(caller: IngestCaller, requested?: 'pwa' | 'paste'): IngestChannel {
  if (caller.via === 'token') return 'shortcut';
  if (caller.via === 'email') return 'email';
  return requested ?? 'paste';
}

const ITEM_NOT_FOUND = 'Item not found';

/** Card limits and the D100 card types for a direct draft; returns the parsed card. */
export function parseDirectDraft(draft: DirectDraft): ItemCreateResolved {
  const { newCategory: _newCategory, ...given } = draft;
  // D387: old clients still propose `image` cards with a flat payload.
  const card =
    given.type === LEGACY_IMAGE_TYPE
      ? { ...given, type: 'media', payload: normalizeLegacyMediaPayload(given.payload) }
      : given;
  if (!(directCardTypes as readonly string[]).includes(card.type)) {
    throw badRequest(`Proposals can only be ${directCardTypes.join(', ')} cards`);
  }
  const parsed = itemCreateSchema.safeParse(card);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid card');
  }
  return parsed.data as ItemCreateResolved;
}

/** A suggested category name, trimmed; blank → null, too long → 400. */
export function suggestedCategory(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  if (trimmed === '') return null;
  if ([...trimmed].length > NAME_MAX) {
    throw badRequest(`Category names are at most ${NAME_MAX} characters`);
  }
  return trimmed;
}

export function createIngestService(deps: {
  /** D93: off without an extraction provider (POST /ingest → 503). */
  enabled: boolean;
  decks: DecksRepo;
  memberships: MembershipLookup;
  jobs: IngestJobsRepo;
  categories: Pick<CategoriesRepo, 'listByDeck' | 'findDefault'>;
  items: Pick<ItemsRepo, 'create' | 'findById' | 'isVisibleTo'>;
  uploads: IngestUploadStore | null;
  /** D157: every upload is recorded as an asset of the deck. */
  assets: Pick<AssetsRepo, 'upsert'>;
  queue: IngestQueue;
  /** D110: jobs per user and channel per rolling day. */
  dailyCaps: Record<IngestChannel, number>;
  /** Jobs per user across channels per rolling day. */
  combinedCap: number;
  /** D103 for direct proposals (bound `runDedup`); omitted → no verdict. */
  dedup?: (input: RunDedupInput) => Promise<DedupVerdict>;
  embedQueue: EmbedQueue;
  /** D163: snapshot a proposed link's preview image; omitted → none. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  now: () => Date;
  newId?: () => string;
  log?: (message: string, err?: unknown) => void;
  /** D393: ingest size limit per kind; defaults to the shared defaults. */
  maxBytes?: IngestMaxBytes;
}) {
  const { enabled, decks, memberships, jobs, uploads, queue, now } = deps;
  const newId = deps.newId ?? randomUUID;
  const log = deps.log ?? lineSink('ingest');
  const aliasDecisions = decisionLogger<ItemDecisions>('ingest');
  const fileDecisions = decisionLogger<IngestMediaDecisions>('ingest');
  const maxBytes = deps.maxBytes ?? INGEST_MAX_BYTES_DEFAULTS;

  const assertWithinCaps = createCapGuard({
    jobs,
    dailyCaps: deps.dailyCaps,
    combinedCap: deps.combinedCap,
    now,
  });

  /** ADR-004: a published card of this deck the caller can see, else 404. */
  async function assertTarget(deckId: string, role: MemberRole, itemId: string): Promise<void> {
    const target = isUuid(itemId) ? await deps.items.findById(itemId) : null;
    if (
      !target ||
      target.deckId !== deckId ||
      target.status !== 'published' ||
      !(await deps.items.isVisibleTo(target.id, role))
    ) {
      throw notFound(ITEM_NOT_FOUND);
    }
  }

  /** The draft's categories, which must all be categories of the deck the caller can see. */
  async function draftCategories(
    deckId: string,
    role: MemberRole,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const visible = new Set((await deps.categories.listByDeck(deckId, role)).map((c) => c.id));
    if (ids.some((id) => !visible.has(id))) throw badRequest('Unknown category');
    return [...ids];
  }

  /** Records a server upload as an asset of the deck, with the provider's facts (D157, D390). */
  async function record(
    deckId: string,
    userId: string,
    kind: MediaKind,
    stored: StoredUpload,
    fileName?: string,
  ): Promise<void> {
    await deps.assets.upsert({
      deckId,
      source: 'ingest',
      uploadedBy: userId,
      publicId: stored.publicId,
      kind,
      resourceType: stored.resourceType,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      format: stored.format,
      durationMs: stored.durationMs,
      pages: stored.pages,
      etag: stored.etag,
      originalFilename: fileName ? [...fileName].slice(0, MEDIA_FILE_NAME_MAX).join('') : null,
    });
  }

  async function uploadAll(
    jobId: string,
    deckId: string,
    userId: string,
    files: ClassifiedFile[],
  ): Promise<IngestImage[]> {
    if (files.length === 0) return [];
    if (!uploads) {
      throw serviceUnavailable('Image uploads are not configured');
    }
    const images: IngestImage[] = [];
    try {
      for (const f of files) {
        const stored = await uploads.upload(jobId, deckId, {
          bytes: f.bytes,
          mime: f.uploadMime,
          kind: 'image',
        });
        await record(deckId, userId, 'image', stored);
        images.push({ publicId: stored.publicId, bytes: f.bytes.byteLength, mime: f.uploadMime });
      }
    } catch (err) {
      log(`upload failed for job ${jobId}`, err);
      await uploads.deleteForJob(jobId).catch(() => undefined);
      throw serviceUnavailable('Image upload failed, try again');
    }
    return images;
  }

  /**
   * D395: uploads the share's one PDF, audio or video file. A PDF without pages or a recording
   * without a duration can't be shown, so it's deleted and the share goes on without it (null).
   */
  async function uploadFile(
    jobId: string,
    deckId: string,
    userId: string,
    f: ClassifiedFile,
  ): Promise<IngestRawFile | null> {
    if (!uploads) throw serviceUnavailable('Media uploads are not configured');
    const kind = f.kind as IngestRawFile['kind'];
    let stored: StoredUpload;
    try {
      stored = await uploads.upload(jobId, deckId, { bytes: f.bytes, mime: f.uploadMime, kind });
    } catch (err) {
      log(`upload failed for job ${jobId}`, err);
      await uploads.deleteForJob(jobId).catch(() => undefined);
      throw serviceUnavailable('File upload failed, try again');
    }
    const readable = kind === 'pdf' ? stored.pages !== null : stored.durationMs !== null;
    if (!readable) {
      await uploads.deleteForJob(jobId).catch(() => undefined);
      return null;
    }
    const fileName = f.name?.trim() || undefined;
    await record(deckId, userId, kind, stored, fileName);
    return {
      publicId: stored.publicId,
      kind,
      bytes: f.bytes.byteLength,
      mime: f.uploadMime,
      ...(stored.width && stored.height ? { width: stored.width, height: stored.height } : {}),
      ...(stored.durationMs ? { durationMs: stored.durationMs } : {}),
      ...(stored.pages ? { pages: stored.pages } : {}),
      ...(fileName ? { fileName } : {}),
    };
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

      const channel = channelFor(caller, s.channel);
      await assertWithinCaps(user.id, channel);

      const classified = classifySubmission(s, maxBytes);
      const id = newId();
      const images = await uploadAll(id, deck.id, user.id, classified.images);
      const file = classified.file ? await uploadFile(id, deck.id, user.id, classified.file) : null;
      const unused = [...classified.unused];
      if (classified.file && !file) {
        unused.push({
          mime: classified.file.mime || 'unknown',
          bytes: classified.file.bytes.byteLength,
          reason: 'unsupported',
        });
      }
      for (const f of [...images, ...(file ? [file] : [])]) {
        fileDecisions.record('ingest.media_file', {
          outcome: 'used',
          jobId: id,
          deckId: deck.id,
          kind: 'kind' in f ? (f.kind as string) : 'image',
          bytes: f.bytes,
        });
      }
      for (const u of unused) {
        fileDecisions.record('ingest.media_file', {
          outcome: 'unused',
          reason: u.reason,
          jobId: id,
          deckId: deck.id,
          bytes: u.bytes,
        });
      }
      const raw: IngestRaw = { images };
      if (file) raw.file = file;
      if (unused.length > 0) raw.unused = unused;
      if (s.text?.trim()) raw.text = s.text;
      if (s.url) raw.url = s.url;
      if (s.title?.trim()) raw.title = s.title.trim();
      if (s.timeZone) raw.timeZone = s.timeZone;

      await jobs.create({
        id,
        userId: user.id,
        deckId: deck.id,
        channel,
        status: 'queued',
        raw,
      });
      await queue.enqueue(id);
      return { id, status: 'queued' };
    },

    /**
     * A proposal made as is (AI apps in Phase 13, later bulk import and agents): a `proposed` job
     * with no fetch, extraction or llm_calls, then the worker's post-extraction steps. Needs
     * `item.create` on the deck and counts against the same caps as POST /ingest.
     */
    async proposeDirect(p: DirectProposal): Promise<DirectProposalResult> {
      const deck = await resolveDeck(decks, p.deck, p.user);
      const role = await authorize(p.user, deck, 'item.create', memberships);
      const card = parseDirectDraft(p.draft);
      const newCategory = suggestedCategory(p.draft.newCategory);
      const categoryIds = await draftCategories(deck.id, role, card.categoryIds ?? []);
      if (p.targetItemId) await assertTarget(deck.id, role, p.targetItemId);
      await assertWithinCaps(p.user.id, p.channel);

      const id = newId();
      if (p.draft.type === LEGACY_IMAGE_TYPE) {
        aliasDecisions.record('item.type_alias', {
          outcome: 'accepted',
          reason: 'image',
          jobId: id,
          actorId: p.user.id,
          deckId: deck.id,
          route: 'ingest',
        });
      }
      const clientLabel = p.clientLabel?.trim().slice(0, INGEST_CLIENT_LABEL_MAX) || null;
      await jobs.create({
        id,
        userId: p.user.id,
        deckId: deck.id,
        channel: p.channel,
        clientLabel,
        status: 'proposed',
        raw: { ...(card.sourceUrl ? { url: card.sourceUrl } : {}), images: [] },
        normalized: null,
      });

      try {
        const { item, dedup } = await proposeItem(
          {
            categories: deps.categories,
            items: deps.items,
            jobs,
            dedup: deps.dedup,
            embedQueue: deps.embedQueue,
            linkSnapshotQueue: deps.linkSnapshotQueue,
            now,
            log,
          },
          {
            job: { id, deckId: deck.id, userId: p.user.id, channel: p.channel },
            item: card,
            summary: {
              model: DIRECT_PROPOSAL_MODEL,
              escalated: false,
              type: card.type as (typeof directCardTypes)[number],
              confidence: 1,
              language: 'und',
              categoryIds,
              newCategory,
            },
            targetItemId: p.targetItemId ?? null,
          },
        );
        return { jobId: id, itemId: item.id, dedup };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await jobs.setStatus(id, 'failed', `error: ${message}`.slice(0, 500), now());
        throw err;
      }
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
