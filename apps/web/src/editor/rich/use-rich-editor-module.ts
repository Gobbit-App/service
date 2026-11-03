import { useCallback, useEffect, useState, type ComponentType } from 'react';
import type { RichBodyEditorProps } from './RichBodyEditor';

export type RichEditorComponent = ComponentType<RichBodyEditorProps>;

export type RichEditorLoad =
  { status: 'loading' } | { status: 'ready'; Editor: RichEditorComponent } | { status: 'failed' };

export type RichEditorLoader = () => Promise<{ default: RichEditorComponent }>;

const loadEditor: RichEditorLoader = () => import('./RichBodyEditor');

/** The module, once loaded, so every later field renders the editor at once. */
let cached: RichEditorComponent | null = null;

/** Test-only: forget the loaded module. */
export function resetRichEditorCache(): void {
  cached = null;
}

/**
 * D290: loads the editor chunk on demand (it stays out of the reader's bundle). A failed load
 * (offline, stale deploy) reports `failed`; `retry` tries again. `fail` lets the field fall back
 * when the editor itself could not start.
 */
export function useRichEditorModule(load: RichEditorLoader = loadEditor) {
  const [state, setState] = useState<RichEditorLoad>(() =>
    cached ? { status: 'ready', Editor: cached } : { status: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cached) return;
    let active = true;
    load()
      .then((module) => {
        cached = module.default;
        if (active) setState({ status: 'ready', Editor: module.default });
      })
      .catch(() => {
        if (active) setState({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [attempt, load]);

  const retry = useCallback(() => {
    setState(cached ? { status: 'ready', Editor: cached } : { status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const fail = useCallback(() => setState({ status: 'failed' }), []);

  return { ...state, retry, fail };
}
