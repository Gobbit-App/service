import type { ReactElement } from 'react';
import { SettingsSection } from './SettingsSection';

/** D104: how to install the Shortcut, plus the email-in domain when the server has one. */
export function IphoneSection({
  shortcutUrl,
  emailDomain,
}: {
  shortcutUrl: string | null;
  emailDomain: string | null;
}): ReactElement {
  return (
    <SettingsSection title="Share from iPhone">
      {shortcutUrl ? (
        <p>
          Create a token below, then{' '}
          <a href={shortcutUrl} target="_blank" rel="noreferrer">
            add the “Share to Gobbit” Shortcut
          </a>{' '}
          and paste the token when it asks. Gobbit then shows up in the share sheet.
        </p>
      ) : (
        <p className="muted">The Shortcut link isn’t set up on this server yet.</p>
      )}
      {emailDomain && (
        <p>
          You can also email things in: each token comes with its own address at{' '}
          <strong>{emailDomain}</strong>.
        </p>
      )}
    </SettingsSection>
  );
}
