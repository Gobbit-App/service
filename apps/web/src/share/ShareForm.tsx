import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Deck } from '@pb/shared';
import { isApiError } from '../api/api-error';
import { useSubmitShare } from '../api/ingest';
import { problemMessages } from '../api/problem-messages';
import { normalizeUrlInput } from '../lib/url-input';
import { useUrlInput } from '../ui/use-url-input';
import { DeckPicker } from './DeckPicker';
import { hasContent, isHttpUrl, type IngestDraft, type SharedPayload } from './share-payload';
import { ShareThumbnails } from './ShareThumbnails';

export const SEND_ERROR = "Couldn't send it. Check your connection and try again.";
export const URL_ERROR = 'Enter a valid web address';

function sendErrors(err: unknown): string[] {
  return isApiError(err) && err.problem ? problemMessages(err) : [SEND_ERROR];
}

/**
 * D108: the confirm/paste form. Shows what was shared (editable), the deck picker and
 * "Send to Gobbit"; the worker turns it into a proposal for the deck's review queue.
 */
export function ShareForm({
  decks,
  initialDeck,
  initial,
  channel,
  onSent,
}: {
  decks: readonly Deck[];
  initialDeck: string;
  initial: SharedPayload | null;
  channel: IngestDraft['channel'];
  onSent: (deck: Deck, shareId: string) => void;
}): ReactElement {
  const baseId = useId();
  const submit = useSubmitShare();
  const [deckSlug, setDeckSlug] = useState(initialDeck);
  const [text, setText] = useState(initial?.text ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [files, setFiles] = useState<File[]>(initial?.files ?? []);
  const [urlInvalid, setUrlInvalid] = useState(false);
  const deck = decks.find((d) => d.slug === deckSlug) ?? decks[0]!;
  const errors = submit.isError ? sendErrors(submit.error) : [];
  const urlInput = useUrlInput(url, setUrl);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const link = normalizeUrlInput(url);
    const invalid = link !== '' && !isHttpUrl(link);
    setUrlInvalid(invalid);
    if (invalid) return;
    submit.mutate(
      { deckId: deck.id, title: initial?.title ?? '', text, url: link, files, channel },
      { onSuccess: (accepted) => onSent(deck, accepted.id) },
    );
  };

  return (
    <form className="card-editor share-form" onSubmit={handleSubmit} noValidate>
      <DeckPicker decks={decks} value={deck.slug} onChange={setDeckSlug} />

      {initial?.title && (
        <p className="share-form__title" dir="auto">
          {initial.title}
        </p>
      )}

      <label htmlFor={`${baseId}-text`}>Text</label>
      <textarea
        id={`${baseId}-text`}
        rows={5}
        dir="auto"
        placeholder="Paste a message, an address, a recipe…"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />

      <label htmlFor={`${baseId}-url`}>Link</label>
      <input
        id={`${baseId}-url`}
        type="url"
        inputMode="url"
        value={url}
        aria-invalid={urlInvalid}
        aria-describedby={urlInvalid ? `${baseId}-url-error` : undefined}
        {...urlInput}
      />
      {urlInvalid && (
        <p id={`${baseId}-url-error`} className="form-error">
          {URL_ERROR}
        </p>
      )}

      <ShareThumbnails
        files={files}
        onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))}
      />

      {errors.length > 0 && (
        <div className="form-error" role="alert">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        className="button"
        disabled={submit.isPending || !hasContent({ text, url: normalizeUrlInput(url), files })}
      >
        {submit.isPending ? 'Sending…' : 'Send to Gobbit'}
      </button>
    </form>
  );
}
