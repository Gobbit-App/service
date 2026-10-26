import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type { Category, Deck, Item, ItemPatch } from '@pb/shared';
import { editHref } from '../cards/can-edit-item';
import { DiscardChangesDialog } from '../editor/DiscardChangesDialog';
import { draftFromItem, toPatch, type Draft, type LinkDraftPayload } from '../editor/draft';
import { BodyField } from '../editor/fields/BodyField';
import { CategoryChips } from '../editor/fields/CategoryChips';
import { LinkFields } from '../editor/fields/LinkFields';
import { TitleField } from '../editor/fields/TitleField';
import { useEditorBaseline } from '../editor/use-editor-baseline';
import { useLeaveGuard } from '../editor/use-leave-guard';
import { errorCount, validateDraft, type FieldErrors } from '../editor/validate';
import { Button } from '../ui/buttons/Button';
import { ButtonLink } from '../ui/buttons/ButtonLink';

const FORM_FIELDS = new Set(['title', 'body', 'categoryIds']);

function formErrors(errors: FieldErrors, type: Draft['type']): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([path]) => FORM_FIELDS.has(path) || (type === 'link' && path.startsWith('payload.')),
    ),
  );
}

/**
 * D107 / FR-016: inline edit of a proposal before publishing (title, text, link, categories)
 * on the editor's draft model and fields; "Edit fully" opens the full editor.
 * 022 FR-010: Cancel and leaving the page ask before dropping changes (no draft is kept here).
 */
export function ReviewEditForm({
  item,
  deck,
  categories,
  saving,
  errors,
  onSave,
  onCancel,
}: {
  item: Item;
  deck: Deck;
  categories: readonly Category[];
  saving: boolean;
  errors: readonly string[];
  onSave: (patch: ItemPatch) => void;
  onCancel: () => void;
}): ReactElement {
  const { baseline, isChanged } = useEditorBaseline(() => draftFromItem(item));
  const [draft, setDraft] = useState<Draft>(baseline);
  const [askingCancel, setAskingCancel] = useState(false);
  const changed = isChanged(draft);
  const leaveDialog = useLeaveGuard({ when: changed });
  const update = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }));

  // Only the fields this form shows are checked; the full editor covers the rest.
  const fieldErrors = useMemo(
    () =>
      formErrors(
        validateDraft(draft, { categoriesOptional: item.status === 'proposed' }),
        draft.type,
      ),
    [draft, item.status],
  );
  const shown = changed ? fieldErrors : {};

  const cancel = () => (changed ? setAskingCancel(true) : onCancel());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (errorCount(fieldErrors) > 0) return;
    const patch = toPatch(item, draft);
    if (patch) onSave(patch);
    else onCancel();
  };

  return (
    <form className="card-editor review-edit" onSubmit={handleSubmit} noValidate>
      <TitleField
        value={draft.title}
        onChange={(title) => update({ title })}
        error={shown['title']}
        disabled={saving}
      />
      {draft.type === 'link' && (
        <LinkFields
          payload={draft.payload as LinkDraftPayload}
          onChange={(payload) => update({ payload })}
          errors={shown}
          deck={deck}
          disabled={saving}
        />
      )}
      <BodyField
        value={draft.body}
        onChange={(body) => update({ body })}
        error={shown['body']}
        disabled={saving}
      />
      <CategoryChips
        deck={deck}
        categories={categories}
        selected={draft.categoryIds}
        onChange={(categoryIds) => update({ categoryIds })}
        error={shown['categoryIds']}
        disabled={saving}
      />

      {errors.length > 0 && (
        <div className="form-error" role="alert">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div className="review-card__buttons">
        <Button
          type="submit"
          icon="check"
          label="Save"
          disabled={saving || errorCount(fieldErrors) > 0}
          aria-busy={saving || undefined}
        />
        <Button icon="close" label="Cancel" variant="ghost" onClick={cancel} />
        <ButtonLink
          href={editHref(item.id, 'review')}
          icon="external"
          label="Edit fully"
          variant="ghost"
        />
      </div>
      {leaveDialog}
      {askingCancel && (
        <DiscardChangesDialog onKeep={() => setAskingCancel(false)} onDiscard={onCancel} />
      )}
    </form>
  );
}
