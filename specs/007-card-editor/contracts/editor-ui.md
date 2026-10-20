# Contract: Editor UI (routes, components, seams)

This is the web-internal contract: what other features (006, 008, 009) and tests can rely on.

## Routes (D135)

| Route | File | Search params | Guard | Renders |
|-------|------|---------------|-------|---------|
| `/d/$slug/new` | `routes/d.$slug.new.tsx` (child of `d.$slug.tsx`) | `type`: `text \| link \| table \| calc` (default `text`; 008 adds `image`). Unknown → `text` | `can(deck.role, 'item.create')`, else "You can't add cards here" | `<CardEditor mode="create" deck type />` |
| `/i/$itemId/edit` | `routes/i.$itemId_.edit.tsx` (not nested) | `from?`: `review` | `GET /items/{id}` ok + `canEditItem(role, item, me)`, else "Card unavailable" | `<CardEditor mode="edit" item deck />` |

- On create, the type picker is a radio group shown above the fields. Changing it updates `?type=` (replace) and resets the payload but keeps the title, body and categories.
- On edit there is no type picker. The type shows as a read-only label.
- After save:
  - Create goes to `deckHref(deck.slug)` (006).
  - Edit goes to `/i/$itemId`, or to `/d/$slug/review` when `from=review` and the card is still proposed.
- The page title is "New card" or "Edit card".

## Entry points (FR-015)

| Where | Component | Rule |
|-------|-----------|------|
| Deck layout header | `items/AddCardLink` (existing) | `can(role,'item.create')`; href via `deckHref(slug) + '/new'` |
| `/i/$itemId` | `cards/EditLink` (in 006's `CardActions`) | `canEditItem(role, item, me)` |
| List cards | `cards/EditLink` (in 006's `CardActions`) | same |
| Review queue card | "Edit fully" link in `review/ReviewCard` | always (the queue is publisher-only) → `/i/$id/edit?from=review` |

`canEditItem(role, item, me)` lives in `cards/can-edit-item.ts`:

```ts
can(role, 'item.update') &&
  (item.status !== 'proposed' || can(role, 'item.publish') || item.createdBy === me.id)
```

## Components

```ts
// editor/CardEditor.tsx
type CardEditorProps =
  | { mode: 'create'; deck: Deck; type: ItemType; categories: Category[] }
  | { mode: 'edit'; deck: Deck; item: Item; categories: Category[]; from?: 'review' };

// editor/fields/registry.ts — 008 overrides `image`
type FieldsProps<T extends ItemType> = {
  payload: DraftPayloadFor<T>;
  onChange(next: DraftPayloadFor<T>): void;
  errors: FieldErrors;          // paths under 'payload.'
  deck: Deck;                   // 008 needs deckId for signed upload
  disabled: boolean;            // while saving
};
export const fieldsByType: Record<ItemType, ComponentType<FieldsProps<any>>>;

// editor/fields/LinkFields.tsx — 008 seam
type LinkFieldsProps = FieldsProps<'link'> & {
  previewSlot?: (ctx: { url: string; setPreview(p: LinkPreview): void; setTitleIfEmpty(t: string): void }) => ReactNode;
};

// editor/fields/CategoryChips.tsx
type CategoryChipsProps = {
  deck: Deck; categories: Category[];         // visible only
  selected: string[]; onChange(ids: string[]): void;
  error?: string;                              // shown under the chips
};

// cards/EntityChips.tsx (moved from review/)
type EntityChipsProps = { entities: Entities; onRemove?(kind: EntityKind, index: number): void };

// cards/Card.tsx
type CardProps = { /* existing */ preview?: boolean }; // preview: no actions, no links, no age label clickables
```

## Layout and accessibility (D136)

- Below 768 px: `EditorTabs` uses `role="tablist"` with "Edit" and "Preview" tabs. Both panels stay mounted, with the inactive one `hidden`.
- At 768 px and above: a two-column grid with the tabs hidden.
- Each input has a visible `<label>`. Its error is linked with `aria-describedby`, and the input gets `aria-invalid` when it has one. `LimitMeter` uses `aria-live="polite"` only once over 90% of the limit.
- The Save button is `disabled` while invalid or saving. The reason shows next to the button ("Fix 2 fields").
- The restore banner is `role="status"` with "Restore" and "Discard" buttons.
- Labels the e2e tests rely on:
  - Fields: `Title`, `Body`, `URL`, `Preview title`, `Preview description`, `Source URL`, `Expression`, `Result label`.
  - Buttons: `Save card`, `Add row`, `Add column`, `Add field`, `New category`, `Restore`, `Discard`.
  - Type radios: `Text`, `Link`, `Table`, `Calc`.

## Styling

Plain CSS in `editor/editor.css`, imported only by `CardEditor` so it stays in the lazy chunk. There is no UI kit.

## Cross-feature notes

- **006-card-lifecycle**: owns `CardActions`, `deckHref` and the archive/delete UI. 007 renders `EditLink` inside `CardActions`. An archived card can be edited (status unchanged); 006 decides whether the Edit button shows for archived cards.
- **008-card-media**: registers `ImageFields` in `fieldsByType.image`, adds `image` to the `?type=` enum and the type picker, and passes `previewSlot` to `LinkFields` for Fetch preview.
- **009-browse-mode**: reuses `cards/EntityChips` (without `onRemove`) in its details pane and links to `/i/$id/edit` through `EditLink`.
