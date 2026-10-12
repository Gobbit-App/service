import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../api/api-error';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { AskView } = await import('./AskView');

const ASK_URL = 'POST /decks/{id}/ask';

describe('AskView', () => {
  beforeEach(() => respond.mockReset());

  it('shows the idle hint and keeps Ask disabled for a too-short question', () => {
    renderWithClient(<AskView deckSlug="family" question="ab" />);

    expect(
      screen.getByText('Ask a question and get an answer from the cards in this pocketbook.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    expect(respond).not.toHaveBeenCalled();
  });

  it('shows a grounded answer with source links to the cited cards', async () => {
    respond.mockResolvedValueOnce({
      answer: 'Grandma wrote it.',
      citations: [{ itemId: 'i1', title: 'The letter' }],
      grounded: true,
    });
    renderWithClient(<AskView deckSlug="family" question="Who wrote the letter?" />);

    const button = screen.getByRole('button', { name: 'Ask' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(await screen.findByText('Grandma wrote it.')).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The letter' })).toHaveAttribute('href', '/i/i1');
    expect(respond).toHaveBeenCalledWith(ASK_URL);
  });

  it('shows the not-grounded empty state when nothing answers the question', async () => {
    respond.mockResolvedValueOnce({
      answer: 'No card covers that.',
      citations: [],
      grounded: false,
    });
    renderWithClient(<AskView deckSlug="family" question="What is the weather?" />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Nothing in this pocketbook answers that')).toBeInTheDocument();
    expect(screen.getByText('No card covers that.')).toBeInTheDocument();
  });

  it('shows rate-limit copy on a 429', async () => {
    respond.mockRejectedValueOnce(new ApiError(429, null));
    renderWithClient(<AskView deckSlug="family" question="Who wrote the letter?" />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(
      await screen.findByText("You've asked a lot this hour — try again later."),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't answer")).toBeInTheDocument();
  });

  it('shows unavailable copy on a 503', async () => {
    respond.mockRejectedValueOnce(new ApiError(503, null));
    renderWithClient(<AskView deckSlug="family" question="Who wrote the letter?" />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Ask is unavailable right now.')).toBeInTheDocument();
  });
});
