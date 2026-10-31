import { useState, type ReactElement } from 'react';
import type { Deck, IngestToken, IngestTokenCreated } from '@gobbit/shared';
import { INGEST_TOKENS_MAX } from '@gobbit/shared/ingest-constants';
import { bindableDecks } from './ingest-token-view';
import { NewTokenForm } from './NewTokenForm';
import { SettingsSection } from './SettingsSection';
import { TokenList } from './TokenList';
import { TokenSecret } from './TokenSecret';

/** D99: the user's ingest tokens; a new token's secret is shown once, until dismissed. */
export function TokensSection({
  tokens,
  decks,
  emailDomain,
}: {
  tokens: readonly IngestToken[];
  decks: readonly Deck[];
  emailDomain: string | null;
}): ReactElement {
  const [created, setCreated] = useState<IngestTokenCreated | null>(null);
  const atMax = tokens.length >= INGEST_TOKENS_MAX;

  return (
    <SettingsSection title="Your tokens">
      {created && (
        <TokenSecret created={created} emailDomain={emailDomain} onDone={() => setCreated(null)} />
      )}
      <TokenList tokens={tokens} decks={decks} />
      {atMax && (
        <p className="muted">
          You have {INGEST_TOKENS_MAX} tokens, the most allowed. Revoke one to create another.
        </p>
      )}
      <NewTokenForm decks={bindableDecks(decks)} disabled={atMax} onCreated={setCreated} />
    </SettingsSection>
  );
}
