import type { ReactElement } from 'react';
import type { IngestTokenCreated } from '@pb/shared';
import { CopyButton } from './CopyButton';
import { ingestEmailAddress } from './ingest-token-view';

/** D99: the only time the plain token is visible; the email-in address derives from it (D104). */
export function TokenSecret({
  created,
  emailDomain,
  onDone,
}: {
  created: IngestTokenCreated;
  emailDomain: string | null;
  onDone: () => void;
}): ReactElement {
  const email = ingestEmailAddress(created.token, emailDomain);
  return (
    <div className="token-secret" role="status">
      <p>
        <strong>Copy “{created.label}” now.</strong> It won’t be shown again.
      </p>
      <div className="token-secret__row">
        <code className="token-secret__value">{created.token}</code>
        <CopyButton value={created.token} label="Copy token" />
      </div>
      {email && (
        <>
          <p>Or forward emails to this address:</p>
          <div className="token-secret__row">
            <code className="token-secret__value">{email}</code>
            <CopyButton value={email} label="Copy email address" />
          </div>
        </>
      )}
      <button type="button" className="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
