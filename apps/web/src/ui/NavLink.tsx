import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

/** Client-side navigation; main.tsx provides the router's history, tests a spy. */
export interface NavigateOptions {
  /** Replace the current history entry instead of pushing one. */
  replace?: boolean;
}

export type NavigateHref = (href: string, options?: NavigateOptions) => void;

export const NavigateContext = createContext<NavigateHref>((href, options) => {
  if (options?.replace) window.location.replace(href);
  else window.location.assign(href);
});

export function useNavigateHref(): NavigateHref {
  return useContext(NavigateContext);
}

/** True for a plain left click that the app should handle instead of the browser. */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** A real anchor (long-press, new tab and copy link keep working) that navigates in-app. */
export function NavLink({
  href,
  className,
  label,
  children,
}: {
  href: string;
  className?: string;
  /** Accessible name when the visible text is shorter than it. */
  label?: string;
  children: ReactNode;
}): ReactElement {
  const navigate = useNavigateHref();
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
