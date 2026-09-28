export interface CurrentUser {
  id: string;
  accountId: string;
  email: string;
}

export type AppEnv = {
  Variables: {
    requestId: string;
    user?: CurrentUser;
  };
};

export type Action = 'read' | 'write';
