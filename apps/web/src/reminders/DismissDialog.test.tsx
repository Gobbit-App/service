import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeReminder } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { currentToast, dismissToast } from '../ui/toast-store';

const POST = vi.fn();
const unwrap = vi.fn();
vi.mock('../api/client', () => ({ api: { GET: vi.fn(), POST }, unwrap }));
const { DismissDialog, DISMISS_OFFLINE } = await import('./DismissDialog');

const item = makeReminder({}, { id: 'r1', title: 'Pay the plumber' });

function open(onClose = vi.fn()) {
  renderWithClient(<DismissDialog item={item} deckSlug="family" onClose={onClose} />);
  return { onClose };
}
const doneSwitch = () => screen.getByRole('switch', { name: 'Done' });
const markDone = () => screen.getByRole('button', { name: /Mark done/ });
const dismissOnly = () => screen.getByRole('button', { name: /Dismiss without marking done/ });

beforeEach(() => {
  POST.mockReset().mockReturnValue('request');
  unwrap
    .mockReset()
    .mockResolvedValue(makeReminder({ state: 'done' }, { id: 'r1', status: 'archived' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  const toast = currentToast();
  if (toast) dismissToast(toast.id);
});

describe('DismissDialog (037)', () => {
  it('is a named dialog with Done off and focused', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Dismiss “Pay the plumber”' })).toBeInTheDocument();
    expect(doneSwitch()).not.toBeChecked();
    expect(doneSwitch()).toHaveFocus();
  });

  it('Mark done waits for the Done switch', () => {
    open();
    expect(markDone()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(markDone());
    expect(POST).not.toHaveBeenCalled();
  });

  it('marks done with the trimmed resolution, toasts and closes', async () => {
    const { onClose } = open();
    fireEvent.click(doneSwitch());
    fireEvent.change(screen.getByLabelText('What happened? (optional)'), {
      target: { value: '  Paid in cash ' },
    });
    expect(screen.getByText('12/600')).toBeInTheDocument();
    fireEvent.click(markDone());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(POST).toHaveBeenCalledWith('/items/{id}/dismiss', {
      params: { path: { id: 'r1' } },
      body: { done: true, resolution: 'Paid in cash' },
    });
    expect(currentToast()?.message).toBe('Reminder marked done');
  });

  it('dismisses without a resolution when none is written', async () => {
    const { onClose } = open();
    fireEvent.click(dismissOnly());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(POST.mock.calls[0]![1]).toMatchObject({ body: { done: false } });
  });

  it('refuses a resolution over the limit', () => {
    open();
    fireEvent.change(screen.getByLabelText('What happened? (optional)'), {
      target: { value: 'x'.repeat(601) },
    });
    expect(screen.getByLabelText('What happened? (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(dismissOnly()).toBeDisabled();
  });

  it('shows why the server refused and stays open', async () => {
    unwrap.mockRejectedValue(
      new ApiError(409, { type: '/problems/invalid-transition', status: 409 }),
    );
    const { onClose } = open();
    fireEvent.click(dismissOnly());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone already dismissed this reminder.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains and ignores both actions offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    open();
    fireEvent.click(doneSwitch());
    expect(screen.getByText(DISMISS_OFFLINE)).toBeInTheDocument();
    fireEvent.click(markDone());
    fireEvent.click(dismissOnly());
    expect(markDone()).toHaveAttribute('aria-disabled', 'true');
    expect(dismissOnly()).toHaveAttribute('aria-disabled', 'true');
    expect(POST).not.toHaveBeenCalled();
  });

  it('Cancel closes without sending', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(POST).not.toHaveBeenCalled();
  });
});
