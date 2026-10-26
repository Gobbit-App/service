import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltipPress, PRESS_MS, SHOW_MS } from './tooltip-press';

function touch(target: Element, type: string, x = 10, y = 10): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
  });
  target.dispatchEvent(event);
  return event;
}

describe('installTooltipPress (D212)', () => {
  let button: HTMLButtonElement;
  let uninstall: () => void;
  const onClick = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button data-tip="Edit"><svg></svg></button>';
    button = document.querySelector('button')!;
    button.addEventListener('click', onClick);
    onClick.mockClear();
    uninstall = installTooltipPress(document);
  });

  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it('shows the tooltip after a still 500 ms press and swallows the click', () => {
    const start = touch(button.querySelector('svg')!, 'touchstart');
    expect(start.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(PRESS_MS);
    expect(button.hasAttribute('data-tip-open')).toBe(true);
    touch(button, 'touchend');
    button.click();
    expect(onClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SHOW_MS);
    expect(button.hasAttribute('data-tip-open')).toBe(false);
  });

  it('does nothing for a press that moves more than 10 px', () => {
    touch(button, 'touchstart', 10, 10);
    const move = touch(button, 'touchmove', 10, 30);
    expect(move.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(PRESS_MS);
    expect(button.hasAttribute('data-tip-open')).toBe(false);
  });

  it('lets a short tap click normally', () => {
    touch(button, 'touchstart');
    vi.advanceTimersByTime(PRESS_MS - 100);
    touch(button, 'touchend');
    vi.advanceTimersByTime(PRESS_MS);
    button.click();
    expect(button.hasAttribute('data-tip-open')).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores presses outside controls with a tooltip', () => {
    touch(document.body, 'touchstart');
    vi.advanceTimersByTime(PRESS_MS);
    expect(document.querySelector('[data-tip-open]')).toBeNull();
  });
});
