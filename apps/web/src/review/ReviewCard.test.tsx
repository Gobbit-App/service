import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewEntry } from '@pb/shared';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { ReviewCard } = await import('./ReviewCard');

const now = new Date('2026-01-01T12:00:00.000Z');
const general = makeCategory({ id: 'c-general', name: 'General' });

function entry(
  overrides: Partial<ReviewEntry> = {},
  job: Partial<NonNullable<ReviewEntry['job']>> = {},
): ReviewEntry {
  return {
    item: makeItem({
      id: 'p1',
      status: 'proposed',
      title: 'Dentist',
      body: 'Call ahead',
      entities: { phones: ['555-0100'] },
      categoryIds: ['c-general'],
    }),
    target: null,
    ...overrides,
    job: {
      id: 'j1',
      channel: 'shortcut',
      sharedBy: { id: 'u1', displayName: 'Dana' },
      clientLabel: null,
      createdAt: '2026-01-01T11:58:00.000Z',
      dedup: null,
      newCategory: null,
      sourcePreview: 'https://dentist.example/',
      ...job,
    },
  };
}

function renderCard(value: ReviewEntry, { canCreateCategory = true, busy = false } = {}) {
  const handlers = {
    onPublish: vi.fn(),
    onDiscard: vi.fn(),
    onSaveEdit: vi.fn<(patch: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
  };
  renderWithClient(
    <ReviewCard
      entry={value}
      deck={makeDeck({ slug: 'family' })}
      categories={[general]}
      canCreateCategory={canCreateCategory}
      busy={busy}
      now={now}
      {...handlers}
    />,
  );
  return handlers;
}

describe('ReviewCard', () => {
  it('shows the source line, preview, details and categories', () => {
    renderCard(entry());
    expect(screen.getByRole('article', { name: 'Dentist' })).toBeInTheDocument();
    expect(screen.getByText('shared by Dana via Shortcut · 2 minutes ago')).toBeInTheDocument();
    expect(screen.getByText('https://dentist.example/')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Categories' })).toHaveTextContent('General');
  });

  it('publishes a new proposal and discards', () => {
    const { onPublish, onDiscard } = renderCard(entry());
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenCalledWith({ mode: 'new' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply update' })).not.toBeInTheDocument();
  });

  it('offers apply update with a field diff when the verdict points at a card', () => {
    const target = makeItem({ id: 't1', title: 'Dentist (old)', body: 'Call ahead' });
    const { onPublish } = renderCard(
      entry(
        { target },
        { dedup: { action: 'update', itemId: 't1', similarity: 0.9, via: 'vector' } },
      ),
    );
    expect(screen.getByText(/Updates an existing card/)).toBeInTheDocument();
    expect(screen.getByText('Dentist (old)', { selector: 'del' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));
    expect(onPublish).toHaveBeenLastCalledWith({ mode: 'update' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish as new' }));
    expect(onPublish).toHaveBeenLastCalledWith({ mode: 'new' });
  });

  it('labels a possible duplicate', () => {
    renderCard(
      entry(
        { target: makeItem({ id: 't1', title: 'Dentist' }) },
        { dedup: { action: 'possible_duplicate', itemId: 't1', similarity: 0.8, via: 'title' } },
      ),
    );
    expect(screen.getByText(/Looks like a card you already have/)).toBeInTheDocument();
  });

  it('creates the suggested category unless unticked', () => {
    const { onPublish } = renderCard(entry({}, { newCategory: 'Health' }));
    const box = screen.getByRole('checkbox', { name: 'Create category “Health”' });
    expect(box).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenLastCalledWith({ mode: 'new', createCategory: true });

    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenLastCalledWith({ mode: 'new' });
  });

  it('hides the category suggestion from roles that cannot create one', () => {
    renderCard(entry({}, { newCategory: 'Health' }), { canCreateCategory: false });
    expect(screen.queryByRole('checkbox', { name: /Create category/ })).not.toBeInTheDocument();
  });

  it('disables the actions while busy', () => {
    renderCard(entry(), { busy: true });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('saves only the edited fields, then leaves edit mode', async () => {
    const { onSaveEdit } = renderCard(entry());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Dentist Dr. Levi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSaveEdit).toHaveBeenCalledWith({ title: 'Dentist Dr. Levi' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(),
    );
  });

  it('keeps the form open and shows the error when saving fails', async () => {
    const { onSaveEdit } = renderCard(entry());
    onSaveEdit.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('closes the form without a request when nothing changed', () => {
    const { onSaveEdit } = renderCard(entry());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});
