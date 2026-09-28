import { z } from 'zod';

export const problemFieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(problemFieldErrorSchema).optional(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
export type Problem = z.infer<typeof problemSchema>;
