# Contract: Deck admin

## 1. `PATCH /decks/{id}/members/{userId}` (new)

| | |
|---|---|
| Auth | Session; `member.invite` (owner) |
| Body | `{ "role": "owner" \| "maintainer" \| "editor" \| "reader" }` |
| 200 | `Member` |
| 400 | Bad body |
| 403 | Caller is a member without `member.invite` |
| 404 | Deck not visible to the caller, or user not a member |
| 409 | `/problems/own-role`, `/problems/implicit-owner`, `/problems/invite-pending`, `/problems/last-owner` |

Same role → 200, no change.

## 2. Existing routes the screen uses

| Action | Route | Permission |
|--------|-------|------------|
| Load deck + caller role | `GET /decks/{id}` | `deck.read` |
| Rename deck | `PATCH /decks/{id}` `{ name }` | `deck.update` |
| Public switch | `PATCH /decks/{id}` `{ isPublic }` | owner (016, D176) |
| Categories | `GET /decks/{id}/categories` | `category.read` |
| Rename / visibility | `PATCH /decks/{id}/categories/{categoryId}` | `category.update` (016) |
| Members | `GET /decks/{id}/members` | `member.list` |
| Invite / re-invite | `POST /decks/{id}/invites` `{ email, role }` | `member.invite` |
| Remove / cancel | `DELETE /decks/{id}/members/{userId}` | `member.remove` |

## 3. PWA route

`/d/$slug/settings` (lazy). Entry "Deck settings" in the deck menu for owner and maintainer. Other roles opening it directly see "Only admins can change this deck" and the member list.
