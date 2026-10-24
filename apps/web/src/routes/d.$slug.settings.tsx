import { createFileRoute } from '@tanstack/react-router';
import { DeckAdminScreen } from '../deck-admin/DeckAdminScreen';

/** D184: deck settings (`/d/:slug/settings`); lazy via autoCodeSplitting, gated per section. */
export const Route = createFileRoute('/d/$slug/settings')({
  component: DeckSettings,
});

function DeckSettings() {
  const { slug } = Route.useParams();
  return <DeckAdminScreen deckSlug={slug} />;
}
