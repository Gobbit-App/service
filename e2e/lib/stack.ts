import { readFileSync } from 'node:fs';

export interface Stack {
  project: string;
  webUrl: string;
  apiUrl: string;
  mailboxUrl: string;
  commit: string;
  startedAt: string;
}

export const STACK_FILE = new URL('../.stack/stack.json', import.meta.url);

function load(): Stack {
  let raw: string;
  try {
    raw = readFileSync(STACK_FILE, 'utf8');
  } catch {
    throw new Error('no stack: run `pnpm test:e2e`');
  }
  const s = JSON.parse(raw) as Record<string, unknown>;
  const str = (k: string): string => {
    const v = s[k];
    if (typeof v !== 'string' || !v)
      throw new Error(`stack file: "${k}" must be a non-empty string`);
    return v;
  };
  const project = str('project');
  if (!/^gobbit-e2e-[a-z0-9]+-[a-z0-9]{4}$/.test(project)) {
    throw new Error(`stack file: bad project name "${project}"`);
  }
  const webUrl = str('webUrl');
  const apiUrl = str('apiUrl');
  const mailboxUrl = str('mailboxUrl');
  for (const [k, v] of Object.entries({ webUrl, apiUrl, mailboxUrl })) {
    if (!/^https?:\/\/[^/]+$/.test(v) && k !== 'apiUrl')
      throw new Error(`stack file: "${k}" must be an origin without trailing slash`);
  }
  if (apiUrl !== `${webUrl}/api`)
    throw new Error('stack file: "apiUrl" must equal webUrl + "/api"');
  return {
    project,
    webUrl,
    apiUrl,
    mailboxUrl,
    commit: str('commit'),
    startedAt: str('startedAt'),
  };
}

export const stack: Stack = load();

/** Absolute web URL for a path ("welcome", "/version.json"). */
export const webUrl = (path = ''): string => `${stack.webUrl}/${path.replace(/^\//, '')}`;

/** Absolute API URL for a relative path with no leading slash ("decks"). */
export const apiPath = (path = ''): string => `${stack.apiUrl}/${path.replace(/^\//, '')}`;
