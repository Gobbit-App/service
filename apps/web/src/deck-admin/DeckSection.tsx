import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Category, Deck } from '@pb/shared';
import { CopyButton } from '../settings/CopyButton';
import { SettingsSection } from '../settings/SettingsSection';
import { AdminError } from './AdminError';
import { AutoPublishSwitch } from './AutoPublishSwitch';
import { useUpdateDeck } from './deck-admin-queries';
import { PublicSwitchDialog } from './PublicSwitchDialog';

/** 017: the public page of a deck lives at `/p/<slug>` on the same origin. */
export function publicDeckUrl(slug: string, origin = globalThis.location?.origin ?? ''): string {
  return `${origin}/p/${slug}`;
}

/**
 * D184: rename (`deck.update`) and, for shared decks, the public switch. Only owners (and
 * co-owners) may flip it (016, D176); turning it on asks first, turning it off doesn't. The
 * auto-publish switch (D192) is owner-only too and also shown on the personal deck.
 */
export function DeckSection({
  deck,
  categories,
  online,
}: {
  deck: Deck;
  categories: readonly Category[];
  online: boolean;
}): ReactElement {
  const baseId = useId();
  const update = useUpdateDeck(deck);
  const [name, setName] = useState(deck.name);
  const [confirming, setConfirming] = useState(false);
  const isOwner = deck.role === 'owner';
  const publicUrl = publicDeckUrl(deck.slug);
  const trimmed = name.trim();

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || trimmed === deck.name) return;
    update.mutate({ name: trimmed });
  };

  const setPublic = (isPublic: boolean) =>
    update.mutate({ isPublic }, { onSettled: () => setConfirming(false) });

  return (
    <SettingsSection title="Deck">
      <form className="card-editor admin-form" onSubmit={handleRename}>
        <label htmlFor={`${baseId}-name`}>Name</label>
        <div className="admin-form__row">
          <input
            id={`${baseId}-name`}
            value={name}
            dir="auto"
            disabled={!online}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <button
            type="submit"
            className="button"
            disabled={!online || update.isPending || !trimmed || trimmed === deck.name}
          >
            Save
          </button>
        </div>
      </form>

      {deck.isDefault ? (
        <p className="muted">Your personal deck is always private.</p>
      ) : (
        <div className="admin-public">
          <label className="admin-public__switch">
            <input
              type="checkbox"
              role="switch"
              checked={deck.isPublic}
              disabled={!isOwner || !online || update.isPending || confirming}
              onChange={(event) =>
                event.currentTarget.checked ? setConfirming(true) : setPublic(false)
              }
            />
            Public
          </label>
          {deck.isPublic && (
            <p className="admin-public__url">
              <code>{publicUrl}</code>
              <CopyButton value={publicUrl} label="Copy public address" />
            </p>
          )}
          {confirming && (
            <PublicSwitchDialog
              categories={categories}
              publicUrl={publicUrl}
              pending={update.isPending}
              onConfirm={() => setPublic(true)}
              onCancel={() => setConfirming(false)}
            />
          )}
        </div>
      )}
      <AutoPublishSwitch
        checked={deck.autoPublishShares}
        disabled={!isOwner || !online || update.isPending}
        onChange={(autoPublishShares) => update.mutate({ autoPublishShares })}
      />
      {!isOwner && <p className="muted">Only co-owners can change these settings.</p>}
      <AdminError error={update.error} />
    </SettingsSection>
  );
}
