import { z } from 'zod';

/** D55: public runtime config the web app reads once at start. Never carries secrets. */
export const appConfigSchema = z.object({
  cloudinaryCloudName: z.string().nullable(),
  commit: z.string(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
