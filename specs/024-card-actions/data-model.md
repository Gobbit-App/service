# Data Model: Card actions and icon buttons

No migration, no API or DTO change. The shapes below are client-side only (`apps/web`).

## Icon (`ui/icons/icon-paths.ts`)

| Field | Type | Rule |
|-------|------|------|
| `name` | `IconName` (string union) | one entry per icon in `ICON_PATHS` |
| path data | `string` | SVG path `d`, coordinates within 0–24 (drawn inside 2–22) |
| `filled` | boolean (render prop) | only for names in `FILLABLE` (e.g. `star`) |
| directional | derived (`DIRECTIONAL` set) | `back`, `forward`: mirrored in RTL; every other icon never flips |

Rendering: `viewBox 0 0 24 24`, stroke `currentColor`, width 1.75, round caps/joins, `aria-hidden`, `focusable="false"`.

## Button primitives (`ui/buttons/`)

| Prop | IconButton / IconLink | Button |
|------|-----------------------|--------|
| `icon` | required | required |
| `label` | required → `aria-label`, tooltip | required → visible label (hidden < 480 px), accessible name, tooltip |
| `tip` | optional override of the tooltip | — |
| `pressed` | optional → `aria-pressed`, filled icon when fillable | — |
| `tone` / `variant` | `default` \| `danger` | `primary` \| `ghost` \| `danger` |
| `disabledReason` | optional → `aria-disabled="true"`, click ignored, tooltip "label — reason" | same |

## Card action (`cards/CardActionBar.tsx`)

| Field | Values |
|-------|--------|
| `key` | `edit`, `favorite`, `share`, `restore`, `undelete`, `check`, `history`, `archive`, `dismiss`, `delete` |
| `placement` | `bar` (edit, favorite, share, one of restore/undelete/check) · `menu` (history, archive, dismiss, delete) |
| permission | edit: `canEditItem(item, role, me)`; lifecycle: `availableActions(item, role)`; link: `linkCheckActions(item, role)`; history: `can(role, 'event.list')` |
| `tone` | `danger` for delete |
| offline | lifecycle and link actions → `disabledReason: 'needs a connection'` |

### Bar per card state

| Card state | Bar | More menu |
|------------|-----|-----------|
| published | Edit, Favorite, Share, Check again (flagged link only) | History, Archive, Dismiss (flagged link only), Delete |
| archived | Edit, Favorite, Share, Restore | History, Delete |
| deleted | Undelete | — |
| proposed (own, lists) | Edit, Favorite, Share | — |
| review queue | Publish \| (Apply update, Publish as new), Edit, Discard | Edit fully |

Items appear only when the role allows them; the menu button is omitted when the menu is empty.

## Browse position control (`browse/PositionMenu.tsx`)

| Field | Value |
|-------|-------|
| name | `Card {n} of {N}` (or `Card {n}` while the total is unknown) |
| items | Previous card (`aria-disabled` on the first card), Next card (`aria-disabled` on the last loaded card with no more pages) |
