import { useState, type ReactElement } from 'react';
import { matchCategory, type ImportCategory } from '@gobbit/shared/import';
import { bodyExcerpt, categoryStatus, type PreviewRow, type RowEdit } from './preview-rows';
import { Button } from '../ui/buttons/Button';

const CATEGORY_LABEL = {
  existing: 'existing category',
  new: 'new category',
  refused: 'not found, card refused',
} as const;

/** D189: one parsed note: tick, read, edit; an invalid row shows why and can't be ticked. */
export function ImportPreviewRow({
  row,
  categories,
  strict = false,
  onToggle,
  onEdit,
}: {
  row: PreviewRow;
  categories: readonly ImportCategory[];
  strict?: boolean;
  onToggle: () => void;
  onEdit: (edit: RowEdit) => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const at = `line ${row.line}`;
  const unmatched = row.categories.filter((name) => !matchCategory(name, categories)).length;

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
              value={row.categories[0] ?? ''}
              dir="auto"
              aria-label={`Category, ${at}`}
              onChange={(event) => onEdit({ category: event.currentTarget.value })}
            />
          </label>
          <Button icon="check" label="Done" variant="ghost" onClick={() => setEditing(false)} />
        </div>
      ) : (
        <div className="import-row__view">
          <p className="import-row__title" dir="auto">
            {row.title || '(no title)'}
          </p>
          {row.body && (
            <p className="import-row__body" dir="auto">
              {bodyExcerpt(row.body)}
            </p>
          )}
          {row.sourceUrl && <p className="import-row__url">{row.sourceUrl}</p>}
          {row.categories.length > 0 && (
            <p className="import-row__category">
              {row.categories.map((name) => (
                <span key={name} className="import-row__cat">
                  <span className="chip chip--small" dir="auto">
                    {name}
                  </span>{' '}
                  {CATEGORY_LABEL[categoryStatus(name, categories, strict) ?? 'existing']}
                </span>
              ))}
              {!strict && unmatched > 1 && (
                <span className="import-row__cat">only one new category per card</span>
              )}
            </p>
          )}
          <Button icon="edit" label="Edit" variant="ghost" onClick={() => setEditing(true)} />
        </div>
      )}
      {row.error && <p className="import-row__error">{row.error}</p>}
    </li>
  );
}
