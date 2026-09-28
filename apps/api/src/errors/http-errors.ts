import type { Context } from 'hono';
import type { Problem, ProblemFieldError } from '@pb/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super(title);
    this.name = 'HttpError';
  }

  toProblem(): Problem {
    const problem: Problem = {
      type: this.type,
      title: this.title,
      status: this.status,
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

export function notFound(detail?: string): HttpError {
  return new HttpError(404, '/problems/not-found', 'Not Found', detail);
}

export function conflict(detail?: string, type = '/problems/conflict'): HttpError {
  return new HttpError(409, type, 'Conflict', detail);
}

export function unprocessable(detail?: string, type = '/problems/unprocessable'): HttpError {
  return new HttpError(422, type, 'Unprocessable Content', detail);
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

export function problemResponse(c: Context, p: Problem): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
