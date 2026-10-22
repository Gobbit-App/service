import { useMemo, type ReactElement } from 'react';
import type { Category, Item } from '@pb/shared';
import { Card } from '../cards/Card';
import { toPayload, type Draft } from './draft';

const PREVIEW_ID = 'editor-preview';

/** The draft as an `Item`, so the preview renders through the same `Card` as the list (D136). */
export function previewItem(draft: Draft, base: Item | null, deckId: string): Item {
  const now = new Date().toISOString();
  const sourceUrl = draft.sourceUrl.trim();
  return {
    ...(base ?? {
      id: PREVIEW_ID,
      deckId,
      status: 'published',
      sourceKind: 'manual',
      verifiedAt: null,
      createdBy: '',
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
      linkHealth: null,
    }),
    type: draft.type,
    title: draft.title.trim(),
    body: draft.body,
    payload: toPayload(draft),
    categoryIds: draft.categoryIds,
    sourceUrl: sourceUrl === '' ? null : sourceUrl,
    entities: draft.entities ?? {},
  } as Item;
}

export function EditorPreview({
  draft,
  base,
  deckId,
  deckSlug,
  categories,
}: {
  draft: Draft;
  /** The card being edited; null on create. */
  base: Item | null;
  deckId: string;
  deckSlug: string;
  categories: readonly Category[];
}): ReactElement {
  const item = useMemo(() => previewItem(draft, base, deckId), [draft, base, deckId]);
  return (
    <section className="editor__preview" aria-label="Preview">
      <Card item={item} deckSlug={deckSlug} categories={categories} linkTitle={false} preview />
    </section>
  );
}
