import type { Deck, Item, ItemPage } from '@pb/shared';
import { searchCards } from '@pb/db/test/search-cards';
import {
  ApiCliError,
  cardsToCreate,
  createApiClient,
  parseApiCliArgs,
  type ApiRequest,
} from './lib/api-cli';

/**
 * D82: `pnpm search:load [--deck search-demo]` writes the search fixture cards through the API
 * as the owner (bearer). Creates the deck if missing; idempotent by title. Delete the deck to undo.
 */
async function ensureDeck(request: ApiRequest, slug: string): Promise<Deck> {
  try {
    return await request<Deck>('GET', `/decks/${slug}`);
  } catch (err) {
    if (!(err instanceof ApiCliError) || err.status !== 404) throw err;
    console.log(`creating deck ${slug}`);
    return request<Deck>('POST', '/decks', { name: 'Search demo', slug, kind: 'shared' });
  }
}

async function existingTitles(request: ApiRequest, slug: string): Promise<Set<string>> {
  const titles = new Set<string>();
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: ItemPage = await request<ItemPage>('GET', `/decks/${slug}/items?limit=100${query}`);
    for (const item of page.data) titles.add(item.title);
    cursor = page.nextCursor;
  } while (cursor);
  return titles;
}

async function main(): Promise<void> {
  const opts = parseApiCliArgs(process.argv.slice(2));
  const request = createApiClient(opts);
  const deck = await ensureDeck(request, opts.deck);
  const todo = cardsToCreate(searchCards, await existingTitles(request, deck.slug));
  for (const { key, card } of todo) {
    const item = await request<Item>('POST', `/decks/${deck.slug}/items`, card);
    console.log(`+ ${key} (${item.id})`);
  }
  console.log(
    `${deck.slug}: ${todo.length} created, ${searchCards.length - todo.length} already there`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
