import type { Context } from 'hono';
import type { MemberRole, Permission, Problem, ProblemFieldError } from '@pb/shared';

export interface HttpErrorExtras {
  /** Extra response headers, e.g. `Retry-After` or a cookie-clearing `Set-Cookie`. */
  headers?: Record<string, string>;
  /** RFC 7807 extension members (D35: `permission`, `role`). */
  extensions?: Pick<Problem, 'permission' | 'role'>;
}

export class HttpError extends Error {
  readonly headers: Record<string, string>;
  readonly extensions: Pick<Problem, 'permission' | 'role'>;

  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
    extras: HttpErrorExtras = {},
  ) {
    super(title);
    this.name = 'HttpError';
    this.headers = extras.headers ?? {};
    this.extensions = extras.extensions ?? {};
  }

  toProblem(): Problem {
    const problem: Problem = {
      type: this.type,
      title: this.title,
      status: this.status,
      ...this.extensions,
    };
    if (this.detail !== undefined) {
      problem.detail = this.detail;
    }
    if (this.errors !== undefined) {
      problem.errors = this.errors;
    }
    return problem;
  }
}

export function badRequest(detail?: string, errors?: ProblemFieldError[]): HttpError {
  return new HttpError(400, '/problems/bad-request', 'Bad Request', detail, errors);
}

export function unauthorized(detail?: string): HttpError {
  return new HttpError(401, '/problems/unauthorized', 'Unauthorized', detail);
}

/** A presented credential that doesn't resolve to a live session (P2.1). */
export function sessionInvalid(headers?: Record<string, string>): HttpError {
  return new HttpError(
    401,
    '/problems/session-invalid',
    'Session invalid',
    'The session is unknown, expired or revoked',
    undefined,
    { headers },
  );
}

/** D26: a bad magic link when no `APP_URL` is configured to redirect to. */
export function magicLinkInvalid(reason: string): HttpError {
  return new HttpError(
    401,
    '/problems/magic-link-invalid',
    'Magic link invalid',
    `The sign-in link is ${reason}`,
  );
}

/** D30: token exchange is only offered to cookie-authenticated requests. */
export function cookieSessionRequired(): HttpError {
  return new HttpError(
    403,
    '/problems/cookie-session-required',
    'Cookie session required',
    'Token exchange requires a cookie-authenticated request',
  );
}

/** D35: the caller has a role on the deck but it lacks `permission`. */
export function forbidden(permission: Permission, role: MemberRole): HttpError {
  return new HttpError(
    403,
    '/problems/forbidden',
    'Forbidden',
    `Role '${role}' lacks permission '${permission}'`,
    undefined,
    { extensions: { permission, role } },
  );
}

/** D32: a cookie-authenticated mutation from an origin that isn't allowed. */
export function csrfRejected(): HttpError {
  return new HttpError(
    403,
    '/problems/csrf',
    'Forbidden',
    'Cross-site request rejected: the Origin is not allowed',
  );
}

export function notFound(detail?: string): HttpError {
  return new HttpError(404, '/problems/not-found', 'Not Found', detail);
}

export function conflict(detail?: string, type = '/problems/conflict'): HttpError {
  return new HttpError(409, type, 'Conflict', detail);
}

export function unprocessable(detail?: string, type = '/problems/unprocessable'): HttpError {
  return new HttpError(422, type, 'Unprocessable Content', detail);
}

/** D39: over a rate limit; `Retry-After` says when the window resets. */
export function rateLimited(retryAfterSeconds: number): HttpError {
  return new HttpError(
    429,
    '/problems/rate-limited',
    'Too Many Requests',
    'Too many requests, try again later',
    undefined,
    { headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export function problemFromZodError(err: {
  issues: { path: PropertyKey[]; message: string }[];
}): Problem {
  return {
    type: '/problems/validation',
    title: 'Validation failed',
    status: 400,
    errors: err.issues.map((i) => ({
      path: i.path.map(String).join('.'),
      message: i.message,
    })),
  };
}

export function problemResponse(
  c: Context,
  p: Problem,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { ...headers, 'Content-Type': 'application/problem+json' },
  });
}
