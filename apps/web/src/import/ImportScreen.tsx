import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { can } from '@gobbit/shared/authz';
import {
  matchCategory,
  parseNotes,
  type ImportParseResult,
  type ImportRunResult,
} from '@gobbit/shared/import';
import { problemMessages } from '../api/problem-messages';
import { categoriesQuery, deckQuery } from '../api/queries';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { deckHref } from '../ui/chip-order';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { ImportInput, type ImportSource } from './ImportInput';
import { ImportPreview } from './ImportPreview';
import { ImportResult } from './ImportResult';
import {
  PASTED_LABEL,
  importableRows,
  previewRows,
  rowsToDrafts,
  type PreviewRow,
} from './preview-rows';
import { useImportNotes } from './use-import-notes';

type Done = {
  result: ImportRunResult;
  sent: PreviewRow[];
  label: string;
  unmatched: string[];
};

/** Category names in the sent rows that the deck does not have (each once). */
function unmatchedNames(
  sent: readonly PreviewRow[],
  categories: Parameters<typeof matchCategory>[1],
) {
  return [
    ...new Set(sent.flatMap((r) => r.categories).filter((n) => !matchCategory(n, categories))),
  ];
}

/** D189/D190: paste or upload notes → preview → proposals in review; owners and maintainers. */
export function ImportScreen({ deckSlug }: { deckSlug: string }): ReactElement {
  const deck = useQuery(deckQuery(deckSlug));
  const categories = useQuery(categoriesQuery(deckSlug));
  const importNotes = useImportNotes(deckSlug);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [ignored, setIgnored] = useState<ImportParseResult['ignored']>([]);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  if (deck.isPending || categories.isPending) return <LoadingState label="Loading…" />;
  if (!deck.data) {
    return (
      <ErrorState
        message={accessErrorCopy(deck.error, 'deck')}
        onRetry={isRetryable(deck.error) ? () => void deck.refetch() : undefined}
      />
    );
  }
  if (!can(deck.data.role, 'item.publish')) {
    return <ErrorState title="Not available" message="Only owners and maintainers import notes." />;
  }
  const categoryList = categories.data ?? [];

  const preview = (next: ImportSource) => {
    const parsed = parseNotes(next.text, next.format);
    setSource(next);
    setProblem(parsed.problem);
    setIgnored(parsed.ignored);
    setRows(parsed.problem ? null : previewRows(parsed.rows));
  };

  const runImport = (current: PreviewRow[]) => {
    const sent = importableRows(current);
    const label = source?.fileName ?? PASTED_LABEL;
    const strict = source?.strict ?? false;
    importNotes.mutate(
      { label, strict, drafts: rowsToDrafts(sent, categoryList, strict) },
      {
        onSuccess: (result) =>
          setDone({ result, sent, label, unmatched: unmatchedNames(sent, categoryList) }),
      },
    );
  };

  const startOver = () => {
    setRows(null);
    setDone(null);
    setSource(null);
    importNotes.reset();
  };

  return (
    <div className="import-screen">
      <h2 className="deck-admin__title">Import notes</h2>
      {done ? (
        <ImportResult
          result={done.result}
          sent={done.sent}
          unmatched={done.unmatched}
          reviewHref={`${deckHref(deckSlug, 'review')}?source=${encodeURIComponent(done.label)}`}
          onAgain={startOver}
        />
      ) : rows ? (
        <>
          {importNotes.error && (
            <div className="form-error" role="alert">
              {problemMessages(importNotes.error).map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <ImportPreview
            rows={rows}
            ignored={ignored}
            categories={categoryList}
            strict={source?.strict}
            busy={importNotes.isPending}
            onChange={setRows}
            onImport={() => runImport(rows)}
            onBack={() => setRows(null)}
          />
        </>
      ) : (
        <>
          <p className="settings-notice">
            Each note becomes a proposed card in review. Nothing is published until you approve it.
          </p>
          {problem && (
            <p className="form-error" role="alert">
              {problem}
            </p>
          )}
          <ImportInput initial={source} onPreview={preview} />
        </>
      )}
    </div>
  );
}
