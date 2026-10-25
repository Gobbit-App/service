import { useMutation } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ASK_QUESTION_MIN } from '@pb/shared/search';
import { askDeck } from '../api/queries';
import { NavLink } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { askErrorCopy } from './ask-copy';
import { Button } from '../ui/buttons/Button';

/** Asks one question of the cards in a pocketbook (D77). */
export function AskView({
  deckSlug,
  question,
}: {
  deckSlug: string;
  question: string;
}): ReactElement {
  const ask = useMutation({
    mutationFn: (q: string) => askDeck(deckSlug, q),
    networkMode: 'always',
  });
  const { data, error, isError, isIdle, isPending, mutate } = ask;
  const disabled = question.trim().length < ASK_QUESTION_MIN || isPending;

  let body: ReactElement | null;
  if (isPending) {
    body = <LoadingState label="Thinking…" />;
  } else if (isError) {
    body = <ErrorState title="Couldn't answer" message={askErrorCopy(error)} />;
  } else if (data && !data.grounded) {
    body = <EmptyState title="Nothing in this pocketbook answers that">{data.answer}</EmptyState>;
  } else if (data) {
    body = (
      <>
        <p className="ask-view__answer">{data.answer}</p>
        <h3 className="ask-view__sources-title">Sources</h3>
        <ul className="ask-view__sources">
          {data.citations.map((c) => (
            <li key={c.itemId}>
              <NavLink href={`/i/${c.itemId}`}>{c.title}</NavLink>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (isIdle) {
    body = (
      <p className="ask-view__hint">
        Ask a question and get an answer from the cards in this pocketbook.
      </p>
    );
  } else {
    body = null;
  }

  return (
    <section className="ask-view" aria-label="Ask">
      <Button
        icon="send"
        label="Ask"
        className="ask-view__submit"
        disabled={disabled}
        onClick={() => mutate(question.trim())}
      />
      {body}
    </section>
  );
}

export default AskView;
