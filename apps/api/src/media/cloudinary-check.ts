import { v2 as cloudinary } from 'cloudinary';
import { parseCloudinaryUrl, type CloudinaryCredentials } from '../lib/cloudinary-url';
import { childLogger, type Logger } from '../lib/logger';

export type CloudinaryPing = (credentials: CloudinaryCredentials) => Promise<unknown>;

const adminPing: CloudinaryPing = ({ cloudName, apiKey, apiSecret }) =>
  cloudinary.api.ping({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

/** The SDK rejects with `{ error: { message, http_code } }`, not an Error. */
function describeFailure(err: unknown): { message: string; httpCode: number | null } {
  if (err instanceof Error) return { message: err.message, httpCode: null };
  const inner = (err as { error?: { message?: unknown; http_code?: unknown } } | null)?.error;
  return {
    message: typeof inner?.message === 'string' ? inner.message : String(err),
    httpCode: typeof inner?.http_code === 'number' ? inner.http_code : null,
  };
}

/**
 * Startup probe of CLOUDINARY_URL: signed browser uploads (D133) fail only in the browser, so a
 * wrong key/secret is otherwise invisible server-side. Never throws; reports one JSON line.
 */
export async function checkCloudinaryCredentials(
  cloudinaryUrl: string,
  deps: { ping?: CloudinaryPing; log?: Logger } = {},
): Promise<boolean> {
  const { ping = adminPing, log = childLogger('cloudinary') } = deps;
  let credentials: CloudinaryCredentials;
  try {
    credentials = parseCloudinaryUrl(cloudinaryUrl);
  } catch (err) {
    log.error({ err }, 'CLOUDINARY_URL is malformed; image uploads will fail');
    return false;
  }
  try {
    await ping(credentials);
    log.info({ cloudName: credentials.cloudName }, 'cloudinary credentials ok');
    return true;
  } catch (err) {
    log.error(
      { cloudName: credentials.cloudName, ...describeFailure(err) },
      'cloudinary credentials rejected; image uploads will fail',
    );
    return false;
  }
}
