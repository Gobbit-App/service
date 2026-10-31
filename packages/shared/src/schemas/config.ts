import { z } from 'zod';

/** D55: public runtime config the web app reads once at start. Never carries secrets. */
export const appConfigSchema = z.object({
  cloudinaryCloudName: z.string().nullable(),
  commit: z.string(),
  /** D73/D77: which search features the server has provider keys for. */
  search: z.object({
    semantic: z.boolean(),
    ask: z.boolean(),
  }),
  /** D93/D104: ingestion is on when an extraction provider is configured. */
  ingest: z.object({
    enabled: z.boolean(),
    /** Email-in domain (`<token>@domain`), null when the D104 flag is off. */
    emailDomain: z.string().nullable(),
    /** iCloud link of the "Share to Gobbit" Shortcut, null until published. */
    shortcutUrl: z.string().nullable(),
  }),
  /** D245: Umami site and public host when analytics is configured, else null (nothing loads). */
  analytics: z
    .object({
      siteId: z.string(),
      host: z.string(),
    })
    .nullable(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
