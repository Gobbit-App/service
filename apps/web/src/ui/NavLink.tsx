import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

/** Client-side navigation; main.tsx provides the router's history, tests a spy. */
export const NavigateContext = createContext<(href: string) => void>((href) => {
  window.location.assign(href);
});

export function useNavigateHref(): (href: string) => void {
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
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const navigate = useNavigateHref();
  return (
    <a
      href={href}
      className={className}
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
