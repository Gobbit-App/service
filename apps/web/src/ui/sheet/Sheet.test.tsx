import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Sheet labelledBy="t" describedBy="d" onClose={close} initialFocus={okRef}>
          <h2 id="t">Title</h2>
          <p id="d">Description</p>
          <button type="button">First</button>
          <button type="button" ref={okRef}>
            OK
          </button>
        </Sheet>
      )}
    </>
  );
}

function open(onClose = vi.fn()) {
  render(<Harness onClose={onClose} />);
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, onClose };
}

describe('Sheet', () => {
  it('is a named, described dialog that focuses the initial control', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog).toHaveAccessibleDescription('Description');
    expect(dialog).toHaveClass('sheet');
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
  });

  it('Escape (the cancel event) calls onClose instead of closing itself, then returns focus', () => {
    const { onClose, opener } = open();
    const event = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('a click on the backdrop (the dialog itself) closes; a click inside does not', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByText('Description'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet swipe and close (053)', () => {
  function swipe(distance: number, finish: 'pointerUp' | 'pointerCancel' = 'pointerUp') {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <Sheet labelledBy="t" onClose={onClose} closeLabel="Close things">
        <h2 id="t">Title</h2>
      </Sheet>,
    );
    const grip = container.querySelector('.sheet__grip') as HTMLElement;
    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 100 + distance, pointerId: 1 });
    fireEvent[finish](grip, { clientY: 100 + distance, pointerId: 1 });
    return onClose;
  }

  it('closes when the handle is dragged down far enough', () => {
    expect(swipe(150)).toHaveBeenCalledTimes(1);
  });

  it('springs back on a short drag or a cancelled one', () => {
    expect(swipe(20)).not.toHaveBeenCalled();
    expect(swipe(150, 'pointerCancel')).not.toHaveBeenCalled();
  });

  it('shows a corner close button only when asked for one', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet labelledBy="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Sheet>,
    );
    expect(screen.queryByRole('button', { name: 'Close things' })).toBeNull();
    rerender(
      <Sheet labelledBy="t" onClose={onClose} closeLabel="Close things">
        <h2 id="t">Title</h2>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close things' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
