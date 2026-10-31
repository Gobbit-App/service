import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareSummary } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { makeShare } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { ShareRow } = await import('./ShareRow');

const NOW = new Date('2026-01-01T00:05:00.000Z');
const ITEM_ID = '00000000-0000-4000-8000-000000000001';

function renderRow(share: ShareSummary, online = true, canRestore = false) {
  return renderWithClient(
    <ul>
      <ShareRow share={share} deckSlug="family" online={online} now={NOW} canRestore={canRestore} />
    </ul>,
  );
}

describe('ShareRow (D198)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('shows a processing share with its title and time, no actions', () => {
    renderRow(makeShare());
    expect(screen.getByText('a.example')).toBeInTheDocument();
    expect(screen.getByText('Processing…')).toBeInTheDocument();
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('links a published share to its card', () => {
    const { navigate } = renderRow(
      makeShare({
        state: 'published',
        autoPublish: 'published',
        item: { id: ITEM_ID, title: 'Gate code', deleted: false },
      }),
    );
    expect(screen.getByText('Gate code')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open card' }));
    expect(navigate).toHaveBeenCalledWith(`/i/${ITEM_ID}`);
  });

  it('links a share in review to the proposal with the held reason', () => {
    const { navigate } = renderRow(
      makeShare({
        state: 'in_review',
        autoPublish: 'held_needs_category',
        item: { id: ITEM_ID, title: 'Gate code', deleted: false },
      }),
    );
    expect(screen.getByText('Waiting for review — needs a category')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open proposal' }));
    expect(navigate).toHaveBeenCalledWith(`/i/${ITEM_ID}`);
  });

  it('says the card was deleted instead of linking to it', () => {
    renderRow(
      makeShare({
        state: 'published',
        item: { id: ITEM_ID, title: 'Gate code', deleted: true },
      }),
    );
    expect(screen.getByText('Card deleted')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links a deleted card to Recently deleted for someone who can restore it', () => {
    const { navigate } = renderRow(
      makeShare({
        state: 'published',
        item: { id: ITEM_ID, title: 'Gate code', deleted: true },
      }),
      true,
      true,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Card deleted — open Recently deleted' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/archived');
  });

  it('shows who discarded a share and when', () => {
    renderRow(
      makeShare({
        state: 'not_added',
        reviewedBy: { displayName: 'Dana' },
        reviewedAt: '2026-01-01T00:04:00.000Z',
      }),
    );
    expect(screen.getByText('Not added')).toBeInTheDocument();
    expect(screen.getByText('By Dana')).toBeInTheDocument();
  });

  it('explains a failure and retries it', async () => {
    const failed = makeShare({ state: 'failed', failureCode: 'image_unavailable', canRetry: true });
    respond.mockImplementation(async (request) => {
      if (request === 'POST /shares/{id}/retry') return { ...failed, state: 'processing' };
      if (request === 'GET /decks/{id}/shares') return { shares: [] };
      throw new Error(`unexpected ${request}`);
    });
    renderRow(failed);

    expect(screen.getByText("Couldn't add this")).toBeInTheDocument();
    expect(screen.getByText("The photo couldn't be read.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith('POST /shares/{id}/retry', {
        params: { path: { id: failed.id } },
      }),
    );
  });

  it('switches to Paste it again when the retry answers 410', async () => {
    const failed = makeShare({ state: 'failed', failureCode: 'fetch_failed', canRetry: true });
    respond.mockImplementation(async (request) => {
      if (request === 'POST /shares/{id}/retry') {
        throw new ApiError(410, { title: 'Gone', detail: 'No longer kept.' });
      }
      return { shares: [] };
    });
    const { navigate } = renderRow(failed);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Paste it again' }));
    expect(navigate).toHaveBeenCalledWith('/share?deck=family');
  });

  it('shows the retry error when it is not a 410', async () => {
    const failed = makeShare({ state: 'failed', failureCode: 'fetch_failed', canRetry: true });
    respond.mockImplementation(async (request) => {
      if (request === 'POST /shares/{id}/retry') {
        throw new ApiError(409, { title: 'Conflict', detail: 'Tried too many times.' });
      }
      return { shares: [] };
    });
    renderRow(failed);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tried too many times.');
  });

  it('offers Paste it again for an expired share', () => {
    renderRow(makeShare({ state: 'failed', failureCode: 'content_expired' }));
    expect(screen.getByRole('link', { name: 'Paste it again' })).toBeInTheDocument();
  });

  it('asks to forward an expired email share again', () => {
    renderRow(makeShare({ channel: 'email', state: 'failed', failureCode: 'content_expired' }));
    expect(screen.getByText('Forward the email again to share it.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('disables the actions offline (FR-016)', () => {
    renderRow(makeShare({ state: 'failed', failureCode: 'fetch_failed', canRetry: true }), false);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('disables Paste it again offline', () => {
    renderRow(makeShare({ state: 'failed', failureCode: 'content_expired' }), false);
    expect(screen.getByRole('button', { name: 'Paste it again' })).toBeDisabled();
  });

  it('has no Try again when the share cannot be retried', () => {
    renderRow(makeShare({ state: 'failed', failureCode: 'sharer_left', canRetry: false }));
    expect(screen.getByText("You're no longer a member of this deck.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
