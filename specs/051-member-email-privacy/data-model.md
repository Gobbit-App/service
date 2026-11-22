# Data model: Member email privacy

One column. Everything else is the shape of answers (see [contracts/members.md](./contracts/members.md)).

## `memberships` (changed)

| Column | Type | Rule |
|--------|------|------|
| `invited_by_email` | `boolean NOT NULL DEFAULT false` | **New** (migration `0029_invited_by_email`, hand-written down file drops it). True when the current invite was made by typing an address, false for a username invite. Written by `memberships.repo.create` and rewritten by `reinvite` together with `invited_by`, `role` and `invited_at`. Read only while `accepted_at IS NULL` (D461). |
| `invited_by` | existing | Who sent the current invite (`ON DELETE SET NULL`). Used as is. |

No backfill. Pending invites from before the migration read as false, so their addresses stay hidden until someone re-invites (D461).

## `users` (unchanged columns, changed meaning)

| Column | Change |
|--------|--------|
| `display_name` | No longer part of any shown name (D459). It is still written at registration and read by nothing; dropping it is a follow-up. |
| `email` | No longer selected by `summariesByIds` (D460). |

## Derived values (no storage)

| Value | Rule | Built by |
|-------|------|----------|
| Shown name | `trim(first_name + ' ' + last_name)`, else `username`, else `"Member"` (`MEMBER_NAME`) | `displayNameSql`, `displayNameOf` (D459) |
| Initials (others) | first letters of the first and last name, else of the username's `.`/`-`/`_` parts, else `''` (glyph) | `initialsFor({ firstName, lastName, fallback: username })` (D460) |
| Initials (self) | as today, with the own email as `fallback` | `profile.service`, `BottomBar`, `ProfileForm` |
| Row address | invitee `users.email` iff pending ∧ `invited_by_email` ∧ `invited_by = viewer`, else null | `memberships.service` (D461) |
| Anonymous pending row | pending ∧ `invited_by_email` → `"Member"`, no username, `''`, no photo, for every viewer | `memberships.service` (D462) |
| Invited by | pending ∧ viewer `can('member.invite')` → inviter summary + shown name; placeholder when the inviter is not on the deck or the account is gone | `memberships.service` (D463) |

## State

```text
invite {email}    → pending, invited_by_email = true,  invited_by = A
re-invite by B    → pending, invited_by_email per B's input, invited_by = B   (A stops seeing the address)
accept            → accepted (flag ignored from now on; row is an ordinary member row)
remove / cancel   → soft-deleted (unchanged)
```
