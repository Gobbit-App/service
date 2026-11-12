import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '@gobbit/shared';
import { emptyDraft, type Draft } from './draft';
import type { EventDraftPayload } from './event-draft';
import { EditorPreview, previewItem } from './EditorPreview';

vi.mock('../cards/use-cloud-name', () => ({ useCloudName: () => 'demo' }));

const cover = { publicId: 'gobbit/items/d/cover', width: 1200, height: 300 };
const storedCover = { publicId: 'gobbit/items/d/stored', width: 1200, height: 300 };

function textDraft(extra: Partial<Draft> = {}): Draft {
  return { ...emptyDraft('text', null), title: 'Hello', ...extra };
}

function storedItem(): Item {
  return { ...previewItem(textDraft(), null, 'deck'), cover: storedCover } as Item;
}

describe('previewItem cover (044, FR-010)', () => {
  it('is null on create without a cover', () => {
    expect(previewItem(textDraft(), null, 'deck').cover).toBeNull();
  });

  it('carries the draft cover on create', () => {
    expect(previewItem(textDraft({ cover }), null, 'deck').cover).toEqual(cover);
  });

  it('shows the draft cover, not the stored one, on edit', () => {
    expect(previewItem(textDraft({ cover }), storedItem(), 'deck').cover).toEqual(cover);
  });

  it('drops the stored cover when the draft removed it', () => {
    expect(previewItem(textDraft({ cover: null }), storedItem(), 'deck').cover).toBeNull();
  });
});

describe('EditorPreview cover (044, US1/AC3)', () => {
  const props = { base: null, deckId: 'deck', deckSlug: 'd', categories: [] };

  it('renders the cover bar for a draft with a cover', () => {
    const { container } = render(<EditorPreview {...props} draft={textDraft({ cover })} />);
    expect(container.querySelector('.card__cover')).toBeInTheDocument();
  });

  it('previews an event with a link and a cover without the link image', () => {
    const base = emptyDraft('event', null);
    const payload: EventDraftPayload = {
      ...(base.payload as EventDraftPayload),
      allDay: true,
      start: '2026-12-03',
      url: 'https://example.org/fair',
      preview: { title: 'Fair', image: 'https://example.org/og.png' },
    };
    const draft = { ...base, title: 'Fair', payload, cover };
    const { container } = render(<EditorPreview {...props} draft={draft} />);
    expect(container.querySelector('.card__cover')).toBeInTheDocument();
    expect(container.querySelector('.link-card__image')).toBeNull();
    const { container: noCover } = render(
      <EditorPreview {...props} draft={{ ...draft, cover: null }} />,
    );
    expect(noCover.querySelector('.link-card__image')).not.toBeNull();
  });
});
