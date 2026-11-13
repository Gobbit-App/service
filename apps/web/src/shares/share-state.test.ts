import { describe, expect, it } from 'vitest';
import { autoPublishOutcomes, ingestFailureCodes } from '@gobbit/shared/ingest-constants';
import { makeShare } from '../test/fixtures';
import { failureCopy, pasteAgainCopy, UNKNOWN_FAILURE } from './failure-copy';
import {
  anyProcessing,
  autoPublishCopy,
  heldReason,
  shareEventLine,
  shareTitle,
  stateLabel,
} from './share-state';

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
    const item = {
      id: makeShare().id,
      title: 'Card',
      deleted: false,
      type: 'text' as const,
      event: null,
    };
    const preview = { title: 'Page', host: 'a.example', photoCount: 0, fileKind: null, unusedFiles: [] };
    expect(shareTitle(makeShare({ item, preview }))).toBe('Card');
    expect(shareTitle(makeShare({ preview }))).toBe('Page');
    expect(shareTitle(makeShare({ preview: { ...preview, title: null } }))).toBe('a.example');
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 1, fileKind: null, unusedFiles: [] } }))).toBe(
      '1 photo',
    );
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 3, fileKind: null, unusedFiles: [] } }))).toBe(
      '3 photos',
    );
    expect(shareTitle(makeShare({ preview: { title: null, host: null, photoCount: 0, fileKind: null, unusedFiles: [] } }))).toBe(
      'Shared text',
    );
  });

  it('knows when a list is still processing', () => {
    expect(anyProcessing(undefined)).toBe(false);
    expect(anyProcessing([{ state: 'published' }])).toBe(false);
    expect(anyProcessing([{ state: 'published' }, { state: 'processing' }])).toBe(true);
  });
});

describe('shareEventLine (D377)', () => {
  const NOW = new Date('2026-11-09T10:00:00Z');
  const eventItem = (event: { startsAt: string; allDay: boolean; timeZone: string }) => ({
    id: makeShare().id,
    title: 'Winter fair',
    deleted: false,
    type: 'event' as const,
    event,
  });

  it('names a timed event proposal in the viewer zone', () => {
    const share = makeShare({
      state: 'in_review',
      item: eventItem({
        startsAt: '2026-12-03T17:00:00Z',
        allDay: false,
        timeZone: 'Europe/Paris',
      }),
    });
    expect(shareEventLine(share, 'Europe/Paris', NOW)).toBe(
      'Proposed as an event: Thu 3 Dec, 18:00',
    );
  });

  it('gives an all-day event its date and a published one its verb', () => {
    const share = makeShare({
      state: 'published',
      item: eventItem({ startsAt: '2026-12-02T23:00:00Z', allDay: true, timeZone: 'Europe/Paris' }),
    });
    expect(shareEventLine(share, 'America/New_York', NOW)).toBe('Published as an event: Thu 3 Dec');
  });

  it('says nothing for other cards, deleted cards or a share not added', () => {
    const event = { startsAt: '2026-12-03T17:00:00Z', allDay: false, timeZone: 'UTC' };
    const card = {
      id: makeShare().id,
      title: 'x',
      deleted: false,
      type: 'text' as const,
      event: null,
    };
    expect(shareEventLine(makeShare({ state: 'in_review', item: card }), 'UTC', NOW)).toBeNull();
    expect(
      shareEventLine(
        makeShare({ state: 'in_review', item: { ...eventItem(event), deleted: true } }),
        'UTC',
        NOW,
      ),
    ).toBeNull();
    expect(
      shareEventLine(makeShare({ state: 'not_added', item: eventItem(event) }), 'UTC', NOW),
    ).toBeNull();
  });

  it('asks to check the date and time when an event share is held', () => {
    expect(autoPublishCopy('held_event_unverified')).toBe(
      'check the date and time before publishing',
    );
  });
});
