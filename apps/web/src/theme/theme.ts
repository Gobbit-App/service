import { defaultStore, type KeyValueStore } from '../lib/last-deck';

/**
 * D383: the colour theme is a choice of this device — match the device (the default), or always
 * light / dark. `public/theme-init.js` applies the same rules before first paint; keep the key, the
 * values and the colours below in step with it (theme.test.ts checks).
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'gobbit:theme';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** The 60% colour of each theme — what the browser chrome (`theme-color`) is painted in. */
export const THEME_COLORS = { light: '#dde9f2', dark: '#0e1b2e' } as const;

/** Anything stored that isn't an explicit light/dark choice means "match the device". */
export function parseThemeChoice(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function readThemeChoice(store: KeyValueStore | null = defaultStore()): ThemeChoice {
  if (store === null) return 'system';
  try {
    return parseThemeChoice(store.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Stores an explicit choice; "match the device" is the absence of one. Storage errors only cost persistence. */
export function saveThemeChoice(
  choice: ThemeChoice,
  store: KeyValueStore | null = defaultStore(),
): void {
  if (store === null) return;
  try {
    if (choice === 'system') store.removeItem(THEME_KEY);
    else store.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or a full quota: the choice still applies for this visit.
  }
}

/**
 * Sets `data-theme` on <html> (CSS switches `color-scheme`, which drives every `light-dark()` token)
 * and repaints each `theme-color` meta: an explicit choice wins over the meta's media query.
 */
export function applyTheme(choice: ThemeChoice, doc: Document = document): void {
  const root = doc.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = choice === 'system' ? metaScheme(meta) : choice;
    meta.setAttribute('content', THEME_COLORS[scheme]);
  }
}

function metaScheme(meta: HTMLMetaElement): 'light' | 'dark' {
  return meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light';
}
