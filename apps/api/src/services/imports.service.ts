import type { ImportFailure, ImportRequest, ImportResult } from '@gobbit/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { HttpError } from '../errors/http-errors';
import { assertImportRows } from '../ingest/import-rows';
import { childLogger } from '../lib/logger';
import { resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CurrentUser } from '../types';
import type { IngestService } from './ingest.service';

const log = childLogger('imports');

const RATE_LIMITED = '/problems/rate-limited';

/**
 * D190: bulk import of already parsed notes. Each row is a direct proposal (channel `import`,
 * the label as client label), run one after another; a cap hit stops the loop and the rest
 * are reported failed, so the caller keeps what was imported.
 */
export function createImportsService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  ingest: Pick<IngestService, 'proposeDirect'>;
}) {
  return {
    async importRows(
      user: CurrentUser,
      deckRef: string,
      req: ImportRequest,
    ): Promise<ImportResult> {
      const deck = await resolveDeck(deps.decks, deckRef, user);
      await authorize(user, deck, 'item.publish', deps.memberships);
      const drafts = assertImportRows(req.rows);

      let imported = 0;
      let duplicates = 0;
      const failed: ImportFailure[] = [];
      for (const [index, draft] of drafts.entries()) {
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
            for (let rest = index; rest < drafts.length; rest += 1) {
              failed.push({ index: rest, problem: RATE_LIMITED, detail: err.detail });
            }
            break;
          }
          failed.push(failureOf(err, index, deck.id));
        }
      }
      return { imported, duplicates, failed };
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
