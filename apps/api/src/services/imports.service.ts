import type { ImportFailure, ImportRequest, ImportResult } from '@gobbit/shared';
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

const log = childLogger('imports');

const RATE_LIMITED = '/problems/rate-limited';
const UNMATCHED = '/problems/import-unmatched-category';
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
}) {
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
      const refusals = { unmatched_category: 0, too_many_new_categories: 0 };
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
          sendable.push({ index, row: names[0] ? { ...row, newCategory: names[0] } : row });
        }
      }
      const refused = failed.length;
      const indexes = sendable.map((s) => s.index);
      const drafts = assertImportRows(
        sendable.map((s) => s.row),
        indexes,
      );

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
            clientLabel: req.label,
          });
          imported += 1;
          if (dedup && dedup.action !== 'new') duplicates += 1;
        } catch (err) {
          if (err instanceof HttpError && err.type === RATE_LIMITED) {
            // Nothing imported yet: the caller gets the 429 with Retry-After.
            if (imported === 0 && failed.length === 0) throw err;
            for (const rest of indexes.slice(position)) {
              failed.push({ index: rest, problem: RATE_LIMITED, detail: err.detail });
            }
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
