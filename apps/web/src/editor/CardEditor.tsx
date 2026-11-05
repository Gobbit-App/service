import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import type { Category, Deck, Item, ItemType } from '@gobbit/shared';
import { EntityChips, removeEntity } from '../cards/EntityChips';
import { useCloudName } from '../cards/use-cloud-name';
import { useNavigateHref } from '../ui/NavLink';
import {
  draftFromItem,
  emptyDraft,
  isCreatableType,
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
import { ComposerErrorBanner } from './composer/ComposerErrorBanner';
import { ComposerTopBar } from './composer/ComposerTopBar';
import { saveBlockedReason, showSaveReason } from './composer/save-state';
import { payloadHasContent } from './composer/payload-content';
import { TypeControl, TypeLabel } from './composer/TypeControl';
import { useComposerShortcuts } from './composer/use-composer-shortcuts';
import { useCalcCheck } from './use-calc-check';
import { withCategories, withSavedCategories } from './rebaseline';
import { useDraftAutosave } from './use-draft-autosave';
import { useEditorBaseline } from './use-editor-baseline';
import { useLeaveGuard } from './use-leave-guard';
import { usePageHide } from './use-page-hide';
import { useInstantCategories } from './use-instant-categories';
import { useSaveCard, type SaveTarget } from './use-save-card';
import { errorCount, validateDraft, type FieldErrors } from './validate';
import './editor.css';
import './composer/composer.css';

type CommonProps = {
  /** Where Close (and Escape) go: the editor's back target (D200); the leave guard decides. */
  backHref: string;
};

export type CardEditorProps = CommonProps &
  (
    | {
        mode: 'create';
        deck: Deck;
        type: ItemType;
        categories: Category[];
        /** Keeps `?type=` in the URL in step with the type control (replace). */
        onTypeChange?: (type: CreatableType) => void;
        /** D301: the type was just picked on the chooser, so writing starts in the title. */
        focusTitle?: boolean;
      }
    | {
        mode: 'edit';
        deck: Deck;
        item: Item;
        categories: Category[];
        from?: 'review';
        /** D320: the page that opened the editor; Save returns there. */
        opener?: string;
      }
  );

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
    : {
        mode: 'edit',
        deck: props.deck,
        item: props.item,
        from: props.from,
        opener: props.opener,
      };
}

/** D136: the full card editor (create and edit) with a live preview through `Card`. */
export function CardEditor(props: CardEditorProps): ReactElement {
  const { deck, categories } = props;
  const [initial] = useState(() => initialDraft(props));
  const [draft, setDraft] = useState(initial);
  // D203/D208: instant category saves move the baseline so they never read as unsaved.
  const { baseline, isChanged, rebaseline } = useEditorBaseline(initial);
  const calc = useCalcCheck(draft.type);
  const autosave = useDraftAutosave({
    storageKey:
      props.mode === 'create' ? newDraftKey(deck.id, draft.type) : editDraftKey(props.item.id),
    draft,
    initial,
    baseline,
    baseUpdatedAt: props.mode === 'edit' ? props.item.updatedAt : null,
  });
  const { rebase } = autosave;

  /**
   * D208 seam (022's guard): an instant category save (or its Undo) moved the card's categories
   * on the server; make them the saved state so they never read as unsaved changes.
   */
  const rebaselineAfterCategorySave = useCallback(
    (saved: Item) => {
      setDraft((d) => withCategories(d, saved.categoryIds));
      rebaseline({ categoryIds: saved.categoryIds });
      rebase(saved.updatedAt);
    },
    [rebaseline, rebase],
  );
  const instant = useInstantCategories(
    props.mode === 'edit' ? props.item : null,
    deck.slug,
    rebaselineAfterCategorySave,
  );
  const {
    save,
    saving,
    errors: saveErrors,
    clearErrors,
  } = useSaveCard(saveTarget(props), autosave.clear);
  const navigate = useNavigateHref();
  const changed = isChanged(draft);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const imagesOff = useCloudName() === null;
  const focusTitle = props.mode === 'create' && props.focusTitle === true;
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
    // Mount only: the chooser hands over to the title once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // D308: a Save attempt reveals every problem, even on a card nobody has touched yet.
  const [attempted, setAttempted] = useState(false);

  // D201/D204: guard every way out while there is unsaved work; write the draft on the way.
  const leaveDialog = useLeaveGuard({
    when: changed || saving,
    onAttempt: autosave.flush,
    onDiscard: autosave.clear,
  });
  usePageHide(autosave.flush);

  /**
   * D271: switching the type of an untouched new card moves the baseline to the new type's
   * start (its sample), so the sample is never unsaved work; a touched card stays changed.
   */
  const switchType = (type: ItemType) => {
    const next = withType(draft, type);
    if (next === draft) return;
    if (!changed) rebaseline({ type: next.type, payload: next.payload });
    setDraft(next);
  };

  // The URL's `?type=` changed outside the picker (e.g. back button): follow it during render.
  const urlType = props.mode === 'create' ? props.type : null;
  const [seenUrlType, setSeenUrlType] = useState(urlType);
  if (urlType !== seenUrlType) {
    setSeenUrlType(urlType);
    if (urlType) switchType(urlType);
  }

  const isProposal = props.mode === 'edit' && props.item.status === 'proposed';
  const clientErrors = useMemo(
    () => validateDraft(draft, { calcExpression: calc.check, categoriesOptional: isProposal }),
    [draft, calc.check, isProposal],
  );
  // Client errors show once the user has changed something or tried to save; server errors always.
  const shown: FieldErrors = {
    ...(changed || attempted ? clientErrors : {}),
    ...saveErrors?.fields,
  };

  const update = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    clearErrors();
  };

  const changeType = (type: CreatableType) => {
    switchType(type);
    if (props.mode === 'create') props.onTypeChange?.(type);
  };

  const restoreDraft = () => {
    const stored = autosave.restore();
    if (!stored) return;
    // D208: categories on an existing card are already saved; an old draft can't bring them back.
    const restored = withSavedCategories(stored, instant ? baseline.categoryIds : null);
    setDraft(restored);
    if (props.mode === 'create' && restored.type !== draft.type && isCreatableType(restored.type)) {
      props.onTypeChange?.(restored.type);
    }
  };

  const blockedReason = saveBlockedReason(errorCount(clientErrors), calc.ready);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (blockedReason) {
      setAttempted(true);
      return;
    }
    // D207: on an existing card the categories save on their own; Save never sends them.
    void save(props.mode === 'edit' ? withCategories(draft, props.item.categoryIds) : draft);
  };

  const Fields = fieldsByType[draft.type];
  const entities = draft.entities;

  // D310: Escape steps back through the same door as Close (the leave guard decides).
  useComposerShortcuts({ formRef, onEscape: () => navigate(props.backHref) });

  return (
    <form ref={formRef} className="composer" onSubmit={onSubmit} noValidate>
      <ComposerTopBar
        heading={props.mode === 'create' ? 'New card' : 'Edit card'}
        deckName={deck.name}
        closeHref={props.backHref}
        saving={saving}
        blockedReason={blockedReason}
        showReason={showSaveReason(blockedReason, { changed, attempted })}
        onBlockedSave={() => setAttempted(true)}
      />
      <main className="composer__canvas card-editor editor">
        <ComposerErrorBanner
          message={saveErrors?.form ?? (calc.failed ? "Couldn't load the calculator check." : null)}
        />
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
                <TypeControl
                  value={draft.type}
                  hasContent={payloadHasContent(draft)}
                  imagesOff={imagesOff}
                  disabled={saving}
                  onChange={changeType}
                />
              ) : (
                <TypeLabel type={draft.type} />
              )}
              <TitleField
                inputRef={titleRef}
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
                  item={props.mode === 'edit' ? props.item : undefined}
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
              {instant ? (
                <CategoryChips
                  deck={deck}
                  categories={categories}
                  selected={instant.selection}
                  onChange={instant.change}
                  error={instant.refusal ?? undefined}
                />
              ) : (
                <CategoryChips
                  deck={deck}
                  categories={categories}
                  selected={draft.categoryIds}
                  onChange={(categoryIds) => update({ categoryIds })}
                  error={shown['categoryIds']}
                  disabled={saving}
                />
              )}
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
      </main>
      {leaveDialog}
    </form>
  );
}
