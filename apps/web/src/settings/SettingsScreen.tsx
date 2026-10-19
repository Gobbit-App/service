import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ingestTokensQuery } from '../api/ingest-tokens';
import { isNetworkError } from '../api/network-state';
import { configQuery, decksQuery } from '../api/queries';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { SendInSection } from './SendInSection';
import { TokensSection } from './TokensSection';

/** D99/D104: what ingest tokens are for and how to use them, then the tokens themselves. */
export function SettingsScreen(): ReactElement {
  const config = useQuery(configQuery());
  const tokens = useQuery(ingestTokensQuery());
  const decks = useQuery(decksQuery());

  if (config.isPending || tokens.isPending || decks.isPending) {
    return <LoadingState label="Loading settings…" />;
  }
  const failed = [config, tokens, decks].find((q) => q.isError && !q.data);
  if (failed || !config.data || !tokens.data || !decks.data) {
    return (
      <ErrorState
        message={
          isNetworkError(failed?.error)
            ? "You're offline. Settings need a connection."
            : "Couldn't load your settings."
        }
        onRetry={() => {
          void config.refetch();
          void tokens.refetch();
          void decks.refetch();
        }}
      />
    );
  }

  const { ingest } = config.data;

  return (
    <>
      {!ingest.enabled && (
        <p className="settings-notice" role="status">
          Sharing into Gobbit is turned off on this server, so tokens won’t create cards yet.
        </p>
      )}

      <SendInSection shortcutUrl={ingest.shortcutUrl} emailDomain={ingest.emailDomain} />
      <TokensSection
        tokens={tokens.data.data}
        decks={decks.data}
        emailDomain={ingest.emailDomain}
      />
    </>
  );
}
