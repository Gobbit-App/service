import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createUsersRepo } from '../src/repositories/users.repo';
import { setupApiTest } from './helpers';

describe('usersRepo.smartShareOf (050)', () => {
  const ctx = setupApiTest();

  it('is false by default, true once set, null for deleted or unknown users', async () => {
    const { db } = ctx.t;
    const repo = createUsersRepo(db);
    const { id, email } = ctx.world.owner;

    expect(await repo.smartShareOf(id)).toEqual({ email, smartShare: false });
    await db.execute(sql`UPDATE users SET smart_share = true WHERE id = ${id}`);
    expect(await repo.smartShareOf(id)).toEqual({ email, smartShare: true });
    await db.execute(sql`UPDATE users SET deleted_at = now() WHERE id = ${id}`);
    expect(await repo.smartShareOf(id)).toBeNull();
    expect(await repo.smartShareOf('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
