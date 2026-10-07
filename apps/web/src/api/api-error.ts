/** Problem details from API error response. */
export type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  [k: string]: unknown;
};

/** HTTP and network error. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;

  /**
   * Creates an ApiError.
   */
  constructor(status: number, problem: Problem | null, message?: string) {
    const msg = message ?? problem?.title ?? `HTTP ${status}`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Checks if value is an ApiError.
 */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/**
 * Checks if error is ApiError with status 401 (Unauthorized).
 */
export function isUnauthorized(e: unknown): boolean {
  return isApiError(e) && e.status === 401;
}

/**
 * Checks if error is ApiError with status 404 (Not Found).
 */
export function isNotFound(e: unknown): boolean {
  return isApiError(e) && e.status === 404;
}
