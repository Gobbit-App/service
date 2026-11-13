import type { AppConfig } from '@gobbit/shared';

/** D354: where the code, its license and its issue tracker live (the repository is public). */
export const SOURCE_URL = 'https://github.com/Gobbit-App/service';
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;
export const ISSUES_URL = `${SOURCE_URL}/issues`;
export const SECURITY_URL = `${SOURCE_URL}/security/policy`;
/** Written by `rollup-plugin-license` at build time (vite.config.ts). */
export const NOTICES_PATH = '/licenses.txt';

/** `GIT_SHA` outside a CI-built image (vite.config.ts, the API's `/config`). */
const LOCAL_COMMIT = 'dev';
const SHORT_SHA = 7;

export interface VersionLabel {
  label: string;
  /** The commit on GitHub; null for a local build. */
  href: string | null;
}

/** A short commit linked to its source, or "Development build" for a local one. */
export function versionLabel(commit: string): VersionLabel {
  const sha = commit.trim();
  if (sha === '' || sha === LOCAL_COMMIT) return { label: 'Development build', href: null };
  return { label: sha.slice(0, SHORT_SHA), href: `${SOURCE_URL}/commit/${sha}` };
}

/** The server's version only when it differs from the app's (a deploy the app hasn't loaded). */
export function serverVersion(
  appCommit: string,
  serverCommit: string | undefined,
): VersionLabel | null {
  if (!serverCommit || serverCommit === appCommit) return null;
  return versionLabel(serverCommit);
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The build time as a local date and time; null when it can't be read. */
export function releasedLabel(iso: string, locale?: string): string | null {
  const date = parseDate(iso);
  if (!date) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** The copyright line, dated by the build (falls back to no year). */
export function copyrightLine(iso: string): string {
  const year = parseDate(iso)?.getUTCFullYear();
  return year ? `© ${year} The Gobbit authors` : '© The Gobbit authors';
}

export interface Credit {
  key: string;
  name: string;
  purpose: string;
  /** The provider's site; null when several providers may sit behind the feature. */
  href: string | null;
}

type CreditConfig = Pick<
  AppConfig,
  'cloudinaryCloudName' | 'search' | 'ingest' | 'analytics' | 'push'
>;

/**
 * D354: the outside services this server actually uses, read from `/config`, so a deployment
 * without a provider never claims it. Video lookups (041, D345) run whenever a link is saved.
 */
export function serviceCredits(config: CreditConfig): Credit[] {
  const credits: Credit[] = [];
  if (config.cloudinaryCloudName) {
    credits.push({
      key: 'cloudinary',
      name: 'Cloudinary',
      purpose: 'stores and delivers card photos',
      href: 'https://cloudinary.com',
    });
  }
  if (config.search.semantic || config.search.ask || config.ingest.enabled) {
    credits.push({
      key: 'ai',
      name: 'AI language models',
      purpose: 'search by meaning, Ask and turning shared links into proposed cards',
      href: null,
    });
  }
  credits.push({
    key: 'video',
    name: 'YouTube, TikTok and Vimeo',
    purpose: 'titles and thumbnails for links to their videos',
    href: null,
  });
  if (config.push) {
    credits.push({
      key: 'push',
      name: "Your browser's push service",
      purpose: 'delivers notifications you turn on',
      href: null,
    });
  }
  if (config.analytics) {
    credits.push({
      key: 'umami',
      name: 'Umami',
      purpose: 'self-hosted usage statistics, only after you allow them',
      href: 'https://umami.is',
    });
  }
  return credits;
}
