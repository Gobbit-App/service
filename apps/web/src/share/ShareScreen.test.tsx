import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { makeDeck, makeShare } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import type { SharedPayload } from './share-payload';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
vi.mock('./share-store', () => ({
  readPending: vi.fn(),
  clearPending: vi.fn(async () => {}),
}));
const { respond, requests } = await import('../test/api-mock');
const store = await import('./share-store');
const { ShareScreen, EXPIRED_NOTICE, FAILED_NOTICE } = await import('./ShareScreen');
const { SEND_ERROR, URL_ERROR } = await import('./ShareForm');

const readPending = vi.mocked(store.readPending);
const clearPending = vi.mocked(store.clearPending);

const family = makeDeck({ id: 'd-family', slug: 'family', name: 'Family', role: 'owner' });
const mine = makeDeck({ id: 'd-me', slug: 'me', name: 'Mine', kind: 'personal', role: 'owner' });
const club = makeDeck({ id: 'd-club', slug: 'club', name: 'Club', role: 'reader' });

const payload: SharedPayload = {
  id: 'p1',
  createdAt: 0,
  title: 'Shared page',
  text: '',
  url: 'https://a.example/x',
  files: [],
};

function answer(decks: Deck[], ingest: () => Promise<unknown> = async () => ({ id: 'j1' })) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /decks') return { data: decks };
    if (request === 'POST /ingest') return ingest();
    if (request === 'GET /shares/{id}') return makeShare({ id: 'j1' });
    throw new Error(`unexpected ${request}`);
  });
}

/** The FormData sent with the last `POST /ingest`. */
function sentForm(): FormData {
  const call = requests.mock.calls.filter(([request]) => request === 'POST /ingest').at(-1);
  return (call?.[1] as { body: FormData }).body;
}

describe('ShareScreen', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
    readPending.mockReset();
    clearPending.mockClear();
    localStorage.clear();
  });

  it('sends a pasted text to the requested deck', async () => {
    answer([mine, family]);
    renderWithClient(<ShareScreen requestedDeck="family" />);

    expect(await screen.findByLabelText('Deck')).toHaveValue('family');
    const send = screen.getByRole('button', { name: 'Send to Gobbit' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Gate code 1234' } });
    fireEvent.click(send);

    expect(await screen.findByRole('heading', { name: 'Sent' })).toBeInTheDocument();
    const form = sentForm();
    expect(form.get('deckId')).toBe('d-family');
    expect(form.get('channel')).toBe('paste');
    expect(form.get('text')).toBe('Gate code 1234');
    expect(screen.getByRole('link', { name: 'Your shares' })).toBeInTheDocument();
    expect(readPending).not.toHaveBeenCalled();
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('pre-fills a pending share, sends it as pwa and clears it', async () => {
    readPending.mockResolvedValue(payload);
    answer([mine, family]);
    renderWithClient(<ShareScreen pendingId="p1" />);

    expect(await screen.findByText('Shared page')).toBeInTheDocument();
    expect(screen.getByLabelText('Link')).toHaveValue('https://a.example/x');
    expect(screen.getByLabelText('Deck')).toHaveValue('me');
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));

    await screen.findByRole('heading', { name: 'Sent' });
    const form = sentForm();
    expect(form.get('channel')).toBe('pwa');
    expect(form.get('title')).toBe('Shared page');
    expect(form.get('url')).toBe('https://a.example/x');
    expect(form.get('deckId')).toBe('d-me');
    await waitFor(() => expect(clearPending).toHaveBeenCalledOnce());
  });

  it('explains an expired share and falls back to the paste box', async () => {
    readPending.mockResolvedValue(null);
    answer([family]);
    renderWithClient(<ShareScreen pendingId="gone" />);
    expect(await screen.findByText(EXPIRED_NOTICE)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('');
  });

  it('explains a share the service worker could not store', async () => {
    answer([family]);
    renderWithClient(<ShareScreen failed />);
    expect(await screen.findByText(FAILED_NOTICE)).toBeInTheDocument();
  });

  it('rejects a link that is not http(s) without sending', async () => {
    answer([family]);
    renderWithClient(<ShareScreen />);
    fireEvent.change(await screen.findByLabelText('Link'), { target: { value: 'ftp://x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));
    expect(await screen.findByText(URL_ERROR)).toBeInTheDocument();
    expect(screen.getByLabelText('Link')).toHaveAttribute('aria-invalid', 'true');
    expect(respond).not.toHaveBeenCalledWith('POST /ingest');
  });

  it('adds https:// to a link typed without it (D205)', async () => {
    answer([family]);
    renderWithClient(<ShareScreen />);
    const link = await screen.findByLabelText('Link');
    fireEvent.focus(link);
    expect(link).toHaveValue('https://');
    expect(screen.getByRole('button', { name: 'Send to Gobbit' })).toBeDisabled();
    fireEvent.change(link, { target: { value: 'https://https://example.org/a' } });
    expect(link).toHaveValue('https://example.org/a');
    fireEvent.change(link, { target: { value: 'example.org/a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));

    await screen.findByRole('heading', { name: 'Sent' });
    expect(sentForm().get('url')).toBe('https://example.org/a');
  });

  it('clears a link left at only the scheme', async () => {
    answer([family]);
    renderWithClient(<ShareScreen />);
    const link = await screen.findByLabelText('Link');
    fireEvent.focus(link);
    fireEvent.blur(link);
    expect(link).toHaveValue('');
  });

  it('shows the API problem when sending fails', async () => {
    answer([family], async () => {
      throw new ApiError(429, { title: 'Too many', detail: 'Slow down a little.' });
    });
    renderWithClient(<ShareScreen />);
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down a little.');
  });

  it('shows a generic error on a network failure', async () => {
    answer([family], async () => {
      throw new TypeError('Failed to fetch');
    });
    renderWithClient(<ShareScreen />);
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SEND_ERROR);
  });

  it('offers only decks the user can add to', async () => {
    answer([club, family]);
    renderWithClient(<ShareScreen requestedDeck="club" />);
    expect(await screen.findByLabelText('Deck')).toHaveValue('family');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('says there is nowhere to share when every deck is read-only', async () => {
    answer([club]);
    renderWithClient(<ShareScreen />);
    expect(await screen.findByText('Nowhere to share to')).toBeInTheDocument();
  });

  it('follows the sent share by the id the API returned (D198)', async () => {
    answer([makeDeck({ id: 'd-e', slug: 'e', name: 'E', role: 'editor' })]);
    renderWithClient(<ShareScreen />);
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Gobbit' }));
    expect(await screen.findByText('Processing…')).toBeInTheDocument();
    expect(requests).toHaveBeenCalledWith(
      'GET /shares/{id}',
      expect.objectContaining({
        params: { path: { id: 'j1' } },
      }),
    );
  });
});
