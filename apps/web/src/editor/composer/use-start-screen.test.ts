import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { memoryDraftsKv } from '../../test/memory-drafts-kv';
import { emptyDraft } from '../draft';
import { newDraftKey, writeDraft, type DraftsKv } from '../drafts-store';
import { useStartScreen } from './use-start-screen';

describe('useStartScreen (D302)', () => {
  it('answers at once from ?type= without reading drafts', () => {
    const kv: DraftsKv = { ...memoryDraftsKv(), get: () => Promise.reject(new Error('unused')) };
    const { result } = renderHook(() =>
      useStartScreen({ deckId: 'd1', urlType: 'link', imagesOff: false, kv }),
    );
    expect(result.current).toEqual({ kind: 'composer', type: 'link' });
  });

  it('is null while reading, then resumes the latest draft type', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(newDraftKey('d1', 'table'), emptyDraft('table', null), null, new Date(), kv);
    const { result } = renderHook(() =>
      useStartScreen({ deckId: 'd1', urlType: undefined, imagesOff: false, kv }),
    );
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ kind: 'composer', type: 'table' }));
  });

  it('shows the chooser without drafts', async () => {
    const { result } = renderHook(() =>
      useStartScreen({ deckId: 'd1', urlType: undefined, imagesOff: false, kv: memoryDraftsKv() }),
    );
    await waitFor(() => expect(result.current).toEqual({ kind: 'chooser' }));
  });

  it('falls back to the chooser when the drafts store fails', async () => {
    const kv: DraftsKv = { ...memoryDraftsKv(), get: () => Promise.reject(new Error('no idb')) };
    const { result } = renderHook(() =>
      useStartScreen({ deckId: 'd1', urlType: undefined, imagesOff: false, kv }),
    );
    await waitFor(() => expect(result.current).toEqual({ kind: 'chooser' }));
  });
});
