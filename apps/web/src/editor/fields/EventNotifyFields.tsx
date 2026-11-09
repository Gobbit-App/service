import { useQuery } from '@tanstack/react-query';
import { useId, type ReactElement } from 'react';
import type { Member } from '@gobbit/shared';
import {
  EVENT_NOTIFY_TIMES_MAX,
  eventNoticeUnits,
  type EventAudienceMode,
  type EventNoticeUnit,
} from '@gobbit/shared/event-constants';
import { membersQuery } from '../../deck-admin/deck-admin-queries';
import { Button } from '../../ui/buttons/Button';
import { IconButton } from '../../ui/buttons/IconButton';
import {
  NOTIFY_LOCKED,
  notifySummary,
  pastNoticeLabels,
  type EventDraftPayload,
  type EventNotifyRow,
} from '../event-draft';
import type { FieldErrors } from '../validate';

const UNIT_LABELS: Record<EventNoticeUnit, string> = {
  minutes: 'minutes',
  hours: 'hours',
  days: 'days',
};

const MODE_LABELS: Record<EventAudienceMode, string> = {
  everyone: 'Everyone who can read it',
  people: 'Specific people',
  me: 'Only me',
  nobody: 'Nobody',
};

/** D361: anyone who can read the deck can be notified (readers included), once they've joined. */
export function pickableMembers(members: readonly Member[]): Member[] {
  return members.filter((m) => m.implicit || m.acceptedAt !== null);
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="field__error" role="alert">
      {message}
    </p>
  ) : null;
}

type Props = {
  payload: EventDraftPayload;
  onChange: (next: EventDraftPayload) => void;
  errors: FieldErrors;
  deckId: string;
  personal: boolean;
  /** Read-only for anyone but the creator (D363). */
  locked: boolean;
  disabled: boolean;
};

/**
 * 042 (T062, contracts/web-ui.md): the collapsed Notifications section — up to three notify-before
 * times and who is notified. Personal decks have no audience choice (always "me").
 */
export function EventNotifyFields({
  payload,
  onChange,
  errors,
  deckId,
  personal,
  locked,
  disabled,
}: Props): ReactElement {
  const id = useId();
  const members = useQuery({
    ...membersQuery(deckId),
    enabled: !personal && payload.notify.audience.mode === 'people',
  });
  const people = pickableMembers(members.data ?? []);
  const { before, audience } = payload.notify;
  const past = pastNoticeLabels(payload);

  const setNotify = (next: Partial<EventDraftPayload['notify']>) =>
    onChange({ ...payload, notify: { ...payload.notify, ...next } });
  const setRow = (index: number, row: EventNotifyRow) =>
    setNotify({ before: before.map((r, i) => (i === index ? row : r)) });
  const removeRow = (index: number) => setNotify({ before: before.filter((_, i) => i !== index) });
  const addRow = () =>
    setNotify({ before: [...before, { amount: '1', unit: payload.allDay ? 'days' : 'hours' }] });
  const setMode = (mode: EventAudienceMode) =>
    setNotify({ audience: { mode, userIds: mode === 'people' ? audience.userIds : [] } });
  const togglePerson = (userId: string, on: boolean) => {
    const ids = audience.userIds.filter((x) => x !== userId);
    setNotify({ audience: { mode: 'people', userIds: on ? [...ids, userId] : ids } });
  };

  const listError = errors['payload.notify.before'] ?? errors['payload.notify'];
  const peopleError = errors['payload.notify.audience.userIds'];
  const hasErrors = Object.keys(errors).some((k) => k.startsWith('payload.notify') && errors[k]);

  return (
    <details className="event-notify" open={hasErrors || undefined}>
      <summary className="event-notify__summary">
        <span className="event-notify__title">Notifications</span>
        <span className="muted">{notifySummary(payload, personal)}</span>
      </summary>
      <fieldset className="event-notify__body" disabled={disabled || locked}>
        <legend className="visually-hidden">Notify before</legend>
        <ul className="event-notify__rows">
          {before.map((row, i) => {
            const error = errors[`payload.notify.before.${i}.amount`];
            const errorId = `${id}-row-${i}-error`;
            return (
              <li key={i} className="event-notify__row">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  aria-label={`Notify time ${i + 1} amount`}
                  value={row.amount}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setRow(i, { ...row, amount: e.currentTarget.value })}
                />
                {payload.allDay ? (
                  <span>{row.amount.trim() === '1' ? 'day before' : 'days before'}</span>
                ) : (
                  <>
                    <select
                      aria-label={`Notify time ${i + 1} unit`}
                      value={row.unit}
                      onChange={(e) =>
                        setRow(i, { ...row, unit: e.currentTarget.value as EventNoticeUnit })
                      }
                    >
                      {eventNoticeUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                    <span>before</span>
                  </>
                )}
                <IconButton
                  icon="close"
                  label={`Remove notify time ${i + 1}`}
                  onClick={() => removeRow(i)}
                />
                <FieldError id={errorId} message={error} />
              </li>
            );
          })}
        </ul>
        <p className="field__hint">Set the amount to 0 to be notified at the start.</p>
        {before.length < EVENT_NOTIFY_TIMES_MAX && (
          <Button icon="plus" label="Add a time" variant="ghost" onClick={addRow} />
        )}
        <FieldError id={`${id}-list-error`} message={listError} />
        {past.length > 0 && (
          <p className="field__hint" role="status">
            Already past, won&apos;t be sent: {past.join(', ')}.
          </p>
        )}

        {!personal && (
          <fieldset className="event-notify__audience">
            <legend>Who is notified</legend>
            {(Object.keys(MODE_LABELS) as EventAudienceMode[]).map((mode) => (
              <label key={mode} className="card-editor__choice">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={mode}
                  checked={audience.mode === mode}
                  onChange={() => setMode(mode)}
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
            {audience.mode === 'people' && (
              <div className="event-notify__people" aria-label="People to notify">
                {members.isPending && <p className="muted">Loading people…</p>}
                {members.isError && <p className="field__error">Couldn&apos;t load the people.</p>}
                {people.map((m) => (
                  <label key={m.userId} className="card-editor__choice">
                    <input
                      type="checkbox"
                      checked={audience.userIds.includes(m.userId)}
                      onChange={(e) => togglePerson(m.userId, e.currentTarget.checked)}
                    />
                    {m.displayName}
                  </label>
                ))}
                <FieldError id={`${id}-people-error`} message={peopleError} />
              </div>
            )}
          </fieldset>
        )}
      </fieldset>
      {locked && <p className="muted">{NOTIFY_LOCKED}</p>}
    </details>
  );
}
