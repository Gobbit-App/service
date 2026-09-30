import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { MemberRole } from '@pb/shared';
import { canSeePrivate, visibleCategoriesWhere } from './visibility';

const render = (role: MemberRole | null) =>
  new PgDialect().sqlToQuery(visibleCategoriesWhere(role));

describe('canSeePrivate', () => {
  it.each([
    ['owner', true],
    ['maintainer', true],
    ['editor', false],
    ['reader', false],
    [null, false],
  ] as const)('%s -> %s', (role, expected) => {
    expect(canSeePrivate(role)).toBe(expected);
  });
});

describe('visibleCategoriesWhere', () => {
  it.each(['owner', 'maintainer'] as const)('%s sees everything', (role) => {
    expect(render(role)).toEqual({ sql: 'true', params: [] });
  });

  it.each(['editor', 'reader'] as const)('%s sees shared and public', (role) => {
    const { sql, params } = render(role);
    expect(sql).toBe('"categories"."visibility" in ($1, $2)');
    expect(params).toEqual(['shared', 'public']);
  });

  it('no role sees public only', () => {
    const { sql, params } = render(null);
    expect(sql).toBe('"categories"."visibility" = $1');
    expect(params).toEqual(['public']);
  });
});
