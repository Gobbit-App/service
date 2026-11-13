import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck, ReviewEntry, ReviewList } from '@gobbit/shared';
import { queryKeys } from '../api/query-keys';
import { makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { ProposalReview, canReviewOnCard, entryFor } = await import('./ProposalReview');

const proposal = makeItem({ id: 'p1', title: 'Dentist', status: 'proposed' });
const target = makeItem({ id: 't1', title: 'Dentist (old)' });

function job(
  fields: Partial<NonNullable<ReviewEntry['job']>> = {},
): NonNullable<ReviewEntry['job']> {
  return {
    id: 'j1',
    channel: 'paste',
    sharedBy: null,
    clientLabel: null,
    createdAt: '2026-01-01T11:58:00.000Z',
    dedup: null,
    newCategory: null,
    sourcePreview: null,
    autoPublish: null,
    extractionFallback: null,
    ...fields,
  };
}

const list = (...entries: ReviewEntry[]): ReviewList => ({ data: entries, count: entries.length });

function answer(queue: ReviewList, publish: () => Promise<unknown> = () => new Promise(() => {})) {
  respond.mockImplementation((request) => {
    if (request === 'GET /decks/{id}/review') return Promise.resolve(queue);
    if (request === 'POST /items/{id}/publish') return publish();
    if (request === 'POST /items/{id}/discard') return Promise.resolve(undefined);
    return new Promise(() => undefined);
  });
}

function renderPanel(deck: Deck = makeDeck({ slug: 'family', role: 'owner' })) {
  const queryClient = testQueryClient();
  return renderWithClient(<ProposalReview item={proposal} deck={deck} />, { queryClient });
}

const publishBody = () =>
  (requests.mock.calls.find(([r]) => r === 'POST /items/{id}/publish')?.[1] as { body: unknown })
    ?.body;

describe('canReviewOnCard', () => {
  it('is true only for a live proposal and a publishing role', () => {
    expect(canReviewOnCard(proposal, 'owner')).toBe(true);
    expect(canReviewOnCard(proposal, 'maintainer')).toBe(true);
    expect(canReviewOnCard(proposal, 'editor')).toBe(false);
    expect(canReviewOnCard(proposal, 'reader')).toBe(false);
    expect(canReviewOnCard(proposal, undefined)).toBe(false);
    expect(canReviewOnCard(makeItem({ status: 'published' }), 'owner')).toBe(false);
    expect(canReviewOnCard({ ...proposal, deletedAt: '2026-01-01T00:00:00.000Z' }, 'owner')).toBe(
      false,
    );
  });
});

describe('entryFor', () => {
  it('finds the queue entry, else a bare one that publishes as new', () => {
    const queued: ReviewEntry = { item: proposal, job: job(), target: null };
    expect(entryFor(proposal, [queued])).toBe(queued);
    expect(entryFor(proposal, undefined)).toEqual({ item: proposal, job: null, target: null });
  });
});

describe('ProposalReview', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('publishes a new proposal and shows it as the published card', async () => {
    const published = { ...proposal, status: 'published' as const };
    answer(list({ item: proposal, job: job(), target: null }), () => Promise.resolve(published));
    const { queryClient, navigate } = renderPanel();

    expect(screen.getByRole('heading', { name: 'Waiting for review' })).toBeInTheDocument();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(queryClient.getQueryData(queryKeys.item('p1'))).toEqual(published));
    expect(publishBody()).toEqual({ mode: 'new' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('applies an update and opens the updated card', async () => {
    answer(
      list({
        item: proposal,
        job: job({ dedup: { action: 'update', itemId: 't1', similarity: 0.9, via: 'vector' } }),
        target,
      }),
      () => Promise.resolve(target),
    );
    const { navigate } = renderPanel();

    expect(await screen.findByText(/Updates an existing card/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish as new' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/i/t1', { replace: true }));
    expect(publishBody()).toEqual({ mode: 'update' });
  });

  it('offers the suggested category to roles that may create one', async () => {
    answer(list({ item: proposal, job: job({ newCategory: 'Health' }), target: null }));
    renderPanel();
    const toggle = await screen.findByRole('checkbox', { name: 'Create category “Health”' });
    expect(toggle).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(publishBody()).toEqual({ mode: 'new', createCategory: true }));
  });

  it('discards and returns to the deck', async () => {
    answer(list({ item: proposal, job: job(), target: null }));
    const { navigate } = renderPanel();
    const discard = await screen.findByRole('button', { name: 'Discard' });
    await waitFor(() => expect(discard).toBeEnabled());
    fireEvent.click(discard);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family'));
  });

  it('shows why publishing failed', async () => {
    answer(list({ item: proposal, job: job(), target: null }), () =>
      Promise.reject(new Error('nope')),
    );
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
