import { useId, type ReactElement } from 'react';
import type { AnalyticsConsent } from '@gobbit/shared';
import { ANALYTICS_SETTINGS } from '@gobbit/shared/analytics';
import { useSetAnalyticsConsent } from '../api/analytics-consent';
import { useOnline } from '../api/offline';
import { SettingsSection } from './SettingsSection';

/** D266: "Since {date}" for an answer, "Not answered yet (on)" otherwise. */
export function consentStatus(consent: AnalyticsConsent | undefined): string {
  if (!consent?.at || consent.value === 'unanswered') return ANALYTICS_SETTINGS.unanswered;
  const date = new Date(consent.at);
  const label = Number.isNaN(date.getTime()) ? consent.at : date.toLocaleDateString();
  return ANALYTICS_SETTINGS.since.replace('{date}', label);
}

/**
 * D266: Settings → Privacy. With analytics off on this server, one line and nothing else
 * (FR-013); otherwise what is measured and a switch (on unless declined). Offline the switch is
 * disabled — nothing is queued.
 */
export function PrivacySection({
  configured,
  consent,
}: {
  configured: boolean;
  consent: AnalyticsConsent | undefined;
}): ReactElement {
  const online = useOnline();
  const save = useSetAnalyticsConsent();
  const statusId = useId();

  if (!configured) {
    return (
      <SettingsSection title="Privacy">
        <p className="settings-notice">{ANALYTICS_SETTINGS.unconfigured}</p>
      </SettingsSection>
    );
  }

  const on = consent?.value !== 'declined';
  const disabled = !online || save.isPending || !consent;

  return (
    <SettingsSection title="Privacy">
      <p className="settings-notice">{ANALYTICS_SETTINGS.text}</p>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={disabled}
          aria-describedby={statusId}
          onChange={(event) =>
            save.mutate({
              value: event.target.checked ? 'allowed' : 'declined',
              source: 'settings',
            })
          }
        />
        <span>{ANALYTICS_SETTINGS.switchLabel}</span>
      </label>
      <p id={statusId} className="muted">
        {online ? consentStatus(consent) : ANALYTICS_SETTINGS.offline}
      </p>
      {save.isError && (
        <p className="form-error" role="alert">
          {ANALYTICS_SETTINGS.failed}
        </p>
      )}
    </SettingsSection>
  );
}
