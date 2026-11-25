import { createFileRoute } from '@tanstack/react-router';
import { JoinScreen } from '../invites/JoinScreen';

/** D470: the page an invite link opens (`?t=`); public, so a signed-out visit reads the preview. */
export const Route = createFileRoute('/join')({
  validateSearch: (search: Record<string, unknown>): { t: string } => ({
    t: typeof search.t === 'string' ? search.t.slice(0, 256) : '',
  }),
  component: Join,
});

function Join() {
  const { t } = Route.useSearch();
  return <JoinScreen token={t} />;
}
