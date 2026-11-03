# UI contract: bottom bar, menus and Settings

This contract binds the unit, component and e2e tests. Accessible names are the contract, because tests and assistive tech find controls by role and name.

## 1. Where the bar appears

| Page | Bar | Deck-specific items |
|------|-----|---------------------|
| `/` and `/?all=true` (deck list) | yes | no (+ = New deck) |
| `/d/$slug` and `/c/$category`, `/favorites`, `/archived`, `/links`, `/search`, `/review`, `/log`, `/settings`, `/import`, `/shares` | yes | yes |
| `/settings` | yes | no (no +) |
| `/d/$slug/browse`, `/d/$slug/new`, `/i/$id`, `/i/$id/edit`, `/share`, `/admin/waitlist`, `/sign-in` | no | — |

The landmark is `<nav aria-label="Deck actions">` on deck pages and `<nav aria-label="Actions">` elsewhere. It is fixed to the bottom, above `env(safe-area-inset-bottom)`.

## 2. Order (inline start → end; mirrored in RTL)

1. **⋯**: menu button, name **"Menu"**.
2. **Browse**: button, name **"Browse"** (deck pages).
3. **Review**: link, name **"Review"** or **"Review · N"** (`item.publish`, not the personal deck).
4. **+**: on deck pages a menu button named **"Add"** (`item.create` only); on the deck list a button named **"New deck"**.

## 3. Create menu ("Add")

Items appear in this order, each only when the role and deck allow it, with the same rules as the old links:

| Item name | Target |
|-----------|--------|
| New card | `/d/$slug/new` |
| Paste or share | the paste box route, as `PasteLink` |
| Import | `/d/$slug/import` (as `ImportLink`) |
| Shares | `/d/$slug/shares` (as `SharesLink`) |

How the + responds:

- **Short press** (click, Enter, Space, ArrowDown) opens the menu and focuses the first item.
- **Long press** (≥ 500 ms with touch or mouse, moving < 10 px) navigates to `/d/$slug/new`. No menu opens and no click follows.

## 4. ⋯ menu ("Menu")

| Item | When | Target |
|------|------|--------|
| Settings | always | `/d/$slug/settings` on deck pages, else `/settings` |
| Activity | deck pages, `event.list` | `/d/$slug/log` |
| Waitlist | `me.isPlatformAdmin` | `/admin/waitlist` |
| Sign out | always; detail line = signed-in email | leave to `/sign-in`, then sign out |

## 5. Header

The header holds `Back` (when not top), the `<h1>` title and the page's own `actions`. There is no Settings, Deck settings or Sign out control in it.

## 6. Settings page

- **`/d/$slug/settings`**:
  - an `<h2>` **"This deck"**, followed by the deck sections as D184 (Deck, Categories, Members, or the "Only admins…" notice);
  - an `<h2>` **"Your account"**, followed by the `SettingsScreen` sections.
- **`/settings`**: the `SettingsScreen` sections only, with no "This deck" heading.
