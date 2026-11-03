import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from './use-long-press';

function Trigger({ onLongPress, onClick }: { onLongPress?: () => void; onClick: () => void }) {
  const { bind, consumeClick } = useLongPress(onLongPress);
  return (
    <button
      type="button"
      {...bind}
      onClick={() => {
        if (!consumeClick()) onClick();
      }}
    >
      Add
    </button>
  );
}

function setup(withLongPress = true) {
  const onLongPress = vi.fn();
  const onClick = vi.fn();
  render(<Trigger onLongPress={withLongPress ? onLongPress : undefined} onClick={onClick} />);
  return { onLongPress, onClick, button: screen.getByRole('button', { name: 'Add' }) };
}

describe('useLongPress (D275)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires after 500 ms and swallows the click that follows', () => {
    const { onLongPress, onClick, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledOnce();
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    // Only that one click: the next is a normal press.
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a normal click when released early', () => {
    const { onLongPress, onClick, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('cancels when the pointer moves more than 10 px', () => {
    const { onLongPress, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(button, { clientX: 15, clientY: 15 });
    fireEvent.pointerMove(button, { clientX: 22, clientY: 10 });
    vi.advanceTimersByTime(600);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('prevents the context menu while held', () => {
    const { button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    expect(fireEvent.contextMenu(button)).toBe(false);
  });

  it('is inert without onLongPress', () => {
    const { onClick, button } = setup(false);
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(600);
    expect(fireEvent.contextMenu(button)).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
