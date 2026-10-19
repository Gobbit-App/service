import { useState, type ReactElement } from 'react';
import type { Deck, IngestToken } from '@pb/shared';
import { useRevokeIngestToken } from '../api/ingest-tokens';
import { problemMessages } from '../api/problem-messages';
import { lastUsedLabel, tokenScope } from './ingest-token-view';

/** Live tokens; revoking asks once more, since a revoked token can't be restored. */
export function TokenList({
  tokens,
  decks,
}: {
  tokens: readonly IngestToken[];
  decks: readonly Deck[];
}): ReactElement {
  const revoke = useRevokeIngestToken();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (tokens.length === 0) return <p className="muted">No tokens yet. Create one below.</p>;

  return (
    <>
      <ul className="token-list" aria-label="Your tokens">
        {tokens.map((token) => (
          <li key={token.id} className="token-list__item">
            <div>
              <strong dir="auto">{token.label}</strong> <code>{token.prefix}…</code>
              <p className="muted">
                {tokenScope(token, decks)} · {lastUsedLabel(token.lastUsedAt)}
              </p>
            </div>
            {confirming === token.id ? (
              <div className="token-list__actions">
                <button
                  type="button"
                  className="button button--danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(token.id, { onSettled: () => setConfirming(null) })}
                >
                  Revoke for good
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button button--ghost"
                aria-label={`Revoke ${token.label}`}
                onClick={() => setConfirming(token.id)}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      {revoke.isError && (
        <div className="form-error" role="alert">
          {problemMessages(revoke.error).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </>
  );
}
