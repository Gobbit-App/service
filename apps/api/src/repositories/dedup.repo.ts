import { and, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { assets, eventCards, items, type Db } from '@gobbit/db';
import { escapeLike, toVectorLiteral } from './search.repo';

/** How many same-host items are compared by normalized URL (family-scale decks). */
const SOURCE_URL_CANDIDATES = 200;
/** How many same-day events are compared (D376). */
const EVENT_CANDIDATES = 100;

/** D376: an event on the proposal's start date, compared by the caller. */
export interface EventCandidate {
  id: string;
  title: string;
  url: string | null;
  sourceUrl: string | null;
}

export interface DedupMatch {
  itemId: string;
  similarity: number;
}

/**
 * D103: lookups for the dedup verdict. Candidates are live published or proposed items in the
 * same deck, excluding the new proposal itself; category visibility is not applied because the
 * verdict is shown to publishers only.
 */
export function createDedupRepo(db: Db) {
  function candidatesWhere(deckId: string, excludeId: string): SQL {
    return and(
      eq(items.deckId, deckId),
      inArray(items.status, ['published', 'proposed']),
      isNull(items.deletedAt),
      ne(items.id, excludeId),
      // D292: a reminder is never a duplicate target (ingest never proposes reminders)
      ne(items.type, 'reminder'),
      // D376: an event is compared only with events (eventCandidates)
      ne(items.type, 'event'),
    )!;
  }

  return {
    /**
     * D396: a media card of the deck (proposed, published or archived, not deleted; not the
     * proposal itself) holding a file with the same content fingerprint as any of `publicIds`.
     * A gallery matches through any of its photos.
     */
    async mediaFileMatch(
      deckId: string,
      excludeId: string,
      publicIds: readonly string[],
    ): Promise<string | null> {
      if (publicIds.length === 0) return null;
      const result = await db.execute<{ id: string }>(sql`
        SELECT i.id FROM ${items} i
        JOIN ${assets} a ON a.deck_id = i.deck_id
         AND (i.payload @> jsonb_build_object('images', jsonb_build_array(jsonb_build_object('publicId', a.public_id)))
           OR i.payload @> jsonb_build_object('publicId', a.public_id))
        WHERE i.deck_id = ${deckId}
          AND i.id <> ${excludeId}
          AND i.type = 'media'
          AND i.status IN ('proposed', 'published', 'archived')
          AND i.deleted_at IS NULL
          AND a.etag IN (
            SELECT etag FROM ${assets}
            WHERE deck_id = ${deckId} AND etag IS NOT NULL
              AND public_id IN (${sql.join(
                publicIds.map((id) => sql`${id}`),
                sql`, `,
              )})
          )
        ORDER BY i.created_at
        LIMIT 1`);
      return result.rows[0]?.id ?? null;
    },

    /** Items in the deck whose `source_url` mentions `host` (normalized and compared by the caller). */
    async sourceUrlCandidates(
      deckId: string,
      excludeId: string,
      host: string,
    ): Promise<{ id: string; sourceUrl: string }[]> {
      const rows = await db
        .select({ id: items.id, sourceUrl: items.sourceUrl })
        .from(items)
        .where(
          and(
            candidatesWhere(deckId, excludeId),
            isNotNull(items.sourceUrl),
            sql`${items.sourceUrl} ilike ${`%${escapeLike(host)}%`}`,
          ),
        )
        // Published first, so an update targets the live card rather than another proposal.
        .orderBy(sql`${items.status} = 'published' desc`, desc(items.createdAt))
        .limit(SOURCE_URL_CANDIDATES);
      return rows.flatMap((r) => (r.sourceUrl ? [{ id: r.id, sourceUrl: r.sourceUrl }] : []));
    },

    /** Nearest item by cosine similarity among vectors made by `model` (D74). */
    async nearest(
      deckId: string,
      excludeId: string,
      vector: readonly number[],
      model: string,
    ): Promise<DedupMatch | null> {
      const v = sql`${toVectorLiteral(vector)}::vector`;
      const [row] = await db
        .select({ itemId: items.id, distance: sql<number>`${items.embedding} <=> ${v}` })
        .from(items)
        .where(and(candidatesWhere(deckId, excludeId), eq(items.embeddingModel, model)))
        .orderBy(sql`${items.embedding} <=> ${v}`)
        .limit(1);
      return row ? { itemId: row.itemId, similarity: 1 - Number(row.distance) } : null;
    },

    /**
     * D376: live and proposed events in the deck that start on the same date (in each event's own
     * zone) as event proposal `itemId`, whose `event_cards` row the insert trigger already wrote.
     */
    async eventCandidates(deckId: string, itemId: string): Promise<EventCandidate[]> {
      const startDate = sql`(${eventCards.startsAt} at time zone ${eventCards.timeZone})::date`;
      const proposalDate = sql`(select (e.starts_at at time zone e.time_zone)::date from event_cards e where e.item_id = ${itemId})`;
      const rows = await db
        .select({
          id: items.id,
          title: items.title,
          url: sql<string | null>`${items.payload}->>'url'`,
          sourceUrl: items.sourceUrl,
        })
        .from(items)
        .innerJoin(eventCards, eq(eventCards.itemId, items.id))
        .where(
          and(
            eq(items.deckId, deckId),
            inArray(items.status, ['published', 'proposed']),
            isNull(items.deletedAt),
            ne(items.id, itemId),
            sql`${startDate} = ${proposalDate}`,
          ),
        )
        .orderBy(sql`${items.status} = 'published' desc`, desc(items.createdAt))
        .limit(EVENT_CANDIDATES);
      return rows;
    },

    /** Keyless fallback: the most similar title (`word_similarity` over normalized titles). */
    async titleMatch(deckId: string, excludeId: string, title: string): Promise<DedupMatch | null> {
      const sim = sql<number>`word_similarity(search_normalize(${title}), search_normalize(${items.title}))`;
      const [row] = await db
        .select({ itemId: items.id, similarity: sim })
        .from(items)
        .where(candidatesWhere(deckId, excludeId))
        .orderBy(desc(sim), desc(items.createdAt))
        .limit(1);
      return row ? { itemId: row.itemId, similarity: Number(row.similarity) } : null;
    },
  };
}

export type DedupRepo = ReturnType<typeof createDedupRepo>;
