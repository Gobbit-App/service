import type { SearchResponse } from '@gobbit/shared';
import { createApiClient, parseApiCliArgs } from './lib/api-cli';

/** D82: `pnpm search:query [--deck search-demo] <query…>` prints the fused hits with their `why`. */
async function main(): Promise<void> {
  const opts = parseApiCliArgs(process.argv.slice(2));
  const q = opts.positionals.join(' ').trim();
  if (!q) throw new Error('Usage: pnpm search:query [--deck <slug>] <query>');
  const request = createApiClient(opts);
  const res = await request<SearchResponse>(
    'GET',
    `/decks/${opts.deck}/search?q=${encodeURIComponent(q)}`,
  );
  console.log(
    `"${q}" in ${opts.deck} (semantic ${res.semantic ? 'on' : 'off'}): ${res.data.length} hit(s)`,
  );
  for (const [i, hit] of res.data.entries()) {
    console.log(
      `${String(i + 1).padStart(2)}. [${hit.why}] ${hit.score.toFixed(4)}  ${hit.item.title}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
