import { IMPORT_DISCARD_MAX } from '@gobbit/shared/ingest-constants';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewList } from '@gobbit/shared';
import { makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap, requests } = await import('../test/api-mock');
const { ReviewQueue } = await import('./ReviewQueue');

const queue = (...titles: string[]): ReviewList => ({
  data: titles.map((title, index) => ({
    item: makeItem({ id: `p${index}`, title, status: 'proposed' }),
    job: null,
    target: null,
  })),
  count: titles.length,
});

const DISCARD = 'POST /decks/{id}/review/discard';
const REVIEW = 'GET /decks/{id}/review';
const ACTION = 'Discard all from this import';

function renderQueue(source?: string) {
  return renderWithClient(
    <ReviewQueue
      deck={makeDeck({ slug: 'family' })}
      categories={[]}
      canCreateCategory={false}
      source={source}
    />,
    { queryClient: testQueryClient() },
  );
}

/**
 * T057 contract: a button "Discard all from this import" (only with `source`) opens a Sheet
 * (dialog) naming the label (no count: only a page is loaded), with buttons "Discard all" and "Cancel"; confirming posts
 * `{ source }`, then a role=status notice reads "Discarded N card(s)" and "Skipped M".
 */
describe('discard a whole import (D449)', () => {
  beforeEach(() => {
    unwrap.mockReset();
    requests.mockClear();
  });

  it('hides the action without a source filter', async () => {
    unwrap.mockResolvedValue(queue('Dentist'));
    renderQueue();
    await screen.findByRole('heading', { name: 'Dentist' });
    expect(screen.queryByRole('button', { name: ACTION })).not.toBeInTheDocument();
  });

  it('confirms in a sheet naming the label (no count: only a page is loaded), and Cancel does nothing', async () => {
    unwrap.mockResolvedValue(queue('Dentist', 'Pizza'));
    renderQueue('Street notes.md');

    fireEvent.click(await screen.findByRole('button', { name: ACTION }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Street notes\.md/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Every card still waiting/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/\d+ cards?/)).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.mock.calls.some(([r]) => r === DISCARD)).toBe(false);
  });

  it('posts the source, shows discarded and skipped, and refetches the queue', async () => {
    unwrap.mockImplementation((request) => {
      if (request === REVIEW) return Promise.resolve(queue('Dentist', 'Pizza'));
      if (request === DISCARD) return Promise.resolve({ discarded: 1, skipped: 1 });
      return new Promise(() => undefined);
    });
    renderQueue('Street notes.md');

    fireEvent.click(await screen.findByRole('button', { name: ACTION }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Discard all' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Discarded 1 card');
    expect(notice).toHaveTextContent('Skipped 1');
    expect(notice).not.toHaveTextContent(/may remain/);
    const call = requests.mock.calls.find(([r]) => r === DISCARD);
    expect(call?.[1]).toMatchObject({
      params: { path: { id: 'family' } },
      body: { source: 'Street notes.md' },
    });
    await waitFor(() =>
      expect(requests.mock.calls.filter(([r]) => r === REVIEW).length).toBeGreaterThan(1),
    );
  });

  it('says more cards may remain when one call hit the server cap', async () => {
    unwrap.mockImplementation((request) => {
      if (request === REVIEW) return Promise.resolve(queue('Dentist'));
      if (request === DISCARD)
        return Promise.resolve({ discarded: IMPORT_DISCARD_MAX - 1, skipped: 1 });
      return new Promise(() => undefined);
    });
    renderQueue('Street notes.md');

    fireEvent.click(await screen.findByRole('button', { name: ACTION }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Discard all' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/More cards .* may remain/);
  });
});
