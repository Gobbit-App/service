import { useState, type ReactElement } from 'react';
import type { ImportCategory } from '@pb/shared/import';
import { categoryStatus, type PreviewRow, type RowEdit } from './preview-rows';

/** D189: one parsed note: tick, read, edit; an invalid row shows why and can't be ticked. */
export function ImportPreviewRow({
  row,
  categories,
  onToggle,
  onEdit,
}: {
  row: PreviewRow;
  categories: readonly ImportCategory[];
  onToggle: () => void;
  onEdit: (edit: RowEdit) => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const status = categoryStatus(row.category, categories);
  const at = `line ${row.line}`;

  return (
    <li className={row.error ? 'import-row import-row--invalid' : 'import-row'}>
      <label className="import-row__tick">
        <input
          type="checkbox"
          checked={row.included}
          disabled={row.error !== null}
          onChange={onToggle}
          aria-label={`Import ${at}`}
        />
        <span className="import-row__line">{at}</span>
      </label>
      {editing ? (
        <div className="import-row__edit">
          <label className="field">
            <span className="field__label">Title</span>
            <input
              value={row.title}
              dir="auto"
              aria-label={`Title, ${at}`}
              onChange={(event) => onEdit({ title: event.currentTarget.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Text</span>
            <textarea
              rows={3}
              value={row.body}
              dir="auto"
              aria-label={`Text, ${at}`}
              onChange={(event) => onEdit({ body: event.currentTarget.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Category</span>
            <input
              value={row.category ?? ''}
              dir="auto"
              aria-label={`Category, ${at}`}
              onChange={(event) => onEdit({ category: event.currentTarget.value })}
            />
          </label>
          <button type="button" className="button button--ghost" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      ) : (
        <div className="import-row__view">
          <p className="import-row__title" dir="auto">
            {row.title || '(no title)'}
          </p>
          {row.body && (
            <p className="import-row__body" dir="auto">
              {row.body}
            </p>
          )}
          {row.sourceUrl && <p className="import-row__url">{row.sourceUrl}</p>}
          {row.category && (
            <p className="import-row__category">
              <span className="chip chip--small" dir="auto">
                {row.category}
              </span>{' '}
              {status === 'new' ? 'new category' : 'existing category'}
            </p>
          )}
          <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
      {row.error && <p className="import-row__error">{row.error}</p>}
    </li>
  );
}
