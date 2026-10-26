/**
 * D212: touch screens have no hover, so a still press of 500 ms on a control with `data-tip`
 * shows its tooltip (`data-tip-open`) and the click that follows the release is swallowed.
 * A press that moves more than 10 px is a swipe or scroll: nothing happens. Listeners are
 * passive and never call `preventDefault` on touchstart/touchmove, so scrolling and swipes
 * are untouched.
 */
export const PRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 10;
export const SHOW_MS = 1500;

export function installTooltipPress(root: Document | HTMLElement = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let shown: HTMLElement | null = null;
  let swallowClick = false;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = undefined;
    shown?.removeAttribute('data-tip-open');
    shown = null;
  };

  const onTouchStart = (event: Event) => {
    const touch = (event as TouchEvent).touches[0];
    const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tip]');
    cancel();
    swallowClick = false;
    if (!touch || !target) return;
    start = { x: touch.clientX, y: touch.clientY };
    timer = setTimeout(() => {
      hide();
      shown = target;
      target.setAttribute('data-tip-open', '');
      swallowClick = true;
      hideTimer = setTimeout(hide, SHOW_MS);
      timer = undefined;
    }, PRESS_MS);
  };

  const onTouchMove = (event: Event) => {
    const touch = (event as TouchEvent).touches[0];
    if (!start || !touch) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
  };

  const onTouchEnd = () => cancel();

  const onClick = (event: Event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onContextMenu = (event: Event) => {
    // The long-press menu would cover the tooltip on a control that shows one.
    if ((event.target as Element | null)?.closest?.('[data-tip]')) event.preventDefault();
  };

  const passive = { passive: true } as const;
  root.addEventListener('touchstart', onTouchStart, passive);
  root.addEventListener('touchmove', onTouchMove, passive);
  root.addEventListener('touchend', onTouchEnd, passive);
  root.addEventListener('touchcancel', onTouchEnd, passive);
  root.addEventListener('click', onClick, true);
  root.addEventListener('contextmenu', onContextMenu);

  return () => {
    cancel();
    hide();
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchEnd);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('contextmenu', onContextMenu);
  };
}
