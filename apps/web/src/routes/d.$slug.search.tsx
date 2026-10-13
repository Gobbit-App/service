import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import type { SearchMode } from '@pb/shared/search';
import { useOnline } from '../api/offline';
import { categoriesQuery, configQuery } from '../api/queries';
import { ModeToggle } from '../search/ModeToggle';
import { pushRecentSearch, readRecentSearches } from '../search/recent-searches';
import { parseSearchParams } from '../search/search-params';
import { SearchResults } from '../search/SearchResults';
import { LoadingState } from '../ui/StatusViews';

/** D79: the Ask view is a lazy chunk so search stays inside the bundle budget. */
const AskView = lazy(() => import('../search/AskView'));

export const Route = createFileRoute('/d/$slug/search')({
  validateSearch: parseSearchParams,
  component: SearchPage,
});

function SearchPage() {
  const { slug } = Route.useParams();
  const { q, mode } = Route.useSearch();
  const navigate = useNavigate();
  const online = useOnline();
  const categories = useQuery(categoriesQuery(slug));
  const config = useQuery(configQuery());
  const askEnabled = config.data?.search.ask === true;
  // Read per render: the list is only shown for an empty q, which is always a fresh navigation.
  const recent = readRecentSearches(slug);

  useEffect(() => {
    if (q.trim()) pushRecentSearch(slug, q);
  }, [slug, q]);

  const go = (next: { q?: string; mode?: SearchMode }) =>
    void navigate({
      to: '/d/$slug/search',
      params: { slug },
      search: { q: next.q ?? q, mode: next.mode ?? mode },
      replace: true,
    });

  return (
    <section className="search-page" aria-label="Search">
      {askEnabled && <ModeToggle mode={mode} onChange={(m) => go({ mode: m })} />}
      {mode === 'ask' && askEnabled ? (
        <Suspense fallback={<LoadingState />}>
          <AskView key={q} deckSlug={slug} question={q} />
        </Suspense>
      ) : (
        <SearchResults
          deckSlug={slug}
          q={q}
          categories={categories.data ?? []}
          online={online}
          recent={recent}
          onPickRecent={(picked) => go({ q: picked })}
        />
      )}
    </section>
  );
}
