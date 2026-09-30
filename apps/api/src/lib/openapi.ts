import { problemSchema } from '@pb/shared';

/** D29: every authenticated route accepts the session cookie or the same token as a bearer. */
export const AUTH_SECURITY: Array<Record<string, string[]>> = [
  { SessionCookie: [] },
  { BearerToken: [] },
];

const PROBLEM_STATUSES = {
  'bad-request': 400,
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  unprocessable: 422,
  'rate-limited': 429,
} as const;

export type ProblemCode = keyof typeof PROBLEM_STATUSES;

const STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
};

type ProblemResponse = {
  content: { 'application/problem+json': { schema: typeof problemSchema } };
  description: string;
};

/** OpenAPI `responses` entries for the given problem codes (RFC 7807 bodies). */
export function problems(...codes: ProblemCode[]): Record<number, ProblemResponse> {
  const result: Record<number, ProblemResponse> = {};
  for (const code of codes) {
    const status = PROBLEM_STATUSES[code];
    result[status] = {
      content: { 'application/problem+json': { schema: problemSchema } },
      description: STATUS_DESCRIPTIONS[status],
    };
  }
  return result;
}
