import type { SessionRow } from '@pb/db';

export interface CurrentUser {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
}

/** How the request presented its session token (D29). */
export type CredentialSource = 'bearer' | 'cookie';

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
  };
};
