import { readFile } from 'node:fs/promises';
import { createApiClient } from './lib/api-cli';
import { parseImportNotesArgs, runImportNotes } from './lib/import-notes-cli';

/**
 * D190: `pnpm import:notes <file> --deck <slug> [--dry-run]` turns a notes file into proposed
 * cards through `POST /decks/{id}/imports` (same parser as the web import screen); they wait
 * in the review queue under the file name. Needs `GOBBIT_API_URL` and `GOBBIT_TOKEN`.
 */
async function main(): Promise<number> {
  const opts = parseImportNotesArgs(process.argv.slice(2));
  const text = await readFile(opts.file, 'utf8');
  const request =
    opts.baseUrl && opts.token
      ? createApiClient({ baseUrl: opts.baseUrl, token: opts.token })
      : null;
  return runImportNotes(text, opts, request);
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
