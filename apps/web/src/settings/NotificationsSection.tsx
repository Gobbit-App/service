import { useQuery } from '@tanstack/react-query';
import { useId, type ReactElement } from 'react';
import { notificationPreferencesQuery, useSetNotificationPreferences } from '../api/notifications';
import { useOnline } from '../api/offline';
import { usePush, type PushNotice, type PushState } from '../push/use-push';
import type { PushSupport } from '../push/push-support';
import { Button } from '../ui/buttons/Button';
import { SettingsSection } from './SettingsSection';

export const NOTIFICATION_COPY = {
  emailSwitch: 'Email me when a reminder is due',
  emailOffline: 'You’re offline. Changes need a connection.',
  emailFailed: 'Couldn’t save. Try again.',
  pushIntro: 'Get a notification on this device when a reminder is due.',
  enable: 'Turn on notifications on this device',
  disable: 'Turn off',
  test: 'Send a test notification',
  on: 'Notifications are on for this device.',
  support: {
    denied:
      'Notifications are blocked for Gobbit in this browser. Allow them in the browser’s site settings, then come back.',
    unsupported: 'This browser can’t receive notifications. Reminder emails still work.',
    'ios-not-installed':
      'On iPhone and iPad, add Gobbit to your Home Screen (Share, then Add to Home Screen) and open it from there to turn on notifications.',
  } satisfies Record<Exclude<PushSupport, 'ready'>, string>,
  notice: {
    enabled: 'Notifications are on.',
    disabled: 'Notifications are off for this device.',
    denied: 'Notifications weren’t allowed.',
    failed: 'Something went wrong. Try again.',
  },
} as const;

export function noticeText(notice: PushNotice): string {
  if (typeof notice === 'object') {
    return notice.tested === 1 ? 'Sent to 1 device.' : `Sent to ${notice.tested} devices.`;
  }
  return NOTIFICATION_COPY.notice[notice];
}

/**
 * 037 (D297, contracts/web-ui.md): Settings → Notifications. The email switch always; the push
 * block only when the server has VAPID keys (`config.push`).
 */
export function NotificationsSection({ pushKey }: { pushKey: string | null }): ReactElement {
  return (
    <SettingsSection title="Notifications">
      <EmailSwitch />
      {pushKey && <PushControls publicKey={pushKey} />}
    </SettingsSection>
  );
}

function EmailSwitch(): ReactElement {
  const online = useOnline();
  const prefs = useQuery(notificationPreferencesQuery());
  const save = useSetNotificationPreferences();
  const statusId = useId();
  return (
    <>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={prefs.data?.reminderEmails ?? false}
          disabled={!online || !prefs.data || save.isPending}
          aria-describedby={statusId}
          onChange={(event) => save.mutate({ reminderEmails: event.target.checked })}
        />
        <span>{NOTIFICATION_COPY.emailSwitch}</span>
      </label>
      <p id={statusId} className="muted">
        {online ? '' : NOTIFICATION_COPY.emailOffline}
      </p>
      {save.isError && (
        <p className="form-error" role="alert">
          {NOTIFICATION_COPY.emailFailed}
        </p>
      )}
    </>
  );
}

function PushControls({ publicKey }: { publicKey: string }): ReactElement {
  return <PushBlock push={usePush(publicKey)} />;
}

/** Rendering only, so tests drive it with a plain `PushState`. */
export function PushBlock({ push }: { push: PushState }): ReactElement {
  const online = useOnline();
  const offline = online ? null : NOTIFICATION_COPY.emailOffline;
  if (push.support !== 'ready') {
    return <p className="settings-notice">{NOTIFICATION_COPY.support[push.support]}</p>;
  }
  return (
    <>
      <p className="settings-notice">
        {push.subscribed ? NOTIFICATION_COPY.on : NOTIFICATION_COPY.pushIntro}
      </p>
      <div className="settings-actions">
        {push.subscribed ? (
          <>
            <Button
              icon="send"
              label={NOTIFICATION_COPY.test}
              variant="ghost"
              disabled={push.busy}
              disabledReason={offline}
              onClick={push.test}
            />
            <Button
              icon="bell-off"
              label={NOTIFICATION_COPY.disable}
              variant="ghost"
              disabled={push.busy}
              disabledReason={offline}
              onClick={push.disable}
            />
          </>
        ) : (
          <Button
            icon="bell"
            label={NOTIFICATION_COPY.enable}
            disabled={push.busy || push.subscribed === null}
            disabledReason={offline}
            onClick={push.enable}
          />
        )}
      </div>
      {push.notice && (
        <p className={push.notice === 'failed' ? 'form-error' : 'muted'} role="status">
          {noticeText(push.notice)}
        </p>
      )}
    </>
  );
}
