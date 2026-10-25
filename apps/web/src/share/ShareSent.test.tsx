import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareSummary } from '@pb/shared';
import { makeDeck, makeShare } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { ShareSent } = await import('./ShareSent');

const ITEM_ID = '00000000-0000-4000-8000-000000000001';
const share = makeShare();

function answer(next: Partial<ShareSummary>) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /shares/{id}') return { ...share, ...next };
    throw new Error(`unexpected ${request}`);
  });
}

function renderSent() {
  return renderWithClient(<ShareSent deck={makeDeck()} shareId={share.id} />);
}

describe('ShareSent (D108, D198)', () => {
  beforeEach(() => {
    respond.mockReset();
  });

  it('shows the share is processing and no longer promises review (FR-006)', async () => {
    answer({});
    renderSent();
    expect(screen.getByRole('heading', { name: 'Sent' })).toBeInTheDocument();
    expect(await screen.findByText('Processing…')).toBeInTheDocument();
    expect(screen.queryByText(/appear in review/i)).toBeNull();
  });

  it('shows a published share with a link to the card', async () => {
    answer({
      state: 'published',
      autoPublish: 'published',
      item: { id: ITEM_ID, title: 'Gate code', deleted: false },
    });
    const { navigate } = renderSent();
    fireEvent.click(await screen.findByRole('link', { name: 'Open card' }));
    expect(navigate).toHaveBeenCalledWith(`/i/${ITEM_ID}`);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('shows a share waiting for review with the held reason', async () => {
    answer({
      state: 'in_review',
      autoPublish: 'held_duplicate',
      item: { id: ITEM_ID, title: 'Gate code', deleted: false },
    });
    renderSent();
    expect(await screen.findByText('Waiting for review — possible duplicate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open proposal' })).toBeInTheDocument();
  });

  it('shows why a share failed with Try again', async () => {
    answer({ state: 'failed', failureCode: 'image_unavailable', canRetry: true });
    renderSent();
    expect(await screen.findByText("The photo couldn't be read.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('links to Your shares and back to the deck', () => {
    answer({});
    const { navigate } = renderSent();
    fireEvent.click(screen.getByRole('link', { name: 'Your shares' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/shares');
    fireEvent.click(screen.getByRole('link', { name: 'Back to Family' }));
    expect(navigate).toHaveBeenCalledWith('/d/family');
  });
});
