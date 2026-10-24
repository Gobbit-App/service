import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewList } from '@pb/shared';
import { queryKeys } from '../api/query-keys';
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

function renderQueue(source?: string) {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.reviewCount('family'), { count: 2 });
  return renderWithClient(
    <ReviewQueue
      deck={makeDeck({ slug: 'family' })}
      categories={[]}
      canCreateCategory={false}
      source={source}
    />,
    { queryClient },
  );
}

describe('ReviewQueue', () => {
  beforeEach(() => {
    unwrap.mockReset();
    requests.mockClear();
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

  describe('select mode (D191)', () => {
    it('selects all shown, publishes them and lists the skipped ones', async () => {
      let published = false;
      unwrap.mockImplementation((request) => {
        if (request === 'GET /decks/{id}/review') {
          // The refetch after publishing still holds the skipped proposal.
          const left = queue('Dentist', 'Pizza', 'Plumber');
          if (published) left.data = left.data.filter((e) => e.item.id === 'p1');
          return Promise.resolve(left);
        }
        if (request === 'POST /decks/{id}/review/publish') {
          published = true;
          return Promise.resolve({
            published: ['p0', 'p2'],
            skipped: [{ id: 'p1', reason: 'needs-decision' }],
          });
        }
        return new Promise(() => undefined);
      });
      const { queryClient } = renderQueue();

      fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
      fireEvent.click(screen.getByRole('button', { name: 'Publish selected (3)' }));

      expect(await screen.findByText('Published 2 cards')).toBeInTheDocument();
      const call = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/review/publish');
      expect(call?.[1]).toMatchObject({ body: { ids: ['p0', 'p1', 'p2'] } });
      expect(screen.getByRole('status')).toHaveTextContent('Pizza — needs a decision');
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Dentist' })).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('heading', { name: 'Pizza' })).toBeInTheDocument();
      expect(queryClient.getQueryData(queryKeys.reviewCount('family'))).toEqual({ count: 0 });
    });

    it('publishes only the ticked proposals', async () => {
      unwrap.mockImplementation((request) => {
        if (request === 'GET /decks/{id}/review') return Promise.resolve(queue('Dentist', 'Pizza'));
        if (request === 'POST /decks/{id}/review/publish') {
          return Promise.resolve({ published: ['p1'], skipped: [] });
        }
        return new Promise(() => undefined);
      });
      renderQueue();

      fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
      expect(screen.getByRole('button', { name: 'Publish selected (0)' })).toBeDisabled();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza' }));
      fireEvent.click(screen.getByRole('button', { name: 'Publish selected (1)' }));

      expect(await screen.findByText('Published 1 card')).toBeInTheDocument();
      const call = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/review/publish');
      expect(call?.[1]).toMatchObject({ body: { ids: ['p1'] } });
    });

    it('shows the problem and keeps the queue when bulk publish fails', async () => {
      unwrap.mockImplementation((request) => {
        if (request === 'GET /decks/{id}/review') return Promise.resolve(queue('Dentist'));
        if (request === 'POST /decks/{id}/review/publish') return Promise.reject(new Error('no'));
        return new Promise(() => undefined);
      });
      renderQueue();

      fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
      fireEvent.click(screen.getByRole('button', { name: 'Publish selected (1)' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Dentist' })).toBeInTheDocument();
    });
  });

  it('asks for one import and shows its label with a way back to all (D191)', async () => {
    unwrap.mockImplementation((request) =>
      request === 'GET /decks/{id}/review'
        ? Promise.resolve(queue('Dentist'))
        : new Promise(() => undefined),
    );
    renderQueue('Street notes.md');

    expect(await screen.findByText('From “Street notes.md”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all' })).toHaveAttribute(
      'href',
      '/d/family/review',
    );
    const call = requests.mock.calls.find(([r]) => r === 'GET /decks/{id}/review');
    expect(call?.[1]).toMatchObject({ params: { query: { source: 'Street notes.md' } } });
  });
});
