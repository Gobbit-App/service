import { useQuery } from '@tanstack/react-query';
import { useId, useState, type ReactElement } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ANALYTICS_PROMPT, type AnalyticsConsentChoice } from '@gobbit/shared/analytics';
import { useSetAnalyticsConsent } from '../api/analytics-consent';
import { useOnline } from '../api/offline';
import { configQuery, meQuery } from '../api/queries';
import { Button } from '../ui/buttons/Button';
import { IconButton } from '../ui/buttons/IconButton';
import { promptAllowedOn } from './prompt-routes';

/**
 * D263: the member's one-time analytics question, in the document flow above the page (never
 * fixed or overlaid, never takes focus). Shown only with analytics configured, a member who
 * hasn't answered, on a route that allows it, and not closed in this app start. Reads `me` from
 * the cache only (the screens fetch it), so it never adds a request on sign-in.
 */
export function ConsentPrompt(): ReactElement | null {
  const config = useQuery(configQuery());
  const me = useQuery({ ...meQuery(), enabled: false });
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId });
  const online = useOnline();
  const save = useSetAnalyticsConsent();
  const [closed, setClosed] = useState(false);
  const titleId = useId();

  if (
    closed ||
    !config.data?.analytics ||
    me.data?.analyticsConsent?.value !== 'unanswered' ||
    !promptAllowedOn(routeId)
  ) {
    return null;
  }

  const offlineReason = online ? null : 'Needs a connection';
  const answer = (value: AnalyticsConsentChoice) => save.mutate({ value, source: 'prompt' });

  return (
    <section className="consent-prompt" aria-labelledby={titleId}>
      <div className="consent-prompt__head">
        <h2 id={titleId}>{ANALYTICS_PROMPT.title}</h2>
        <IconButton icon="close" label={ANALYTICS_PROMPT.close} onClick={() => setClosed(true)} />
      </div>
      <p>{ANALYTICS_PROMPT.text}</p>
      {save.isError && (
        <p className="form-error" role="alert">
          {ANALYTICS_PROMPT.failed}
        </p>
      )}
      <div className="consent-prompt__actions">
        <Button
          icon="check"
          label={ANALYTICS_PROMPT.allow}
          disabledReason={save.isPending ? 'Saving…' : offlineReason}
          onClick={() => answer('allowed')}
        />
        <Button
          icon="close"
          label={ANALYTICS_PROMPT.decline}
          variant="ghost"
          disabledReason={save.isPending ? 'Saving…' : offlineReason}
          onClick={() => answer('declined')}
        />
      </div>
    </section>
  );
}
