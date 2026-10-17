import { payloadFromFormData, type SharedPayload } from './share-payload';

/** D98: the manifest's `share_target.action`; the SW answers its POST, Caddy 303s a stray one. */
export const SHARE_PATH = '/share';

export function isShareTargetPost(request: Pick<Request, 'method' | 'url'>, origin: string) {
  if (request.method !== 'POST') return false;
  const url = new URL(request.url);
  return url.origin === origin && url.pathname === SHARE_PATH;
}

export type ShareTargetDeps = {
  origin: string;
  save: (payload: SharedPayload) => Promise<void>;
  newId: () => string;
  now: () => number;
  log?: (message: string, err: unknown) => void;
};

/**
 * Stashes the shared form and 303s to the confirm screen (`/share?pending=<id>`). A failure
 * lands on `/share?failed=1` instead of an error page, so the user can paste instead.
 */
export async function handleShareTarget(request: Request, deps: ShareTargetDeps) {
  const target = new URL(SHARE_PATH, deps.origin);
  try {
    const payload = payloadFromFormData(await request.formData(), deps.newId(), deps.now());
    await deps.save(payload);
    target.searchParams.set('pending', payload.id);
  } catch (err) {
    (deps.log ?? console.error)('[sw] share target failed', err);
    target.searchParams.set('failed', '1');
  }
  return Response.redirect(target.href, 303);
}
