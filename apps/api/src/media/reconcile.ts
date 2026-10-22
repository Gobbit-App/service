/** Tags of the upload paths that existed before assets were recorded (research § Legacy uploads). */
export const RECONCILE_TAGS = ['editor', 'ingest'] as const;

export interface ReconcileArgs {
  delete: boolean;
}

/** `--delete` is the only flag; anything else is refused so a typo never deletes by surprise. */
export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  const unknown = argv.filter((a) => a !== '--delete');
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  return { delete: argv.includes('--delete') };
}

/** Listed public ids without an asset row, in listing order and without duplicates. */
export function unrecorded(listed: string[], recorded: Set<string>): string[] {
  return [...new Set(listed)].filter((id) => !recorded.has(id));
}
