# Contract: identity fixtures (`e2e/fixtures/identity.ts`)

What a test author writes. Names of the existing fixtures (`api`, `anon`, `smokeDeck`, `webDeck`) and of
`signIn`/`webUrl` stay, so most specs convert by changing their import.

```ts
test('an editor can add a card', async ({ user, member, smokeDeck }) => {
  // user: the deck owner, signed in; smokeDeck: a shared deck owned by `user`
  const editor = await member(smokeDeck, 'editor');
  const reader = await member(smokeDeck, 'reader');
  // editor.api / editor.page() act as that member; reader likewise
});
```

## Fixtures

| Fixture | Type | Behaviour |
|---------|------|-----------|
| `user` | `Identity` | A fresh address `user-<id>@example.test` signs in by magic link (real endpoints, mail read from the mailbox). Created once per test, lazily. |
| `api` | `APIRequestContext` | `user`'s cookie-authenticated request context (relative paths, `apiUrl` base). Replaces the bearer `api`. |
| `anon` | `APIRequestContext` | No credentials, as today. |
| `context` | `BrowserContext` | A context carrying `user`'s `storageState`, as `web.ts`'s `context` did with the bearer cookie. |
| `smokeDeck` | `{ id, slug }` | A shared deck created by `user` (`smoke-<id>`); no cleanup. |
| `webDeck` | `WebDeck` | `smokeDeck` plus the category and one card per type, as today. |
| `member` | `(deck, role) => Promise<Identity>` | A new address invited by `user` with `role` through `POST /decks/{id}/members`, who follows the invite mail's link; returns an identity whose `api` and `page()` act as that member. |
| `newUser` | `(tag?) => Promise<Identity>` | An extra unrelated user (for "stranger" cases). |

## `Identity`

```ts
interface Identity {
  email: string;
  userId: string;
  api: APIRequestContext;          // cookie session, own cookie jar
  context: BrowserContext;         // own browser context, same session
  page(): Promise<Page>;           // a new page in `context`
}
```

## Rules

- A test only ever sees addresses it created; the mailbox helper filters by recipient (FR-010).
- No fixture reads the environment or a stored token. The only secrets are the in-test session cookies.
- Requests that write carry the web origin as `Origin` (the CSRF middleware's allowed origin is the API's
  own origin, D32); the request-context factory sets it once.
- A spec that asserts the sign-in UI itself (`smoke/sign-in.spec.ts`) drives the page; every other spec
  signs in through the request context, because only that spec needs the UI path.
- Rate-limit cases (profile 429, magic-link limits) use a dedicated `newUser`, never a shared one.
