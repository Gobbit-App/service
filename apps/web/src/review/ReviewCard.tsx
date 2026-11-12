import { useMemo, useState, type ReactElement } from 'react';
import type { Category, Deck, ItemPatch, PublishRequest, ReviewEntry } from '@gobbit/shared';
import { problemMessages } from '../api/problem-messages';
import { editHref } from '../cards/can-edit-item';
import { CardBar } from '../cards/CardBar';
import { CoverBar } from '../cards/CoverBar';
import { CardBody } from '../cards/CardBody';
import { itemCategories } from '../cards/Card';
import { useCloudName } from '../cards/use-cloud-name';
import { EntityChips } from '../cards/EntityChips';
import { IconButton } from '../ui/buttons/IconButton';
import { MoreMenu } from '../ui/MoreMenu';
import { ReviewDiff } from './ReviewDiff';
import { ReviewEditForm } from './ReviewEditForm';
import { reviewDiff } from './review-diff';
import { REVIEW_BANNER, reviewMode, suggestedCategory } from './review-mode';
import { CreateCategoryToggle, PublishButtons } from './PublishButtons';
import { heldLine } from './held-line';
import { fallbackLine } from './fallback-line';
import { sourceLine } from './source-line';

/** D106/D107: one proposal with its source, extracted details and the publish decision. */
export function ReviewCard({
  entry,
  deck,
  categories,
  canCreateCategory,
  busy,
  selection,
  now = new Date(),
  onPublish,
  onDiscard,
  onSaveEdit,
}: {
  entry: ReviewEntry;
  deck: Deck;
  categories: readonly Category[];
  canCreateCategory: boolean;
  busy: boolean;
  /** D191: select mode's checkbox (absent outside select mode). */
  selection?: { checked: boolean; onToggle: () => void };
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
  const held = heldLine(job);
  const fallback = fallbackLine(job);
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
      {selection && (
        <label className="review-card__select">
          <input type="checkbox" checked={selection.checked} onChange={selection.onToggle} />
          Select <span dir="auto">{item.title}</span>
        </label>
      )}
      {source && <p className="review-card__source">{source}</p>}
      {held && <p className="review-card__held">{held}</p>}
      {fallback && <p className="review-card__held">{fallback}</p>}
      {job?.sourcePreview && (
        <p className="review-card__preview" dir="auto">
          {job.sourcePreview}
        </p>
      )}

      {editing ? (
        <ReviewEditForm
          item={item}
          deck={deck}
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
          <CoverBar cover={item.cover} />
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
            {REVIEW_BANNER[mode.kind]}: <strong dir="auto">{mode.target.title}</strong>
          </p>
          <ReviewDiff changes={changes} />
        </section>
      )}

      {suggestion && (
        <CreateCategoryToggle
          name={suggestion}
          checked={createCategory}
          onChange={setCreateCategory}
        />
      )}

      {!editing && (
        <CardBar>
          <PublishButtons mode={mode} busy={busy} extra={withCategory} onPublish={onPublish} />
          <IconButton
            icon="edit"
            label="Edit"
            tip="Edit here"
            disabled={busy}
            onClick={() => setEditing(true)}
          />
          <IconButton
            icon="reject"
            label="Discard"
            tone="danger"
            disabled={busy}
            onClick={onDiscard}
          />
          <MoreMenu
            disabled={busy}
            actions={[
              {
                key: 'edit-fully',
                label: 'Edit fully',
                icon: 'external',
                href: editHref(item.id, { from: 'review' }),
              },
            ]}
          />
        </CardBar>
      )}
    </article>
  );
}
