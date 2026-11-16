# Quickstart: validating 046

Prerequisites: Docker (Testcontainers), `pnpm install`, a local stack (`pnpm compose:up` or `pnpm dev`)
with the seeded owner. Cloudinary is faked at the network edge in e2e (`e2e/fixtures/cloudinary.ts`).

## 1. Automated

```
pnpm typecheck && pnpm lint
pnpm test:unit            # avatar, username, profile.service, Avatar, ProfileForm, AvatarCropper
pnpm test:int             # profile.int.test.ts, migration round trip, items/memberships/sweep/public additions
pnpm api:openapi          # no diff after commit
pnpm budget               # web initial bundle within 150 KB gzip
pnpm test:e2e             # @smoke: settings + members journeys
```

The nightly `@full` tier runs `e2e/tests/full/profile.spec.ts`.

## 2. By hand (two browsers, two members, one shared deck)

1. Member A: Settings → Profile. Set first name "Dana", last name "Levi", username `dana`, save.
   Reload: values persist; clear the last name, save: only it is gone.
2. Member A adds a card to the shared deck. The card shows a round avatar in the footer; hover or tap
   shows `dana`. A personal-deck card shows no avatar.
3. Member B opens the same deck: the same colour and initials; the label never shows an email (inspect
   the DOM and the network response).
4. Member B (owner) opens invite and types `dana` → A's avatar and name appear; invite sent. A never-used
   name gives the same "no member found" as a released one.
5. Member C tries `Dana` as a username: refused (taken). A clears the username; C is refused for the
   hold period (`USERNAME_HOLD_DAYS`), A can take it back.
6. Member A adds a photo (pick, camera or drop), moves and zooms the crop, saves: cards show the photo.
   Remove it: initials return. The old file is gone after the sweep grace (`MEDIA_ORPHAN_GRACE_DAYS`).
7. Go offline: seen avatars render; the app shows no error.

## Expected outcomes

Spec SC-001–SC-010; the traceability table in `plan.md` lists the test for each rule. Public pages
(`/p/{slug}`) show no creator for any card.
