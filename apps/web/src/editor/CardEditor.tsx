import { Suspense, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type { Category, Deck, Item, ItemType } from '@pb/shared';
import { EntityChips, removeEntity } from '../cards/EntityChips';
import {
  draftFromItem,
  emptyDraft,
  isCreatableType,
  isDirty,
  withType,
  type CreatableType,
  type Draft,
} from './draft';
import { DraftRestoreBanner } from './DraftRestoreBanner';
import { editDraftKey, newDraftKey } from './drafts-store';
import { EditorPreview } from './EditorPreview';
import { EditorTabs } from './EditorTabs';
import { BodyField } from './fields/BodyField';
import { CategoryChips } from './fields/CategoryChips';
import { fieldsByType } from './fields/registry';
import { SourceUrlField } from './fields/SourceUrlField';
import { TitleField } from './fields/TitleField';
import { SaveBar, saveBlockedReason } from './SaveBar';
import { TYPE_LABELS, TypePicker } from './TypePicker';
import { useCalcCheck } from './use-calc-check';
import { useDraftAutosave } from './use-draft-autosave';
import { useSaveCard, type SaveTarget } from './use-save-card';
import { errorCount, validateDraft, type FieldErrors } from './validate';
import './editor.css';

export type CardEditorProps =
  | {
      mode: 'create';
      deck: Deck;
      type: ItemType;
      categories: Category[];
      /** Keeps `?type=` in the URL in step with the picker (replace). */
      onTypeChange?: (type: CreatableType) => void;
    }
  | { mode: 'edit'; deck: Deck; item: Item; categories: Category[]; from?: 'review' };

function defaultCategoryId(categories: readonly Category[]): string | null {
  return categories.find((c) => c.isDefault)?.id ?? null;
}

function initialDraft(props: CardEditorProps): Draft {
  return props.mode === 'create'
    ? emptyDraft(props.type, defaultCategoryId(props.categories))
    : draftFromItem(props.item);
}

function saveTarget(props: CardEditorProps): SaveTarget {
  return props.mode === 'create'
    ? { mode: 'create', deck: props.deck }
    : { mode: 'edit', deck: props.deck, item: props.item, from: props.from };
}

/** D136: the full card editor (create and edit) with a live preview through `Card`. */
export function CardEditor(props: CardEditorProps): ReactElement {
  const { deck, categories } = props;
  const [initial] = useState(() => initialDraft(props));
  const [draft, setDraft] = useState(initial);
  const calc = useCalcCheck(draft.type);
  const autosave = useDraftAutosave({
    storageKey:
      props.mode === 'create' ? newDraftKey(deck.id, draft.type) : editDraftKey(props.item.id),
    draft,
    initial,
    baseUpdatedAt: props.mode === 'edit' ? props.item.updatedAt : null,
  });
  const {
    save,
    saving,
    errors: saveErrors,
    clearErrors,
  } = useSaveCard(saveTarget(props), autosave.clear);

  // The URL's `?type=` changed outside the picker (e.g. back button): follow it during render.
  const urlType = props.mode === 'create' ? props.type : null;
  const [seenUrlType, setSeenUrlType] = useState(urlType);
  if (urlType !== seenUrlType) {
    setSeenUrlType(urlType);
    if (urlType && urlType !== draft.type) setDraft(withType(draft, urlType));
  }

  const isProposal = props.mode === 'edit' && props.item.status === 'proposed';
  const clientErrors = useMemo(
    () => validateDraft(draft, { calcExpression: calc.check, categoriesOptional: isProposal }),
    [draft, calc.check, isProposal],
  );
  // Client errors show once the user has changed something; server errors always.
  const shown: FieldErrors = {
    ...(isDirty(draft, initial) ? clientErrors : {}),
    ...saveErrors?.fields,
  };

  const update = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    clearErrors();
  };

  const changeType = (type: CreatableType) => {
    setDraft((d) => withType(d, type));
    if (props.mode === 'create') props.onTypeChange?.(type);
  };

  const restoreDraft = () => {
    const restored = autosave.restore();
    if (!restored) return;
    setDraft(restored);
    if (props.mode === 'create' && restored.type !== draft.type && isCreatableType(restored.type)) {
      props.onTypeChange?.(restored.type);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (errorCount(clientErrors) > 0 || !calc.ready) return;
    void save(draft);
  };

  const Fields = fieldsByType[draft.type];
  const entities = draft.entities;

  return (
    <form className="card-editor editor" onSubmit={onSubmit} noValidate>
      <h2 className="editor__heading">{props.mode === 'create' ? 'New card' : 'Edit card'}</h2>
      {autosave.offer && (
        <DraftRestoreBanner
          stale={autosave.offer.stale}
          onRestore={restoreDraft}
          onDiscard={autosave.discard}
        />
      )}
      <EditorTabs
        edit={
          <div className="editor__fields">
            {props.mode === 'create' ? (
              <TypePicker value={draft.type} onChange={changeType} disabled={saving} />
            ) : (
              <p className="editor__type">
                Type: <strong>{TYPE_LABELS[draft.type]}</strong>
              </p>
            )}
            <TitleField
              value={draft.title}
              onChange={(title) => update({ title })}
              error={shown['title']}
              disabled={saving}
            />
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <Fields
                payload={draft.payload}
                onChange={(payload: Draft['payload']) => update({ payload })}
                errors={shown}
                deck={deck}
                disabled={saving}
                setTitleIfEmpty={(title: string) =>
                  setDraft((d) => (d.title.trim() === '' ? { ...d, title } : d))
                }
              />
            </Suspense>
            {shown['payload'] && <p className="field__error">{shown['payload']}</p>}
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
            <SourceUrlField
              value={draft.sourceUrl}
              onChange={(sourceUrl) => update({ sourceUrl })}
              error={shown['sourceUrl']}
              disabled={saving}
            />
            {entities && (
              <EntityChips
                entities={entities}
                onRemove={(kind, index) =>
                  update({ entities: removeEntity(entities, kind, index) })
                }
              />
            )}
          </div>
        }
        preview={
          <EditorPreview
            draft={draft}
            base={props.mode === 'edit' ? props.item : null}
            deckId={deck.id}
            deckSlug={deck.slug}
            categories={categories}
          />
        }
      />
      <SaveBar
        blockedReason={saveBlockedReason(errorCount(clientErrors), calc.ready)}
        saving={saving}
        formError={saveErrors?.form ?? (calc.failed ? "Couldn't load the calculator check." : null)}
      />
    </form>
  );
}
