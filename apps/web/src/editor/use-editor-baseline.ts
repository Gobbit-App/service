import { useCallback, useState } from 'react';
import { isDirty, type Draft } from './draft';

export type EditorBaseline = {
  /** What counts as "saved": the opening draft plus any out-of-band saves. */
  baseline: Draft;
  /** True when the draft differs from the baseline (undoing a change back is not a change). */
  isChanged: (draft: Draft) => boolean;
  /**
   * Merges fields saved outside the Save button into the baseline (023: instant category
   * saves call `rebaseline({ categoryIds })`), so they stop counting as unsaved changes.
   */
  rebaseline: (changes: Partial<Draft>) => void;
};

/** D203: the snapshot the editor compares against for errors shown, autosave and the guard. */
export function useEditorBaseline(initial: Draft | (() => Draft)): EditorBaseline {
  const [baseline, setBaseline] = useState<Draft>(initial);
  const isChanged = useCallback((draft: Draft) => isDirty(draft, baseline), [baseline]);
  const rebaseline = useCallback(
    (changes: Partial<Draft>) => setBaseline((current) => ({ ...current, ...changes })),
    [],
  );
  return { baseline, isChanged, rebaseline };
}
