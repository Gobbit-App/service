import type { SessionRow } from '@gobbit/db';
import type { ActorVia } from '@gobbit/shared';

export interface CurrentUser {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
}

/** How the request presented its session token (D29). */
export type CredentialSource = 'bearer' | 'cookie';

/**
 * D130/D186: the kind of client behind a service action (`actorVias`). `session` covers the web
 * app and API scripts alike (cookie or bearer), `ingest` a proposal made from a share; Phase 13
 * adds `'mcp'` together with a connection id.
 */
export type { ActorVia };

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
