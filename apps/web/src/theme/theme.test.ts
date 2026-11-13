import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  THEME_COLORS,
  THEME_KEY,
  applyTheme,
  parseThemeChoice,
  readThemeChoice,
  saveThemeChoice,
} from './theme';

const INIT_SCRIPT = readFileSync(join(import.meta.dirname, '../../public/theme-init.js'), 'utf8');

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const brokenStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

function resetDocument() {
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}" />`;
}

const metaColors = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));

beforeEach(() => {
  resetDocument();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe('parseThemeChoice', () => {
  it('keeps an explicit light or dark choice', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
  });

  it.each([null, undefined, '', 'system', 'Dark', 'sepia'])('treats %j as match device', (raw) => {
    expect(parseThemeChoice(raw)).toBe('system');
  });
});

describe('reading and saving the choice', () => {
  it('round-trips an explicit choice and forgets it for match device', () => {
    const store = memoryStore();
    saveThemeChoice('dark', store);
    expect(store.data.get(THEME_KEY)).toBe('dark');
    expect(readThemeChoice(store)).toBe('dark');

    saveThemeChoice('system', store);
    expect(store.data.has(THEME_KEY)).toBe(false);
    expect(readThemeChoice(store)).toBe('system');
  });

  it('reads an unknown stored value as match device', () => {
    expect(readThemeChoice(memoryStore({ [THEME_KEY]: 'neon' }))).toBe('system');
  });

  it('falls back to match device when storage is unavailable or throws', () => {
    expect(readThemeChoice(null)).toBe('system');
    expect(readThemeChoice(brokenStore)).toBe('system');
    expect(() => saveThemeChoice('light', brokenStore)).not.toThrow();
    expect(() => saveThemeChoice('light', null)).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('pins the theme and paints every theme-color meta in its 60% colour', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(metaColors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
  });

  it('hands back to the device: no data-theme and each meta matches its media query', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});

describe('public/theme-init.js (runs before first paint)', () => {
  const runInit = () => new Function(INIT_SCRIPT)();

  it.each(['light', 'dark'] as const)('applies a stored %s choice like applyTheme', (choice) => {
    localStorage.setItem(THEME_KEY, choice);
    runInit();
    const fromScript = { theme: document.documentElement.dataset.theme, metas: metaColors() };

    resetDocument();
    applyTheme(choice);
    expect(fromScript).toEqual({
      theme: document.documentElement.dataset.theme,
      metas: metaColors(),
    });
  });

  it.each([null, 'neon'])('leaves the page to the device for a stored %j', (stored) => {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    runInit();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});
