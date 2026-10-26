/**
 * D212: touch screens have no hover, so a still press on a control with `data-tip` shows its
 * tooltip (`data-tip-open`) and the click that follows the release is swallowed. A press that
 * moves more than 10 px is a swipe or scroll: nothing happens. Listeners are passive and never
 * call `preventDefault` on touchstart/touchmove, so scrolling and swipes are untouched.
 *
 * D217: the press opens the tooltip after 500 ms or when the browser reports its own long press
 * (`contextmenu` during a touch; Android fires it at ~400 ms and then cancels the touch),
 * whichever comes first. The tooltip stays while the finger is down and hides 1.5 s after the
 * release. A mouse right-click keeps the browser's context menu.
 */
export const PRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 10;
export const SHOW_MS = 1500;

function tipTarget(event: Event): HTMLElement | null {
  return (event.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
}

export function installTooltipPress(root: Document | HTMLElement = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** The control under a touch that is still down (null once it moved, ended or was cancelled). */
  let pressed: { target: HTMLElement; x: number; y: number } | null = null;
  let touching = false;
  let shown: HTMLElement | null = null;
  let swallowClick = false;

  const cancelPress = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pressed = null;
  };

  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = undefined;
    shown?.removeAttribute('data-tip-open');
    shown = null;
  };

  const show = (target: HTMLElement) => {
    cancelPress();
    hide();
    shown = target;
    target.setAttribute('data-tip-open', '');
    swallowClick = true;
    // A touch that already ended (or a contextmenu with no touchend to follow) still hides.
    if (!touching) hideTimer = setTimeout(hide, SHOW_MS);
  };

  const onTouchStart = (event: Event) => {
    const touch = (event as TouchEvent).touches[0];
    const target = tipTarget(event);
    cancelPress();
    touching = true;
    swallowClick = false;
    if (!touch || !target) return;
    pressed = { target, x: touch.clientX, y: touch.clientY };
    timer = setTimeout(() => show(target), PRESS_MS);
  };

  const onTouchMove = (event: Event) => {
    const touch = (event as TouchEvent).touches[0];
    if (!pressed || !touch) return;
    const moved = Math.hypot(touch.clientX - pressed.x, touch.clientY - pressed.y);
    if (moved > MOVE_TOLERANCE_PX) cancelPress();
  };

  const onTouchEnd = (event: Event) => {
    if ((event as TouchEvent).touches?.length) return;
    touching = false;
    cancelPress();
    if (shown && !hideTimer) hideTimer = setTimeout(hide, SHOW_MS);
  };

  const onClick = (event: Event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onContextMenu = (event: Event) => {
    // Only a touch long press: a mouse right-click keeps the browser menu.
    if (!touching) return;
    const target = tipTarget(event);
    if (!target) return;
    // The long-press menu would cover the tooltip.
    event.preventDefault();
    if (pressed?.target === target) show(target);
  };

  const passive = { passive: true } as const;
  root.addEventListener('touchstart', onTouchStart, passive);
  root.addEventListener('touchmove', onTouchMove, passive);
  root.addEventListener('touchend', onTouchEnd, passive);
  root.addEventListener('touchcancel', onTouchEnd, passive);
  root.addEventListener('click', onClick, true);
  root.addEventListener('contextmenu', onContextMenu);

  return () => {
    cancelPress();
    hide();
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchEnd);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('contextmenu', onContextMenu);
  };
}
