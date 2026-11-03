import { createFileRoute } from '@tanstack/react-router';
import { UnifiedSettings } from '../deck-admin/UnifiedSettings';

/** D184/D278: Settings inside a deck (`/d/:slug/settings`); lazy via autoCodeSplitting. */
export const Route = createFileRoute('/d/$slug/settings')({
  component: DeckSettings,
});

function DeckSettings() {
  const { slug } = Route.useParams();
  return <UnifiedSettings deckSlug={slug} />;
}
