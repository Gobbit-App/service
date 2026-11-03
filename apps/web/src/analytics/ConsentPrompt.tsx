import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, type ReactElement, type SyntheticEvent } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ANALYTICS_PROMPT, type AnalyticsConsentChoice } from '@gobbit/shared/analytics';
import { useSetAnalyticsConsent } from '../api/analytics-consent';
import { useOnline } from '../api/offline';
import { configQuery, meQuery } from '../api/queries';
import { Button } from '../ui/buttons/Button';
import { promptAllowedOn } from './prompt-routes';

/**
 * D263, a wall since D281: the member's analytics question as a modal dialog, until they answer
 * (nothing is sent before, D261). Shown only with analytics configured, online (the answer is
 * saved on the account), for a member who hasn't answered, on a route that allows it. Reads `me`
 * from the cache only (the screens fetch it), so it never adds a request on sign-in.
 */
export function ConsentPrompt(): ReactElement | null {
  const config = useQuery(configQuery());
  const me = useQuery({ ...meQuery(), enabled: false });
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId });
  const online = useOnline();

  if (
    !online ||
    !config.data?.analytics ||
    me.data?.analyticsConsent?.value !== 'unanswered' ||
    !promptAllowedOn(routeId)
  ) {
    return null;
  }
  return <ConsentDialog />;
}

/** D281: the native modal (page behind inert); Escape never skips it; both answers look alike. */
function ConsentDialog(): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const save = useSetAnalyticsConsent();
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // jsdom has no showModal; browsers all do (the PWA's targets).
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    };
  }, []);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => event.preventDefault();
  const answer = (value: AnalyticsConsentChoice) => save.mutate({ value, source: 'prompt' });
  const saving = save.isPending ? 'Saving…' : null;

  return (
    <dialog
      ref={ref}
      className="consent-prompt"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={onCancel}
    >
      <h2 id={titleId}>{ANALYTICS_PROMPT.title}</h2>
      <p id={textId}>{ANALYTICS_PROMPT.text}</p>
      {save.isError && (
        <p className="form-error" role="alert">
          {ANALYTICS_PROMPT.failed}
        </p>
      )}
      <div className="consent-prompt__actions">
        <Button
          icon="check"
          label={ANALYTICS_PROMPT.allow}
          variant="ghost"
          disabledReason={saving}
          onClick={() => answer('allowed')}
        />
        <Button
          icon="close"
          label={ANALYTICS_PROMPT.decline}
          variant="ghost"
          disabledReason={saving}
          onClick={() => answer('declined')}
        />
      </div>
    </dialog>
  );
}
