import type { Db, DbTx } from '@pb/db';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import type { Logger } from '../lib/logger';
import { decisionLogger } from '../lib/decision-event';
import { createPlatformAdmins } from '../access/platform-admin';
import { createWaitlistRepo } from '../repositories/waitlist.repo';
import { createMagicLinksRepo } from '../repositories/magic-links.repo';
import { createUsersRepo } from '../repositories/users.repo';
import { createDecksRepo } from '../repositories/decks.repo';
import { createUsersService } from './users.service';
import { createWaitlistAdminService, type WaitlistAdminTxRepos } from './waitlist-admin.service';
import {
  ADMIN_ACCESS_DECISION_LEVELS,
  WAITLIST_ADMIN_DECISION_LEVELS,
  type AdminAccessDecisions,
  type WaitlistAdminDecisions,
} from './waitlist-admin.events';

/** What the users service needs besides its repos (D222, D241). */
export type RegistrationDeps = Omit<Parameters<typeof createUsersService>[0], 'users' | 'decks'>;

export function adminTxRepos(tx: DbTx, registration: RegistrationDeps): WaitlistAdminTxRepos {
  return {
    waitlist: createWaitlistRepo(tx),
    magicLinks: createMagicLinksRepo(tx),
    usersService: createUsersService({
      users: createUsersRepo(tx),
      decks: createDecksRepo(tx),
      ...registration,
    }),
  };
}

/** 032: the platform-admin guard (D234) and the admin waitlist service. */
export function buildAdminServices(deps: {
  db: Db;
  env: Env;
  mailer: Mailer;
  now: () => Date;
  logger: Logger;
  registration: RegistrationDeps;
}) {
  const { db, env, mailer, now, logger, registration } = deps;
  return {
    platformAdmins: createPlatformAdmins({
      admins: env.PLATFORM_ADMINS,
      decisions: decisionLogger<AdminAccessDecisions>('admin', {
        parent: logger,
        levels: ADMIN_ACCESS_DECISION_LEVELS,
      }),
    }),
    waitlistAdmin: createWaitlistAdminService({
      env,
      now,
      mailer,
      waitlist: createWaitlistRepo(db),
      transaction: (fn) => db.transaction((tx) => fn(adminTxRepos(tx, registration))),
      decisions: decisionLogger<WaitlistAdminDecisions>('waitlist-admin', {
        parent: logger,
        levels: WAITLIST_ADMIN_DECISION_LEVELS,
      }),
    }),
  };
}
