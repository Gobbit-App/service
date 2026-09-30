import { z } from 'zod';
import { memberRoles } from '../enums';
import { permissions } from '../authz/permissions';

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
  /** D35: the permission a `403 /problems/forbidden` lacked. */
  permission: z.enum(permissions).optional(),
  /** D35: the caller's role on the deck for a `403 /problems/forbidden`. */
  role: z.enum(memberRoles).optional(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
export type Problem = z.infer<typeof problemSchema>;
