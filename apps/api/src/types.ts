import type { SessionRow } from '@pb/db';

export interface CurrentUser {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
}

/** How the request presented its session token (D29). */
export type CredentialSource = 'bearer' | 'cookie';

/**
 * D130: the kind of client behind a service action. `session` covers the web app and API
 * scripts alike (cookie or bearer); Phase 13 adds `'mcp'` together with a connection id.
 */
export type ActorVia = 'session';

/** D130 (ADR-050): who performs a service action and through which kind of client. */
export interface Actor {
  user: CurrentUser;
  via: ActorVia;
}

export interface Authenticated {
  user: CurrentUser;
  session: SessionRow;
  via: CredentialSource;
}

export type AppEnv = {
  Variables: {
    requestId: string;
    user?: CurrentUser;
    auth?: Authenticated;
    /** D99: an `ing_` bearer on POST /ingest, resolved by the ingest route (never a session). */
    ingestBearer?: string;
  };
};
