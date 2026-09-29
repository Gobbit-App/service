import pg from 'pg';
import { itemCreateSchema } from '@pb/shared';
import { seedId, buildSeedData, DEFAULT_DEV_EMAIL } from './data';
import { seedCards } from './cards';

export async function runSeed(
  pool: pg.Pool,
  opts?: { devEmail?: string },
): Promise<{ items: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const data = buildSeedData(opts?.devEmail ?? DEFAULT_DEV_EMAIL);

    // Validate seed cards
    for (const sc of seedCards) {
      try {
        itemCreateSchema.parse(sc.card);
      } catch (err) {
        throw new Error(
          `Invalid seed card "${sc.key}": ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }

    // Upsert accounts
    for (const account of data.accounts) {
      await client.query(
        `INSERT INTO accounts AS t (id, name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name
         WHERE (t.name) IS DISTINCT FROM (EXCLUDED.name)`,
        [account.id, account.name],
      );
    }

    // Upsert users
    for (const user of data.users) {
      await client.query(
        `INSERT INTO users AS t (id, account_id, email, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name
         WHERE (t.account_id, t.email, t.display_name) IS DISTINCT FROM
           (EXCLUDED.account_id, EXCLUDED.email, EXCLUDED.display_name)`,
        [user.id, user.accountId, user.email, user.displayName],
      );
    }

    // Upsert pocketbooks
    for (const pb of data.pocketbooks) {
      await client.query(
        `INSERT INTO pocketbooks AS t (id, kind, slug, name, owner_account_id, is_public)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           owner_account_id = EXCLUDED.owner_account_id,
           is_public = EXCLUDED.is_public
         WHERE (t.kind, t.slug, t.name, t.owner_account_id, t.is_public) IS DISTINCT FROM
           (EXCLUDED.kind, EXCLUDED.slug, EXCLUDED.name, EXCLUDED.owner_account_id,
            EXCLUDED.is_public)`,
        [pb.id, pb.kind, pb.slug, pb.name, pb.ownerAccountId, pb.isPublic],
      );
    }

    // Upsert categories
    for (const cat of data.categories) {
      await client.query(
        `INSERT INTO categories AS t (id, pocketbook_id, slug, name, visibility, is_default, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           pocketbook_id = EXCLUDED.pocketbook_id,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           visibility = EXCLUDED.visibility,
           is_default = EXCLUDED.is_default,
           position = EXCLUDED.position
         WHERE (t.pocketbook_id, t.slug, t.name, t.visibility, t.is_default, t.position) IS DISTINCT FROM
           (EXCLUDED.pocketbook_id, EXCLUDED.slug, EXCLUDED.name, EXCLUDED.visibility,
            EXCLUDED.is_default, EXCLUDED.position)`,
        [cat.id, cat.pocketbookId, cat.slug, cat.name, cat.visibility, false, cat.position],
      );
    }

    // Insert items
    const familyPocketbookId = seedId('pocketbook/family');
    const devUserId = seedId('user/dev');
    const baseTime = Date.UTC(2026, 0, 1);
    const verifiedAtStr = '2026-01-01T00:00:00.000Z';

    for (let i = 0; i < seedCards.length; i++) {
      const sc = seedCards[i];
      const createdAtMs = baseTime - i * 3600_000;
      const createdAtDate = new Date(createdAtMs);
      const createdAtStr = createdAtDate.toISOString();

      const parsedCard = itemCreateSchema.parse(sc.card);
      const sourceUrl =
        parsedCard.type === 'link' ? (parsedCard.payload as { url: string }).url : null;
      const sourceKind = parsedCard.type === 'link' ? 'link' : 'manual';
      const payloadJson = JSON.stringify(parsedCard.payload);

      await client.query(
        `INSERT INTO items AS t (id, pocketbook_id, type, status, title, body, payload, source_url, source_kind, verified_at, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::timestamptz, $11, $12::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type,
           status = EXCLUDED.status,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           payload = EXCLUDED.payload,
           source_url = EXCLUDED.source_url,
           source_kind = EXCLUDED.source_kind,
           verified_at = EXCLUDED.verified_at,
           created_at = EXCLUDED.created_at
         WHERE (t.type, t.status, t.title, t.body, t.payload, t.source_url, t.source_kind, t.verified_at, t.created_at) IS DISTINCT FROM
           (EXCLUDED.type, EXCLUDED.status, EXCLUDED.title, EXCLUDED.body, EXCLUDED.payload,
            EXCLUDED.source_url, EXCLUDED.source_kind, EXCLUDED.verified_at, EXCLUDED.created_at)`,
        [
          seedId(sc.key),
          familyPocketbookId,
          parsedCard.type,
          sc.status,
          parsedCard.title,
          parsedCard.body,
          payloadJson,
          sourceUrl,
          sourceKind,
          verifiedAtStr,
          devUserId,
          createdAtStr,
        ],
      );
    }

    // Insert item_categories
    for (const sc of seedCards) {
      const itemId = seedId(sc.key);

      for (const categorySlug of sc.categories) {
        const categoryId = seedId(`family/${categorySlug}`);
        await client.query(
          `INSERT INTO item_categories (item_id, category_id, pocketbook_id, created_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (item_id, category_id) DO NOTHING`,
          [itemId, categoryId, familyPocketbookId],
        );
      }
    }

    // Insert favorites
    for (const sc of seedCards) {
      if (sc.favorite) {
        const itemId = seedId(sc.key);
        await client.query(
          `INSERT INTO favorites (user_id, item_id, created_at)
           VALUES ($1, $2, now())
           ON CONFLICT (user_id, item_id) DO NOTHING`,
          [devUserId, itemId],
        );
      }
    }

    await client.query('COMMIT');
    return { items: seedCards.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { seedId, buildSeedData, DEFAULT_DEV_EMAIL, OTHER_EMAIL } from './data';
export { seedCards } from './cards';
