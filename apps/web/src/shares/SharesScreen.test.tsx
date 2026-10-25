import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeShare } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, mockConfig } = await import('../test/api-mock');
const { SharesScreen, SHARING_OFF } = await import('./SharesScreen');

function answerShares(shares: unknown[] | (() => Promise<unknown>)) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /decks/{id}/shares') {
      return typeof shares === 'function' ? shares() : { shares };
    }
    throw new Error(`unexpected ${request}`);
  });
}

describe('SharesScreen (D198)', () => {
  beforeEach(() => {
    respond.mockReset();
    mockConfig.ingestEnabled = true;
  });
  afterEach(() => {
    mockConfig.ingestEnabled = false;
  });

  it('shows an empty state', async () => {
    answerShares([]);
    renderWithClient(<SharesScreen deckSlug="family" />);
    expect(await screen.findByText('No shares yet')).toBeInTheDocument();
  });

  it('says sharing is off when the server has no assistant', async () => {
    mockConfig.ingestEnabled = false;
    answerShares([]);
    renderWithClient(<SharesScreen deckSlug="family" />);
    expect(await screen.findByText(SHARING_OFF)).toBeInTheDocument();
  });

  it('lists the shares newest first as the API returns them', async () => {
    answerShares([
      makeShare({ id: '00000000-0000-4000-8000-0000000000e2', state: 'processing' }),
      makeShare({ state: 'failed', failureCode: 'assistant_unavailable', canRetry: true }),
    ]);
    renderWithClient(<SharesScreen deckSlug="family" />);
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Processing…');
    expect(rows[1]).toHaveTextContent("The assistant wasn't available.");
  });

  it('shows the access error when the list cannot load', async () => {
    answerShares(async () => {
      throw new ApiError(404, { title: 'Not found' });
    });
    renderWithClient(<SharesScreen deckSlug="family" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
