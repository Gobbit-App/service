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
});

export type AppConfig = z.infer<typeof appConfigSchema>;
