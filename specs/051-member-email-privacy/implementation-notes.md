# Implementation notes: 051 member email privacy

Decisions the plan did not make, and deviations from it.

## T009: no change

`MembersSection.tsx` already shows `member.email ?? @username`, so a null email needs no code change. `MembersSection.test.tsx`, `EventFields.test.tsx` and `ReminderFields.test.tsx` pass (29 tests).

## T017: `displayNameSql` literal

`@gobbit/db` already depends on `@gobbit/shared` (other schema files import it), so `displayNameSql` interpolates `MEMBER_NAME` as a bound parameter rather than a second literal. `users.display_name` is no longer read (D459).

## T018: `displayNameOf` unchanged (deviates from D459)

D459 says the name is "changed at its two builders". Only one builder changes: `displayNameSql`. `displayNameOf` has two callers, `review.service.ts` `sharers` and `shares.service.ts` `reviewerOf`, and both pass `users.findById` rows whose `displayName` is already `displayNameSql()`, so the fallback chain comes from SQL and `displayNameOf` needs no change.

## T014 deviation

The item `creator` name stays `null` for a nameless, usernameless member (no name fallback on the creator DTO; the avatar label shows "Member", D422), so the test asserts `null` rather than "Member" for that one field.

## T015/T024 note

The deleted-inviter waitlist case hard-deletes the inviter after seeding so the FK `set null` applies (a soft-deleted user keeps a row and shows "Member"). Left-join null path is covered by item-events "Former member".
