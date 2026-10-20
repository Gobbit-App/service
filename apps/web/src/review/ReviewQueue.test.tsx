import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewList } from '@pb/shared';
import { queryKeys } from '../api/query-keys';
import { makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { ReviewQueue } = await import('./ReviewQueue');

const queue = (...titles: string[]): ReviewList => ({
  data: titles.map((title, index) => ({
    item: makeItem({ id: `p${index}`, title, status: 'proposed' }),
    job: null,
    target: null,
  })),
  count: titles.length,
});

function renderQueue() {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.reviewCount('family'), { count: 2 });
  return renderWithClient(
    <ReviewQueue deck={makeDeck({ slug: 'family' })} categories={[]} canCreateCategory={false} />,
    { queryClient },
  );
}

describe('ReviewQueue', () => {
  beforeEach(() => {
    unwrap.mockReset();
  });

  it('shows the empty state', async () => {
    unwrap.mockResolvedValue(queue());
    renderQueue();
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });

  it('shows an error with retry when the queue fails to load', async () => {
    unwrap.mockRejectedValue(new Error('down'));
    renderQueue();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('removes a published proposal right away and decrements the count', async () => {
    let finish: (value: unknown) => void = () => undefined;
    unwrap.mockImplementation((request) => {
      if (request === 'GET /decks/{id}/review') return Promise.resolve(queue('Dentist', 'Pizza'));
      if (request === 'POST /items/{id}/publish')
        return new Promise((resolve) => (finish = resolve));
      return new Promise(() => undefined);
    });
    const { queryClient } = renderQueue();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' }))[0]!);
    await waitFor(() => expect(screen.queryByText('Dentist')).not.toBeInTheDocument());
    expect(screen.getByText('Pizza')).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.reviewCount('family'))).toEqual({ count: 1 });
    finish(makeItem({ id: 'p0' }));
  });

  it('restores the proposal and shows the problem when discarding fails', async () => {
    unwrap.mockImplementation((request) => {
      if (request === 'GET /decks/{id}/review') return Promise.resolve(queue('Dentist'));
      if (request === 'POST /items/{id}/discard') return Promise.reject(new Error('nope'));
      return new Promise(() => undefined);
    });
    const { queryClient } = renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Dentist')).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.reviewCount('family'))).toEqual({ count: 2 });
  });
});
