# "Share to Gobbit" — iPhone Shortcut and email-in

iOS Safari has no Web Share Target, so iPhone sharing goes through an Apple Shortcut that posts
to `POST /api/ingest` with an **ingest token** (D99). Tokens are created in the app under
**Settings → Ingest tokens**; each is shown once, accepted only by `POST /ingest`, and can be
bound to one pocketbook (otherwise shares go to the personal one, `/d/me`).

The published Shortcut carries no secret: the token and server address are **Import Questions**
the user answers when adding it.

## Build the Shortcut (once, on an iPhone or Mac)

1. Shortcuts → **+** → name it **Share to Gobbit**, pick an icon.
2. Shortcut details (ⓘ): enable **Show in Share Sheet**; accepted types **URLs, Safari web
   pages, Text, Images**. Set "If there's no input" to **Ask For Text**.
3. Add the actions:

   | # | Action | Settings |
   |---|--------|----------|
   | 1 | **Text** | `https://gobbit.example` — rename the variable `Server` |
   | 2 | **Text** | `ing_…` placeholder — rename the variable `Token` |
   | 3 | **Get URLs from Input** | input: Shortcut Input |
   | 4 | **Get Images from Input** | input: Shortcut Input |
   | 5 | **Get Text from Input** | input: Shortcut Input |
   | 6 | **Get Contents of URL** | URL `Server/api/ingest`; Method **POST**; Headers `Authorization` = `Bearer Token`; Request Body **Form** with fields `url` (Text: URLs), `text` (Text: Text), `files` (File: Images) |
   | 7 | **Get Dictionary Value** | `id` from Contents of URL |
   | 8 | **If** Dictionary Value **has any value** | **Show Notification** "Sent to Gobbit — it will show up for review." / **Otherwise**: **Get Dictionary Value** `detail` → **Show Alert** with it |

   Notes on the contract (see `POST /ingest` in `/api/openapi.json`):
   - Empty form fields are ignored, so it's fine that most shares only fill one of them.
   - At most 3 images, each ≤ 8 MB (JPEG/PNG/WebP/HEIC/HEIF); the body may be up to 25 MB.
   - Do **not** send `channel` or `deckId`: token shares are always `shortcut`, and a bound
     token always ingests into its pocketbook.
   - Answers: `202 {id,status}` accepted; `401` unknown/revoked token; `400`/`413` bad input;
     `429` daily cap (`Retry-After`); `503` ingestion off on the server.
4. Shortcut details → **Setup** → **Add Import Question** twice:
   - action 1 (Server): "What's your Gobbit address?" (default: the production URL)
   - action 2 (Token): "Paste your Gobbit ingest token (Settings → Ingest tokens)"
5. Test it from Safari's share sheet with a real token, then **revoke that token**.

## Publish

1. Share the Shortcut → **Copy iCloud Link**. Check the link opens the import screen and asks
   both questions (no token baked in).
2. Set `SHORTCUT_URL=<the iCloud link>` on the API (Dokploy env); `GET /config` exposes it and
   the Settings page links to it. Without it, Settings says the Shortcut isn't set up.
3. After editing the Shortcut, share it again — iCloud links point at a snapshot.

## Email-in (D104, optional)

Each token also has an address: the token without `ing_` at `INGEST_EMAIL_DOMAIN`
(e.g. `Xy3…@in.example.com`). Settings shows it once, together with the new token; like the
token it can't be shown again, so save it as a contact. Mail to it becomes a share:

- subject (without `Re:`/`Fwd:`) → title; plain-text body with quoted replies and signature
  trimmed → text (HTML is stripped when there's no text part); the first link → url;
  up to 3 image attachments (≤ 8 MB) → images; other attachments are ignored.
- Unknown or revoked addresses are accepted and dropped silently (no bounce, so addresses
  can't be probed). Rejected shares (empty, over the cap, ingestion off) are logged only.

Server setup:

1. Resend → **Receiving**: add the domain and its MX records.
2. Resend → **Webhooks**: endpoint `https://<host>/api/webhooks/resend/inbound`, event
   `email.received`; copy the signing secret (`whsec_…`).
3. Set `INGEST_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY` (the webhook carries
   metadata only; the body and attachments are fetched from the Resend API). Email-in stays
   off — the route is a 404 and Settings hides addresses — unless all three are set and an
   Ask provider key enables ingestion.
