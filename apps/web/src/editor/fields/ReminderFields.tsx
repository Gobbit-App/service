import { useQuery } from '@tanstack/react-query';
import { useId, type ReactElement } from 'react';
import type { Member } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { showBeforeUnits, type DismissMode } from '@gobbit/shared/reminder-constants';
import { membersQuery } from '../../deck-admin/deck-admin-queries';
import type { ReminderDraftPayload } from '../reminder-draft';
import type { FieldsProps } from './types';
import '../../reminders/reminders.css';

const UNIT_LABELS = { minutes: 'minutes', hours: 'hours', days: 'days' } as const;

const MODE_LABELS: Record<DismissMode, string> = {
  me: 'Only me',
  writers: 'Anyone who can edit',
  people: 'Specific people',
};

export const DISMISSERS_LOCKED =
  'Only the person who created this reminder can change who can dismiss it.';

/** D293: people who can be picked are the deck's live writers. */
export function pickableWriters(members: readonly Member[]): Member[] {
  return members.filter((m) => can(m.role, 'item.update') && (m.implicit || m.acceptedAt !== null));
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="field__error" role="alert">
      {message}
    </p>
  ) : null;
}

/**
 * 037 (contracts/web-ui.md): deadline, show-before and who can dismiss. The choice is hidden on
 * personal decks (always "me") and read-only for anyone but the creator (D293).
 */
export function ReminderFields({
  payload,
  onChange,
  errors,
  deck,
  disabled,
  item,
}: FieldsProps<'reminder'>): ReactElement {
  const id = useId();
  const personal = deck.kind === 'personal';
  const locked = item?.reminder ? !item.reminder.canChangeDismissers : false;
  const members = useQuery({ ...membersQuery(deck.id), enabled: !personal });
  const writers = pickableWriters(members.data ?? []);

  const set = (next: Partial<ReminderDraftPayload>) => onChange({ ...payload, ...next });
  const setMode = (mode: DismissMode) =>
    set({ dismiss: { mode, userIds: mode === 'people' ? payload.dismiss.userIds : [] } });
  const togglePerson = (userId: string, on: boolean) => {
    const ids = payload.dismiss.userIds.filter((x) => x !== userId);
    set({ dismiss: { mode: 'people', userIds: on ? [...ids, userId] : ids } });
  };

  const deadlineError = errors['payload.deadline'];
  const amountError = errors['payload.showBefore.amount'];
  const peopleError = errors['payload.dismiss.userIds'];

  return (
    <div className="editor__fields reminder-fields">
      <div className="field">
        <label htmlFor={`${id}-deadline`}>Deadline</label>
        <input
          id={`${id}-deadline`}
          type="datetime-local"
          value={payload.deadline}
          disabled={disabled}
          aria-invalid={deadlineError ? true : undefined}
          aria-describedby={deadlineError ? `${id}-deadline-error` : undefined}
          onChange={(e) => set({ deadline: e.currentTarget.value })}
        />
        <FieldError id={`${id}-deadline-error`} message={deadlineError} />
      </div>

      <fieldset className="field reminder-fields__show-before">
        <legend>Show before</legend>
        <div className="reminder-fields__row">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-label="Show before amount"
            value={payload.showBefore.amount}
            disabled={disabled}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? `${id}-amount-error` : `${id}-amount-hint`}
            onChange={(e) =>
              set({ showBefore: { ...payload.showBefore, amount: e.currentTarget.value } })
            }
          />
          <select
            aria-label="Show before unit"
            value={payload.showBefore.unit}
            disabled={disabled}
            onChange={(e) =>
              set({
                showBefore: {
                  ...payload.showBefore,
                  unit: e.currentTarget.value as ReminderDraftPayload['showBefore']['unit'],
                },
              })
            }
          >
            {showBeforeUnits.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
        <p id={`${id}-amount-hint`} className="field__hint">
          The card stays hidden until then.
        </p>
        <FieldError id={`${id}-amount-error`} message={amountError} />
      </fieldset>

      {!personal && (
        <fieldset className="field reminder-fields__dismiss" disabled={disabled || locked}>
          <legend>Who can dismiss</legend>
          {(Object.keys(MODE_LABELS) as DismissMode[]).map((mode) => (
            <label key={mode} className="card-editor__choice">
              <input
                type="radio"
                name={`${id}-mode`}
                value={mode}
                checked={payload.dismiss.mode === mode}
                onChange={() => setMode(mode)}
              />
              {MODE_LABELS[mode]}
            </label>
          ))}
          {payload.dismiss.mode === 'people' && (
            <div className="reminder-fields__people" aria-label="People who can dismiss">
              {members.isPending && <p className="muted">Loading people…</p>}
              {members.isError && <p className="field__error">Couldn&apos;t load the people.</p>}
              {writers.map((m) => (
                <label key={m.userId} className="card-editor__choice">
                  <input
                    type="checkbox"
                    checked={payload.dismiss.userIds.includes(m.userId)}
                    onChange={(e) => togglePerson(m.userId, e.currentTarget.checked)}
                  />
                  {m.displayName}
                </label>
              ))}
              <FieldError id={`${id}-people-error`} message={peopleError} />
            </div>
          )}
          {locked && <p className="muted">{DISMISSERS_LOCKED}</p>}
        </fieldset>
      )}
    </div>
  );
}
