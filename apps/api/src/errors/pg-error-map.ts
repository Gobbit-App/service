import type { Problem } from '@pb/shared';

export function findPgError(
  err: unknown,
): { code: string; message: string; constraint?: string } | null {
  let current: unknown = err;
  let depth = 0;

  while (current !== null && current !== undefined && depth < 5) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      typeof current.code === 'string' &&
      current.code.length === 5
    ) {
      const e = current as { code: string; message?: unknown; constraint?: unknown };
      return {
        code: e.code,
        message: typeof e.message === 'string' ? e.message : '',
        constraint: typeof e.constraint === 'string' ? e.constraint : undefined,
      };
    }

    if (typeof current === 'object' && 'cause' in current) {
      current = current.cause;
      depth++;
    } else {
      break;
    }
  }

  return null;
}

export function mapPgError(err: unknown): Problem | null {
  const pgErr = findPgError(err);

  if (!pgErr) {
    return null;
  }

  const { code, message } = pgErr;

  if (code === 'P0001' && message.includes('default_category_protected')) {
    return {
      type: '/problems/default-category-protected',
      title: 'Default category is protected',
      status: 409,
    };
  }

  if (code === '23505') {
    return {
      type: '/problems/conflict',
      title: 'Conflict',
      status: 409,
      detail: 'Resource already exists',
    };
  }

  if (code === '23514') {
    return {
      type: '/problems/constraint-violation',
      title: 'Constraint violation',
      status: 422,
    };
  }

  if (code === '23503') {
    return {
      type: '/problems/invalid-reference',
      title: 'Invalid reference',
      status: 422,
    };
  }

  return null;
}
