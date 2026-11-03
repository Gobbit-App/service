import { useCallback, useState, type KeyboardEvent, type RefObject } from 'react';

/**
 * D290 / FR-009: a toolbar is one tab stop. Arrow keys move between its buttons (mirrored in
 * RTL), Home/End jump to the ends. Only the current button has `tabIndex=0`.
 */
export function useRovingFocus(container: RefObject<HTMLElement | null>, count: number) {
  const [current, setCurrent] = useState(0);
  const active = Math.min(current, Math.max(count - 1, 0));

  const focusAt = useCallback(
    (index: number) => {
      const buttons = container.current?.querySelectorAll<HTMLButtonElement>('[data-roving]');
      const button = buttons?.[index];
      if (!button) return;
      setCurrent(index);
      button.focus();
    },
    [container],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const rtl = container.current?.closest('[dir="rtl"]') !== null;
      const step: Record<string, number> = {
        ArrowRight: rtl ? -1 : 1,
        ArrowLeft: rtl ? 1 : -1,
      };
      let next: number | null = null;
      if (event.key in step) next = (active + step[event.key]! + count) % count;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      if (next === null) return;
      event.preventDefault();
      focusAt(next);
    },
    [active, container, count, focusAt],
  );

  return {
    tabIndexFor: (index: number) => (index === active ? 0 : -1),
    onFocusIndex: setCurrent,
    onKeyDown,
  };
}
