import type { ReactElement } from 'react';
import { IMPORT_ROWS_PER_PREVIEW } from '@gobbit/shared/ingest-constants';
import type { ImportCategory } from '@gobbit/shared/import';
import { ImportPreviewRow } from './ImportPreviewRow';
import {
  bodyExcerpt,
  editRow,
  importableRows,
  toggleRow,
  tooManyRows,
  type PreviewRow,
} from './preview-rows';
import { Button } from '../ui/buttons/Button';

/** D189: the parsed notes before anything is sent; too many rows must be split first. */
export function ImportPreview({
  rows,
  ignored = [],
  categories,
  strict = false,
  busy,
  onChange,
  onImport,
  onBack,
}: {
  rows: readonly PreviewRow[];
  /** Text outside any `##` section, left out of the rows (D443). */
  ignored?: readonly { line: number; text: string }[];
  categories: readonly ImportCategory[];
  strict?: boolean;
  busy: boolean;
  onChange: (rows: PreviewRow[]) => void;
  onImport: () => void;
  onBack: () => void;
}): ReactElement {
  const count = importableRows(rows).length;
  const invalid = rows.filter((row) => row.error !== null).length;
  const tooMany = tooManyRows(rows.length);
  const update = (key: number, change: (row: PreviewRow) => PreviewRow) =>
    onChange(rows.map((row) => (row.key === key ? change(row) : row)));

  return (
    <section className="import-preview" aria-label="Preview">
      <p className="import-preview__summary">
        {rows.length} {rows.length === 1 ? 'note' : 'notes'} found
        {invalid > 0 && `, ${invalid} can't be imported until edited`}.
      </p>
      {ignored.length > 0 && (
        <p className="settings-notice import-preview__ignored" role="note">
          Ignored text outside any ## card:
          {ignored.map((item) => (
            <span key={item.line} dir="auto">
              line {item.line}: {bodyExcerpt(item.text, 80)}
            </span>
          ))}
        </p>
      )}
      {tooMany ? (
        <p className="form-error" role="alert">
          That's more than {IMPORT_ROWS_PER_PREVIEW} notes. Split the file and import it in parts.
        </p>
      ) : (
        <ol className="import-preview__rows">
          {rows.map((row) => (
            <ImportPreviewRow
              key={row.key}
              row={row}
              categories={categories}
              strict={strict}
              onToggle={() => update(row.key, toggleRow)}
              onEdit={(edit) => update(row.key, (r) => editRow(r, edit))}
            />
          ))}
        </ol>
      )}
      <div className="import-preview__actions">
        <Button
          icon="file-import"
          label={busy ? 'Importing…' : `Import ${count} ${count === 1 ? 'card' : 'cards'}`}
          disabled={busy || tooMany || count === 0}
          onClick={onImport}
        />
        <Button icon="back" label="Back" variant="ghost" disabled={busy} onClick={onBack} />
      </div>
    </section>
  );
}
