import { useMemo, useState, type ReactElement } from 'react';
import type { Category, ItemPatch, PublishRequest, ReviewEntry } from '@pb/shared';
import { problemMessages } from '../api/problem-messages';
import { CardBody } from '../cards/CardBody';
import { itemCategories } from '../cards/Card';
import { useCloudName } from '../cards/use-cloud-name';
import { EntityChips } from '../cards/EntityChips';
import { ReviewDiff } from './ReviewDiff';
import { ReviewEditForm } from './ReviewEditForm';
import { reviewDiff } from './review-diff';
import { reviewMode, suggestedCategory } from './review-mode';
import { sourceLine } from './source-line';

const BANNERS = {
  duplicate: 'Looks like a card you already have',
  update: 'Updates an existing card',
} as const;

/** D106/D107: one proposal with its source, extracted details and the publish decision. */
export function ReviewCard({
  entry,
  categories,
  canCreateCategory,
  busy,
  now = new Date(),
  onPublish,
  onDiscard,
  onSaveEdit,
}: {
  entry: ReviewEntry;
  categories: readonly Category[];
  canCreateCategory: boolean;
  busy: boolean;
  now?: Date;
  onPublish: (request: Partial<PublishRequest>) => void;
  onDiscard: () => void;
  onSaveEdit: (patch: ItemPatch) => Promise<unknown>;
}): ReactElement {
  const { item, job } = entry;
  const cloudName = useCloudName();
  const mode = reviewMode(entry);
  const suggestion = suggestedCategory(entry, canCreateCategory);
  const [createCategory, setCreateCategory] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const chips = useMemo(() => itemCategories(item, categories), [item, categories]);
  const changes = useMemo(
    () => (mode.kind === 'new' ? [] : reviewDiff(item, mode.target)),
    [item, mode],
  );
  const titleId = `review-title-${item.id}`;
  const source = sourceLine(job, now);
  const withCategory = suggestion && createCategory ? { createCategory: true } : {};

  const saveEdit = async (patch: ItemPatch) => {
    setSaving(true);
    setEditErrors([]);
    try {
      await onSaveEdit(patch);
      setEditing(false);
    } catch (error) {
      setEditErrors(problemMessages(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card review-card" aria-labelledby={titleId}>
      {source && <p className="review-card__source">{source}</p>}
      {job?.sourcePreview && (
        <p className="review-card__preview" dir="auto">
          {job.sourcePreview}
        </p>
      )}

      {editing ? (
        <ReviewEditForm
          item={item}
          categories={categories}
          saving={saving}
          errors={editErrors}
          onSave={(patch) => void saveEdit(patch)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <h2 className="card__title" id={titleId} dir="auto">
            {item.title}
          </h2>
          <CardBody item={item} cloudName={cloudName} />
          <EntityChips entities={item.entities} />
          {chips.length > 0 && (
            <ul className="card__chips" aria-label="Categories">
              {chips.map((category) => (
                <li key={category.id} className="chip chip--small">
                  {category.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {mode.kind !== 'new' && (
        <section className="review-card__dedup" aria-label="Existing card">
          <p className="review-card__banner">
            {BANNERS[mode.kind]}: <strong dir="auto">{mode.target.title}</strong>
          </p>
          <ReviewDiff changes={changes} />
        </section>
      )}

      {suggestion && (
        <label className="review-card__new-category">
          <input
            type="checkbox"
            checked={createCategory}
            onChange={(event) => setCreateCategory(event.currentTarget.checked)}
          />
          Create category “{suggestion}”
        </label>
      )}

      {!editing && (
        <div className="review-card__buttons">
          {mode.kind === 'new' ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => onPublish({ mode: 'new', ...withCategory })}
            >
              Publish
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => onPublish({ mode: 'update', ...withCategory })}
              >
                Apply update
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => onPublish({ mode: 'new', ...withCategory })}
              >
                Publish as new
              </button>
            </>
          )}
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            type="button"
            className="button button--ghost review-card__discard"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      )}
    </article>
  );
}
