import type { RouterHistory } from '@tanstack/react-router';
import type { NavigateHref } from '../ui/NavLink';

/** In-app navigation on the router's history, so the unsaved-changes guard sees it (D201). */
export function historyNavigate(history: RouterHistory): NavigateHref {
  return (href, options) => {
    const historyOptions = { ignoreBlocker: options?.ignoreBlocker };
    if (options?.replace) history.replace(href, undefined, historyOptions);
    else history.push(href, undefined, historyOptions);
  };
}
