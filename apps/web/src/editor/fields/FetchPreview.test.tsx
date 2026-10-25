import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/api-error';
import { requests, respond } from '../../test/api-mock';
import { makeDeck } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';
import type { LinkDraftPayload } from '../draft';
import { mergePreview, NO_PREVIEW } from './FetchPreview';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { LinkEditorFields } = await import('./LinkEditorFields');

const deck = makeDeck({ id: 'deck-1' });
const PREVIEW_REQUEST = 'POST /decks/{id}/link-preview';
let latest: { title: string; payload: LinkDraftPayload };

function Harness({ initial, title = '' }: { initial: LinkDraftPayload; title?: string }) {
  const [state, setState] = useState({ title, payload: initial });
  // Functional updates, like CardEditor, so two changes in one tick both land.
  const set = (change: (s: typeof state) => typeof state) => {
    latest = change(latest);
    setState(change);
  };
  const view: ReactElement = (
    <>
      <p data-testid="title">{state.title}</p>
      <LinkEditorFields
        payload={state.payload}
        onChange={(payload) => set((s) => ({ ...s, payload }))}
        errors={{}}
        deck={deck}
        disabled={false}
        setTitleIfEmpty={(t) => set((s) => (s.title === '' ? { ...s, title: t } : s))}
      />
    </>
  );
  return view;
}

function renderLink(initial: LinkDraftPayload, title?: string) {
  latest = { title: title ?? '', payload: initial };
  return renderWithClient(<Harness initial={initial} title={title} />);
}

const fetchButton = () => screen.getByRole('button', { name: 'Fetch preview' });
const fetched = {
  title: 'Sourdough guide',
  description: 'Feed it twice a day',
  image: 'https://img.example/og.jpg',
};

beforeEach(() => {
  respond.mockReset();
  requests.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('mergePreview', () => {
  it('fills empty text, keeps member text and unknown keys, replaces the image', () => {
    const current = { title: 'Mine', description: ' ', image: 'https://old.example/a.png' };
    expect(mergePreview({ ...current, extra: 1 } as typeof current, fetched)).toEqual({
      title: 'Mine',
      description: 'Feed it twice a day',
      image: 'https://img.example/og.jpg',
      extra: 1,
    });
    expect(mergePreview({ image: 'https://old.example/a.png' }, { title: 'T' })).toEqual({
      title: 'T',
      image: 'https://old.example/a.png',
    });
  });
});

describe('FetchPreview', () => {
  it('is disabled until the URL is a web address', () => {
    renderLink({ url: '' });
    expect(fetchButton()).toBeDisabled();
  });

  it('fetches a bare host as https:// (D205)', async () => {
    respond.mockResolvedValueOnce({ preview: fetched });
    renderLink({ url: 'example.org/bread' });
    fireEvent.click(fetchButton());
    await screen.findByText(/Preview filled in/);
    expect(requests).toHaveBeenCalledWith(PREVIEW_REQUEST, {
      params: { path: { id: 'deck-1' } },
      body: { url: 'https://example.org/bread' },
    });
  });

  it('fills the preview and the empty card title', async () => {
    respond.mockResolvedValueOnce({ preview: fetched });
    renderLink({ url: 'https://example.org/bread' });
    fireEvent.click(fetchButton());
    await screen.findByText(/Preview filled in/);
    expect(requests).toHaveBeenCalledWith(PREVIEW_REQUEST, {
      params: { path: { id: 'deck-1' } },
      body: { url: 'https://example.org/bread' },
    });
    expect(latest.payload.preview).toEqual(fetched);
    expect(screen.getByLabelText('Preview title')).toHaveValue('Sourdough guide');
    expect(screen.getByTestId('title')).toHaveTextContent('Sourdough guide');
  });

  it('keeps the card title and member edits on a refetch', async () => {
    respond.mockResolvedValue({ preview: fetched });
    renderLink({ url: 'https://example.org/bread' }, 'My bread');
    fireEvent.click(fetchButton());
    await screen.findByText(/Preview filled in/);
    fireEvent.change(screen.getByLabelText('Preview title'), { target: { value: 'Edited' } });
    fireEvent.click(fetchButton());
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    await screen.findByText(/Preview filled in/);
    expect(latest.payload.preview?.title).toBe('Edited');
    expect(screen.getByTestId('title')).toHaveTextContent('My bread');
  });

  it.each([
    ['a null preview', () => respond.mockResolvedValueOnce({ preview: null })],
    [
      'a 429',
      () => respond.mockRejectedValueOnce(new ApiError(429, { title: 'Too many requests' })),
    ],
    ['a network error', () => respond.mockRejectedValueOnce(new TypeError('Failed to fetch'))],
  ])('%s reads "No preview available" and changes nothing', async (_label, arrange) => {
    arrange();
    renderLink({ url: 'https://10.0.0.1/x', preview: { title: 'Kept' } });
    fireEvent.click(fetchButton());
    expect(await screen.findByText(NO_PREVIEW)).toBeInTheDocument();
    expect(latest.payload.preview).toEqual({ title: 'Kept' });
    expect(fetchButton()).toBeEnabled();
  });

  it('needs a connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderLink({ url: 'https://example.org/bread' });
    expect(fetchButton()).toBeDisabled();
    expect(screen.getByText(/needs a connection/)).toBeInTheDocument();
  });
});
