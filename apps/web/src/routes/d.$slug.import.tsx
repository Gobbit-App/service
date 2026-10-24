import { createFileRoute } from '@tanstack/react-router';
import { ImportScreen } from '../import/ImportScreen';

/** D189: import notes (`/d/:slug/import`); lazy via autoCodeSplitting so the parser stays out. */
export const Route = createFileRoute('/d/$slug/import')({
  component: ImportNotes,
});

function ImportNotes() {
  const { slug } = Route.useParams();
  return <ImportScreen deckSlug={slug} />;
}
