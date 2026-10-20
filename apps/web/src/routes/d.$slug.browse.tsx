import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { BrowseScreen } from '../browse/BrowseScreen';
import {
  filterFromCategory,
  filterKey,
  isBrowsePath,
  listCategoryFromState,
  listHref,
  parseBrowseSearch,
  type BrowseSearch,
} from '../browse/browse-params';
import { historyIndex, writeBrowseOpener } from '../browse/browse-return';
import { useNavigateHref } from '../ui/NavLink';

/** D139–D141: full-screen Browse; the component (and use-gesture) is a lazy route chunk. */
export const Route = createFileRoute('/d/$slug/browse')({
  validateSearch: parseBrowseSearch,
  component: BrowseRoute,
});

function BrowseRoute() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const navigateHref = useNavigateHref();
  const listC = useRouterState({ select: (s) => listCategoryFromState(s.location.state) });

  // FR-005: remember the list this Browse was opened from (its entry sits just below this one),
  // so the system back action after a category change can be sent on to the current category.
  useEffect(() => {
    // On the way out (system back) this route renders once more with the list's state: keep the
    // opener for the list to read.
    if (!isBrowsePath(window.location.pathname)) return;
    const index = historyIndex(window.history.state);
    writeBrowseOpener(
      listC === null || index === null
        ? null
        : {
            deckSlug: slug,
            filterKey: filterKey(filterFromCategory(listC)),
            historyIndex: index - 1,
          },
    );
  }, [slug, listC]);

  // Card, category and pane changes replace the entry, keeping `fromList` (contract §1).
  const onChange = useCallback(
    (next: BrowseSearch) =>
      void navigate({
        to: '/d/$slug/browse',
        params: { slug },
        search: next,
        replace: true,
        state: (prev) => prev,
      }),
    [navigate, slug],
  );

  const onClose = useCallback(
    (c: string) => {
      if (listC === c) {
        window.history.back();
      } else if (listC !== null) {
        // The category changed since the list: going back would land on the wrong list.
        void navigate({ href: listHref(slug, c), replace: true });
      } else {
        navigateHref(listHref(slug, c));
      }
    },
    [listC, navigate, navigateHref, slug],
  );

  return <BrowseScreen deckSlug={slug} search={search} onChange={onChange} onClose={onClose} />;
}
