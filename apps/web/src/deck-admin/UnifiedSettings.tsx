import type { ReactElement } from 'react';
import { SettingsScreen } from '../settings/SettingsScreen';
import { DeckAdminScreen } from './DeckAdminScreen';

/**
 * D278: one Settings page inside a deck — "This deck" (members, categories, deck) first, then
 * "Your account" (send-in, tokens, privacy). `/settings` shows the account half only.
 */
export function UnifiedSettings({ deckSlug }: { deckSlug: string }): ReactElement {
  return (
    <>
      <DeckAdminScreen deckSlug={deckSlug} />
      <section className="account-settings" aria-labelledby="account-settings-title">
        <h2 id="account-settings-title" className="deck-admin__title">
          Your account
        </h2>
        <SettingsScreen />
      </section>
    </>
  );
}
