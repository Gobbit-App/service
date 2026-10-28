import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { meQuery } from '../api/queries';
import { WaitlistScreen } from '../admin/WaitlistScreen';
import { AppHeader } from '../app/AppHeader';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/** 032: the platform admin's waitlist; everyone else sees not-found, like the API's 404. */
export const Route = createFileRoute('/admin/waitlist')({
  component: AdminWaitlist,
});

function AdminWaitlist() {
  const me = useQuery(meQuery());

  return (
    <>
      <AppHeader title="Waitlist" back="/settings" />
      <main className="page">
        {me.isPending ? (
          <LoadingState label="Loading…" />
        ) : !me.data ? (
          <ErrorState message="Couldn't load your account." onRetry={() => void me.refetch()} />
        ) : me.data.isPlatformAdmin ? (
          <WaitlistScreen />
        ) : (
          <ErrorState title="Not found" message="There's no page here." />
        )}
      </main>
    </>
  );
}
