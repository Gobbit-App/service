import {
  INGEST_CHANNEL_DAILY_CAPS,
  type ImportFailure,
  type ImportRequest,
  type ImportResult,
} from '@gobbit/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { HttpError } from '../errors/http-errors';
import { assertImportRows } from '../ingest/import-rows';
import type { ImportDecisions } from '../imports/imports.events';
import type { DecisionLogger } from '../lib/decision-event';
import { childLogger } from '../lib/logger';
import { resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CurrentUser } from '../types';
import type { IngestService } from './ingest.service';
import type { MediaReferenceCheck } from './media-reference';
import type { CardCover } from '@gobbit/shared/card-cover';

const log = childLogger('imports');

const RATE_LIMITED = '/problems/rate-limited';
const UNMATCHED = '/problems/import-unmatched-category';
const UNKNOWN_FILE = '/problems/import-unknown-file';
const TOO_MANY = '/problems/import-too-many-new-categories';

/**
 * D190: bulk import of already parsed notes. Each row is a direct proposal (channel `import`,
 * the label as client label), run one after another; a cap hit stops the loop and the rest
 * are reported failed, so the caller keeps what was imported.
 */
export function createImportsService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  ingest: Pick<IngestService, 'proposeDirect'>;
  decisions: DecisionLogger<ImportDecisions>;
  /** D406/D444: a row's cover and media files must be recorded for this deck. */
  coverReference: (deckId: string, cover: { publicId: string }) => Promise<CardCover>;
  mediaReference: MediaReferenceCheck;
  /** D447: rows per user per rolling day, reported on the `daily_cap` event. */
  dailyCap?: number;
}) {
  const dailyCap = deps.dailyCap ?? INGEST_CHANNEL_DAILY_CAPS.import!;
  return {
    async importRows(
      user: CurrentUser,
      deckRef: string,
      req: ImportRequest,
      ctx: { requestId: string },
    ): Promise<ImportResult> {
      const deck = await resolveDeck(deps.decks, deckRef, user);
      await authorize(user, deck, 'item.publish', deps.memberships);
      // D446/D451: rows naming unmatched categories are refused (strict) or reduced to one suggestion.
      const failed: ImportFailure[] = [];
      const refusals = {
        unmatched_category: 0,
        too_many_new_categories: 0,
        invalid_row: 0,
        daily_cap: 0,
      };
      const covers = new Map<number, CardCover>();
      const sendable: { index: number; row: ImportRequest['rows'][number] }[] = [];
      for (const [index, row] of req.rows.entries()) {
        const names = [
          ...new Set([row.newCategory, ...(row.unmatched ?? [])].filter(Boolean)),
        ] as string[];
        const unmatched = row.unmatched ?? [];
        if (req.strict && unmatched.length > 0) {
          refusals.unmatched_category += 1;
          failed.push({
            index,
            problem: UNMATCHED,
            detail: `No category named ${unmatched.join(', ')}`,
          });
        } else if (!req.strict && names.length > 1) {
          refusals.too_many_new_categories += 1;
          failed.push({
            index,
            problem: TOO_MANY,
            detail: `A card can suggest one new category, this one names ${names.join(', ')}`,
          });
        } else {
          let next = names[0] ? { ...row, newCategory: names[0] } : row;
          try {
            // The same "Unknown ..." message whether the file is missing or in another deck.
            if (row.cover) covers.set(index, await deps.coverReference(deck.id, row.cover));
            if (row.payload) {
              next = {
                ...next,
                payload: (await deps.mediaReference(
                  deck.id,
                  'media',
                  row.payload,
                )) as typeof row.payload,
              };
            }
          } catch (err) {
            if (!(err instanceof HttpError)) throw err;
            refusals.invalid_row += 1;
            failed.push({ index, problem: UNKNOWN_FILE, detail: err.detail ?? err.title });
            continue;
          }
          sendable.push({ index, row: next });
        }
      }
      let refused = failed.length;
      const indexes = sendable.map((s) => s.index);
      // D190: one bad row refuses the whole request; D451: still count every bad row, once.
      let invalid: unknown;
      const drafts = sendable.flatMap((s) => {
        try {
          return assertImportRows([s.row], [s.index]);
        } catch (err) {
          refusals.invalid_row += 1;
          invalid ??= err;
          return [];
        }
      });

      if (invalid) {
        deps.decisions.record('imports.rows_refused', {
          outcome: 'refused',
          reason: 'invalid_row',
          count: refusals.invalid_row,
          requestId: ctx.requestId,
          actorId: user.id,
          deckId: deck.id,
        });
        throw invalid;
      }

      let imported = 0;
      let duplicates = 0;
      const finish = (): ImportResult => {
        const base = { requestId: ctx.requestId, actorId: user.id, deckId: deck.id };
        for (const [reason, count] of Object.entries(refusals)) {
          if (count === 0) continue;
          deps.decisions.record('imports.rows_refused', {
            outcome: 'refused',
            reason: reason as keyof typeof refusals,
            count,
            ...(reason === 'daily_cap' ? { cap: dailyCap } : {}),
            ...base,
          });
        }
        deps.decisions.record('imports.completed', {
          outcome: 'accepted',
          imported,
          duplicates,
          refused,
          ...base,
        });
        failed.sort((x, y) => x.index - y.index);
        return { imported, duplicates, refused, failed };
      };
      for (const [position, draft] of drafts.entries()) {
        const index = indexes[position]!;
        try {
          const { dedup } = await deps.ingest.proposeDirect({
            user,
            deck: deck.id,
            draft,
            channel: 'import',
            ...(covers.has(index) ? { cover: covers.get(index)! } : {}),
            clientLabel: req.label,
          });
          imported += 1;
          if (dedup && dedup.action !== 'new') duplicates += 1;
        } catch (err) {
          if (err instanceof HttpError && err.type === RATE_LIMITED) {
            // Nothing imported yet: the caller gets the 429 with Retry-After.
            if (imported === 0 && failed.length === 0) {
              refusals.daily_cap = indexes.length - position;
              refused += refusals.daily_cap;
              finish();
              throw err;
            }
            const retryAfter = Number(err.headers['Retry-After'] ?? 0);
            const detail = `Daily import limit reached, try again after ${new Date(Date.now() + retryAfter * 1000).toISOString()}`;
            for (const rest of indexes.slice(position)) {
              failed.push({ index: rest, problem: RATE_LIMITED, detail });
            }
            refusals.daily_cap = indexes.length - position;
            refused += refusals.daily_cap;
            break;
          }
          failed.push(failureOf(err, index, deck.id));
        }
      }
      return finish();
    },
  };
}

function failureOf(err: unknown, index: number, deckId: string): ImportFailure {
  if (err instanceof HttpError) {
    return { index, problem: err.type, ...(err.detail ? { detail: err.detail } : {}) };
  }
  log.error({ err, deckId, index }, 'import row failed');
  return { index, problem: '/problems/internal' };
}

export type ImportsService = ReturnType<typeof createImportsService>;
