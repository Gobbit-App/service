import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames, tipText } from './buttons/button-props';
import { Icon, type IconName } from './icons/Icon';
import { isPlainClick, useNavigateHref } from './NavLink';

export interface MenuAction {
  key: string;
  label: string;
  icon: IconName;
  /** Run on select; or `href` to navigate in-app. */
  onSelect?: () => void;
  href?: string;
  tone?: 'danger';
  /** Shown in the item's tooltip; the item stays focusable but does nothing. */
  disabledReason?: string | null;
}

const ITEM = '[role="menuitem"]';
const GAP_PX = 4;

/**
 * The menu is portalled to <body> with fixed coordinates so cards (overflow: hidden) and
 * browse panes (transforms) never clip it. It opens below the trigger, or above when the
 * viewport has no room, aligned to the trigger's inline end.
 */
function menuPosition(trigger: HTMLElement, menu: HTMLElement): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const height = menu.offsetHeight;
  const width = menu.offsetWidth;
  const below = rect.bottom + GAP_PX + height <= window.innerHeight || rect.top < height;
  const rtl = getComputedStyle(trigger).direction === 'rtl';
  const left = rtl ? rect.left : rect.right - width;
  return {
    top: below ? rect.bottom + GAP_PX : rect.top - GAP_PX - height,
    left: Math.max(GAP_PX, Math.min(left, window.innerWidth - width - GAP_PX)),
  };
}

function focusItem(menu: HTMLElement | null, index: number): void {
  const items = menu?.querySelectorAll<HTMLElement>(ITEM);
  if (!items || items.length === 0) return;
  items[(index + items.length) % items.length]?.focus();
}

/**
 * D213: a menu button (WAI-ARIA APG) for the actions that don't fit a card's bar. Arrow keys,
 * Home/End move; Escape closes and returns focus; a pointer outside closes.
 */
export function MoreMenu({
  actions,
  label = 'More actions',
  icon = 'more',
  trigger,
  className,
  disabled = false,
}: {
  actions: readonly MenuAction[];
  /** Accessible name of the menu button. */
  label?: string;
  icon?: IconName;
  /** Visible content of the trigger instead of the icon (e.g. "3 / 12"). */
  trigger?: ReactNode;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const navigate = useNavigateHref();

  // Before paint: place the menu, then focus its first item.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const { top, left } = menuPosition(button.current, menu.current);
    menu.current.style.top = `${top}px`;
    menu.current.style.left = `${left}px`;
    focusItem(menu.current, 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      event.stopPropagation();
      focusItem(menu.current, moves[event.key] ?? 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    }
  };

  const select = (action: MenuAction) => {
    if (action.disabledReason) return;
    close(true);
    if (action.href) navigate(action.href);
    else action.onSelect?.();
  };

  return (
    <div className={classNames('menu-button', className)} ref={root}>
      <button
        ref={button}
        type="button"
        className={trigger ? 'menu-button__trigger' : 'icon-button'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tip={open ? undefined : label}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? <Icon name={icon} />}
      </button>
      {open &&
        createPortal(
          <ul
            ref={menu}
            id={menuId}
            className="menu"
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
          >
            {actions.map((action) => {
              const itemClass = classNames(
                'menu__item',
                action.tone === 'danger' && 'menu__item--danger',
              );
              const content = (
                <>
                  <Icon name={action.icon} />
                  <span>{action.label}</span>
                </>
              );
              const common = {
                role: 'menuitem',
                tabIndex: -1,
                className: itemClass,
                'aria-disabled': action.disabledReason ? true : undefined,
                'data-tip': action.disabledReason
                  ? tipText(action.label, undefined, action.disabledReason)
                  : undefined,
              } as const;
              return (
                <li key={action.key} role="none">
                  {action.href ? (
                    <a
                      {...common}
                      href={action.href}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return;
                        event.preventDefault();
                        select(action);
                      }}
                    >
                      {content}
                    </a>
                  ) : (
                    <button {...common} type="button" onClick={() => select(action)}>
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
