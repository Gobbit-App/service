import { describe, expect, it } from 'vitest';
import { memoryDraftsKv } from '../../test/memory-drafts-kv';
import { emptyDraft } from '../draft';
import { newDraftKey, writeDraft } from '../drafts-store';
import { latestNewDraftType, pickStartType } from './pick-start-type';

describe('pickStartType (D302)', () => {
  it('opens the composer on a usable ?type=', () => {
    expect(pickStartType({ urlType: 'link', draftType: 'table', imagesOff: false })).toEqual({
      kind: 'composer',
      type: 'link',
    });
  });

  it('shows the chooser for ?type=image without image storage', () => {
    expect(pickStartType({ urlType: 'image', draftType: null, imagesOff: true })).toEqual({
      kind: 'chooser',
    });
    expect(pickStartType({ urlType: 'image', draftType: null, imagesOff: false })).toEqual({
      kind: 'composer',
      type: 'image',
    });
  });

  it('resumes an unsaved draft type when the URL names none', () => {
    expect(pickStartType({ urlType: undefined, draftType: 'calc', imagesOff: false })).toEqual({
      kind: 'composer',
      type: 'calc',
    });
  });

  it('ignores an image draft when image storage is off', () => {
    expect(pickStartType({ urlType: undefined, draftType: 'image', imagesOff: true })).toEqual({
      kind: 'chooser',
    });
  });

  it('shows the chooser with no type and no draft', () => {
    expect(pickStartType({ urlType: undefined, draftType: null, imagesOff: false })).toEqual({
      kind: 'chooser',
    });
  });
});

describe('latestNewDraftType (D302)', () => {
  it('is null when the deck has no new-card drafts', async () => {
    expect(await latestNewDraftType('deck-1', memoryDraftsKv())).toBeNull();
  });

  it('picks the most recently saved draft of this deck only', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(
      newDraftKey('deck-1', 'table'),
      emptyDraft('table', null),
      null,
      new Date('2026-01-01T10:00:00Z'),
      kv,
    );
    await writeDraft(
      newDraftKey('deck-1', 'link'),
      emptyDraft('link', null),
      null,
      new Date('2026-01-02T10:00:00Z'),
      kv,
    );
    await writeDraft(
      newDraftKey('deck-2', 'calc'),
      emptyDraft('calc', null),
      null,
      new Date('2026-01-03T10:00:00Z'),
      kv,
    );
    await writeDraft(
      'edit:item-1',
      emptyDraft('text', null),
      null,
      new Date('2026-01-04T10:00:00Z'),
      kv,
    );
    expect(await latestNewDraftType('deck-1', kv)).toBe('link');
  });
});
