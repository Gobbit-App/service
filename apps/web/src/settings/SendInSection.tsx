import type { ReactElement } from 'react';
import { SettingsSection } from './SettingsSection';

/**
 * D99/D104: what tokens are for, and only the ways to use one that this server has set up
 * (Shortcut link, email-in); the plain HTTP endpoint always works.
 */
export function SendInSection({
  shortcutUrl,
  emailDomain,
  origin = globalThis.location?.origin ?? '',
}: {
  shortcutUrl: string | null;
  emailDomain: string | null;
  origin?: string;
}): ReactElement {
  return (
    <SettingsSection title="Add cards from other apps">
      <p>
        A token lets another app, device or email account send links, text and photos to Gobbit.
        Each one arrives as a draft for review before it becomes a card. Create one token per place
        you send from, so you can revoke it on its own.
      </p>
      <ul className="send-in-ways" aria-label="Ways to use a token">
        {shortcutUrl && (
          <li>
            <strong>iPhone or iPad:</strong>{' '}
            <a href={shortcutUrl} target="_blank" rel="noreferrer">
              add the “Share to Gobbit” Shortcut
            </a>{' '}
            and paste a token when it asks. Gobbit then shows up in the share sheet.
          </li>
        )}
        {emailDomain && (
          <li>
            <strong>Email:</strong> each token has its own address at <strong>{emailDomain}</strong>
            , shown when you create it. Forward anything to it.
          </li>
        )}
        <li>
          <strong>Scripts and other tools:</strong> send a <code>POST</code> to{' '}
          <code>{origin}/api/ingest</code> with the header{' '}
          <code>Authorization: Bearer &lt;token&gt;</code> and a <code>url</code>, <code>text</code>{' '}
          or <code>files</code> field.
        </li>
      </ul>
    </SettingsSection>
  );
}
