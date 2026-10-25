import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import { useEditorBaseline } from './use-editor-baseline';

const opening = emptyDraft('text', 'c1');

describe('useEditorBaseline', () => {
  it('starts from the opening draft and reports no change for it', () => {
    const { result } = renderHook(() => useEditorBaseline(opening));
    expect(result.current.baseline).toEqual(opening);
    expect(result.current.isChanged(opening)).toBe(false);
  });

  it('reports a change, and none once the change is undone', () => {
    const { result } = renderHook(() => useEditorBaseline(opening));
    expect(result.current.isChanged({ ...opening, title: 'Plumber' })).toBe(true);
    expect(result.current.isChanged({ ...opening, title: '' })).toBe(false);
  });

  it('accepts a lazy initialiser', () => {
    const { result } = renderHook(() => useEditorBaseline(() => opening));
    expect(result.current.baseline).toEqual(opening);
  });

  it('rebaseline merges only the given fields, so other edits still count', () => {
    const { result } = renderHook(() => useEditorBaseline(opening));
    const edited = { ...opening, title: 'Plumber', categoryIds: ['c2'] };
    expect(result.current.isChanged(edited)).toBe(true);

    act(() => result.current.rebaseline({ categoryIds: ['c2'] }));
    expect(result.current.baseline.categoryIds).toEqual(['c2']);
    expect(result.current.baseline.title).toBe('');
    expect(result.current.isChanged({ ...opening, categoryIds: ['c2'] })).toBe(false);
    expect(result.current.isChanged(edited)).toBe(true);
  });

  it('keeps rebaseline stable across renders', () => {
    const { result, rerender } = renderHook(() => useEditorBaseline(opening));
    const first = result.current.rebaseline;
    rerender();
    expect(result.current.rebaseline).toBe(first);
  });
});
