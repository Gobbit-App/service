import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { IngestTokenCreated } from '@pb/shared';
import { INGEST_TOKENS_MAX } from '@pb/shared/ingest-constants';
import { ingestTokensQuery } from '../api/ingest-tokens';
import { isNetworkError } from '../api/network-state';
import { configQuery, decksQuery } from '../api/queries';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { bindableDecks } from './ingest-token-view';
import { NewTokenForm } from './NewTokenForm';
import { TokenList } from './TokenList';
import { TokenSecret } from './TokenSecret';

/** D99/D104: the iPhone Shortcut, email-in and the ingest tokens both of them use. */
export function SettingsScreen(): ReactElement {
  const config = useQuery(configQuery());
  const tokens = useQuery(ingestTokensQuery());
  const decks = useQuery(decksQuery());
  const [created, setCreated] = useState<IngestTokenCreated | null>(null);

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
  const atMax = tokens.data.data.length >= INGEST_TOKENS_MAX;

  return (
    <>
      {!ingest.enabled && (
        <p className="settings-notice" role="status">
          Sharing into Gobbit is turned off on this server, so tokens won’t create cards yet.
        </p>
      )}

      <section className="settings-section" aria-labelledby="settings-iphone">
        <h2 id="settings-iphone">Share from iPhone</h2>
        {ingest.shortcutUrl ? (
          <p>
            Create a token below, then{' '}
            <a href={ingest.shortcutUrl} target="_blank" rel="noreferrer">
              add the “Share to Gobbit” Shortcut
            </a>{' '}
            and paste the token when it asks. Gobbit then shows up in the share sheet.
          </p>
        ) : (
          <p className="muted">The Shortcut link isn’t set up on this server yet.</p>
        )}
        {ingest.emailDomain && (
          <p>
            You can also email things in: each token comes with its own address at{' '}
            <strong>{ingest.emailDomain}</strong>.
          </p>
        )}
      </section>

      <section className="settings-section" aria-labelledby="settings-tokens">
        <h2 id="settings-tokens">Ingest tokens</h2>
        {created && (
          <TokenSecret
            created={created}
            emailDomain={ingest.emailDomain}
            onDone={() => setCreated(null)}
          />
        )}
        <TokenList tokens={tokens.data.data} decks={decks.data} />
        {atMax && (
          <p className="muted">
            You have {INGEST_TOKENS_MAX} tokens, the most allowed. Revoke one to create another.
          </p>
        )}
        <NewTokenForm decks={bindableDecks(decks.data)} disabled={atMax} onCreated={setCreated} />
      </section>
    </>
  );
}
