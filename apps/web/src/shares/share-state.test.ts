import { describe, expect, it } from 'vitest';
import { autoPublishOutcomes, ingestFailureCodes } from '@pb/shared/ingest-constants';
import { makeShare } from '../test/fixtures';
import { failureCopy, pasteAgainCopy, UNKNOWN_FAILURE } from './failure-copy';
import { anyProcessing, autoPublishCopy, heldReason, shareTitle, stateLabel } from './share-state';

describe('failureCopy (D194)', () => {
  it.each(ingestFailureCodes.filter((c) => c !== 'unknown'))(
    'has its own sentence for %s',
    (code) => {
      const copy = failureCopy(code);
      expect(copy).not.toBe(UNKNOWN_FAILURE);
      expect(copy).not.toContain(code);
    },
  );

  it.each([null, undefined, 'unknown', 'new_code_from_a_newer_api'])(
    'falls back to "Something went wrong" for %s',
    (code) => expect(failureCopy(code)).toBe(UNKNOWN_FAILURE),
  );
});

describe('pasteAgainCopy (FR-005)', () => {
  it('asks to forward an email again', () => {
    expect(pasteAgainCopy('email')).toMatch(/forward the email again/i);
  });

  it.each(['pwa', 'paste', 'shortcut'] as const)('asks to paste a %s share again', (channel) => {
    expect(pasteAgainCopy(channel)).toBe('Paste it again');
  });
});

describe('share state copy (D196)', () => {
  it.each(autoPublishOutcomes)('has copy for the %s outcome', (outcome) => {
    expect(autoPublishCopy(outcome)).toBeTruthy();
  });

  it('labels every state', () => {
    expect(stateLabel('failed')).toBe("Couldn't add this");
    expect(stateLabel('in_review')).toBe('Waiting for review');
  });

  it('gives the held reason only for a held share in review', () => {
    expect(heldReason({ state: 'in_review', autoPublish: 'held_needs_category' })).toBe(
      'needs a category',
    );
    expect(heldReason({ state: 'in_review', autoPublish: null })).toBeNull();
    expect(heldReason({ state: 'published', autoPublish: 'published' })).toBeNull();
    expect(heldReason({ state: 'failed', autoPublish: 'held_duplicate' })).toBeNull();
  });

  it('titles a share by card, page title, host, photos, then text', () => {
    const item = { id: makeShare().id, title: 'Card', deleted: false };
    const preview = { title: 'Page', host: 'a.example', photoCount: 0 };
    expect(shareTitle(makeShare({ item, preview }))).toBe('Card');
    expect(shareTitle(makeShare({ preview }))).toBe('Page');
    expect(shareTitle(makeShare({ preview: { ...preview, title: null } }))).toBe('a.example');
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 1 } }))).toBe(
      '1 photo',
    );
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 3 } }))).toBe(
      '3 photos',
    );
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 0 } }))).toBe(
      'Shared text',
    );
  });

  it('knows when a list is still processing', () => {
    expect(anyProcessing(undefined)).toBe(false);
    expect(anyProcessing([{ state: 'published' }])).toBe(false);
    expect(anyProcessing([{ state: 'published' }, { state: 'processing' }])).toBe(true);
  });
});
