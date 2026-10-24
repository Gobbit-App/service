import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { ImportScreen } from './ImportScreen';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap, requests } = await import('../test/api-mock');

const RECIPES = makeCategory({ id: 'c-recipes', name: 'Recipes', slug: 'recipes' });

function answer(role: 'owner' | 'editor' = 'owner', importResult: unknown = null) {
  unwrap.mockImplementation(async (request) => {
    if (request === 'GET /decks/{id}') return makeDeck({ slug: 'family', role });
    if (request === 'GET /decks/{id}/categories') return { data: [RECIPES] };
    if (request === 'POST /decks/{id}/imports') {
      if (importResult instanceof Error) throw importResult;
      return importResult;
    }
    throw new Error(`unexpected ${request}`);
  });
}

const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText('Paste your notes'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
};

describe('ImportScreen (D189/D190)', () => {
  beforeEach(() => {
    unwrap.mockReset();
    requests.mockClear();
  });

  it('pastes notes, previews them and imports them under "Pasted notes"', async () => {
    answer('owner', { imported: 2, duplicates: 1, failed: [] });
    renderWithClient(<ImportScreen deckSlug="family" />);
    await screen.findByLabelText('Paste your notes');
    paste('# Recipes\n- Hummus - chickpeas and tahini\n- Pita');

    expect(await screen.findByText('2 notes found.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 cards' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Imported 2, 1 flagged as possible duplicates.',
    );
    const call = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/imports');
    const body = (call?.[1] as { body: { label: string; rows: unknown[] } }).body;
    expect(body.label).toBe('Pasted notes');
    expect(body.rows).toEqual([
      expect.objectContaining({ title: 'Hummus', categoryIds: ['c-recipes'] }),
      expect.objectContaining({ title: 'Pita', categoryIds: ['c-recipes'] }),
    ]);
    expect(screen.getByRole('link', { name: 'Review them' })).toHaveAttribute(
      'href',
      '/d/family/review?source=Pasted%20notes',
    );
  });

  it('lists the rows that failed by source line', async () => {
    answer('owner', {
      imported: 1,
      duplicates: 0,
      failed: [{ index: 1, problem: '/problems/rate-limited' }],
    });
    renderWithClient(<ImportScreen deckSlug="family" />);
    await screen.findByLabelText('Paste your notes');
    paste('First\nSecond');
    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 cards' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Imported 1, 1 failed.');
    expect(screen.getByText(/Line 2/)).toHaveTextContent(
      'Line 2 (Second): Daily import limit reached; try again tomorrow',
    );
  });

  it('keeps the preview and shows the error when the import is refused', async () => {
    answer('owner', new Error('Network down'));
    renderWithClient(<ImportScreen deckSlug="family" />);
    await screen.findByLabelText('Paste your notes');
    paste('Only note');
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 card' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeEnabled();
  });

  it('is not available to an editor', async () => {
    answer('editor');
    renderWithClient(<ImportScreen deckSlug="family" />);
    expect(
      await screen.findByText('Only owners and maintainers import notes.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Paste your notes')).not.toBeInTheDocument();
  });
});
