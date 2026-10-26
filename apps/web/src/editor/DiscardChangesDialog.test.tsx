import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiscardChangesDialog } from './DiscardChangesDialog';

function Harness({ onDiscard }: { onDiscard: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAsking(true)}>
        Leave
      </button>
      {asking && <DiscardChangesDialog onKeep={() => setAsking(false)} onDiscard={onDiscard} />}
    </>
  );
}

function open(onDiscard = vi.fn()) {
  render(<Harness onDiscard={onDiscard} />);
  const leave = screen.getByRole('button', { name: 'Leave' });
  leave.focus();
  fireEvent.click(leave);
  return { leave, onDiscard };
}

describe('DiscardChangesDialog', () => {
  it('is a named dialog with a description, Keep editing focused', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Discard changes?' });
    expect(dialog).toHaveAccessibleDescription("Your changes to this card haven't been saved.");
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('Keep editing closes it and returns focus', () => {
    const { leave, onDiscard } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(leave).toHaveFocus();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Escape (the cancel event) is Keep editing', () => {
    const { onDiscard } = open();
    const dialog = screen.getByRole('dialog');
    const event = new Event('cancel', { cancelable: true });
    fireEvent(dialog, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Discard calls back', () => {
    const { onDiscard } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
