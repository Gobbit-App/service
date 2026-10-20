import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToast, dismissToast, showToast } from './toast-store';
import { ToastHost, UNDO_TOAST_MS, UndoToast } from './UndoToast';

describe('UndoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the message and the action in a status region', () => {
    render(
      <UndoToast
        message="Card archived"
        actionLabel="Undo"
        onAction={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Card archived');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('fires the action once and dismisses', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <UndoToast
        message="Card archived"
        actionLabel="Undo"
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismisses itself after 6 seconds', () => {
    const onDismiss = vi.fn();
    render(<UndoToast message="Card deleted" onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders no button without an action', () => {
    render(<UndoToast message="Couldn't archive the card." onDismiss={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ToastHost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    const toast = currentToast();
    if (toast) act(() => dismissToast(toast.id));
    vi.useRealTimers();
  });

  it('shows the latest toast and clears it after the timeout', () => {
    render(<ToastHost />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      showToast({ message: 'First' });
      showToast({ message: 'Second', action: { label: 'Undo', onAction: vi.fn() } });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Second');

    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a stale dismiss does not hide a newer toast', () => {
    render(<ToastHost />);
    let first = 0;
    act(() => {
      first = showToast({ message: 'First' });
      showToast({ message: 'Second' });
      dismissToast(first);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Second');
  });
});
