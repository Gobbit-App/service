import { useId, type ReactElement } from 'react';
import { codePointLength } from '@gobbit/shared/card-limits';
import { EVENT_LOCATION_MAX } from '@gobbit/shared/event-constants';
import { zoneCity } from '@gobbit/shared/event-time';
import type { LinkDraftPayload } from '../draft';
import { withAllDay, type EventDraftPayload } from '../event-draft';
import { deviceTimeZone } from '../../lib/device-time-zone';
import { EventNotifyFields } from './EventNotifyFields';
import { LimitMeter } from './LimitMeter';
import { LinkEditorFields } from './LinkEditorFields';
import { TextInput } from './TextInput';
import type { FieldsProps } from './types';
import '../../event-cards/event-cards.css';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="field__error" role="alert">
      {message}
    </p>
  ) : null;
}

/**
 * 042 (T036, contracts/web-ui.md): When (all-day switch, device zone note), Where, an optional
 * link with the link card's preview tools, and the collapsed Notifications section (T062).
 */
export function EventFields(props: FieldsProps<'event'>): ReactElement {
  const { payload, onChange, errors, deck, disabled, item } = props;
  const id = useId();
  const set = (next: Partial<EventDraftPayload>) => onChange({ ...payload, ...next });
  const inputType = payload.allDay ? 'date' : 'datetime-local';
  const startError = errors['payload.start'];
  const endError = errors['payload.end'];
  const locationMeterId = `${id}-location-meter`;

  // The link reuses the link card's editor (Fetch preview, Add photo) over `url` + `preview`.
  const link: LinkDraftPayload = { url: payload.url, preview: payload.preview };
  const onLinkChange = (next: LinkDraftPayload) => set({ url: next.url, preview: next.preview });

  return (
    <div className="editor__fields event-fields">
      <fieldset className="field event-fields__when">
        <legend>When</legend>
        <label className="card-editor__choice">
          <input
            type="checkbox"
            checked={payload.allDay}
            disabled={disabled}
            onChange={(e) => onChange(withAllDay(payload, e.currentTarget.checked))}
          />
          All day
        </label>
        <div className="event-fields__times">
          <div className="field">
            <label htmlFor={`${id}-start`}>Starts</label>
            <input
              id={`${id}-start`}
              type={inputType}
              value={payload.start}
              disabled={disabled}
              aria-invalid={startError ? true : undefined}
              aria-describedby={startError ? `${id}-start-error` : `${id}-zone`}
              onChange={(e) => set({ start: e.currentTarget.value })}
            />
            <FieldError id={`${id}-start-error`} message={startError} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-end`}>Ends (optional)</label>
            <input
              id={`${id}-end`}
              type={inputType}
              value={payload.end}
              min={payload.start || undefined}
              disabled={disabled}
              aria-invalid={endError ? true : undefined}
              aria-describedby={endError ? `${id}-end-error` : `${id}-zone`}
              onChange={(e) => set({ end: e.currentTarget.value })}
            />
            <FieldError id={`${id}-end-error`} message={endError} />
          </div>
        </div>
        {!payload.allDay && (
          <p id={`${id}-zone`} className="field__hint">
            Times in {zoneCity(deviceTimeZone())} time.
          </p>
        )}
      </fieldset>

      <TextInput
        label="Where (optional)"
        value={payload.location}
        onChange={(location) => set({ location })}
        error={errors['payload.location']}
        disabled={disabled}
        hint={
          <LimitMeter
            id={locationMeterId}
            used={codePointLength(payload.location.trim())}
            max={EVENT_LOCATION_MAX}
          />
        }
      />

      <div className="event-fields__link">
        <LinkEditorFields
          payload={link}
          onChange={onLinkChange}
          errors={errors}
          deck={deck}
          disabled={disabled}
          setTitleIfEmpty={props.setTitleIfEmpty}
        />
      </div>

      <EventNotifyFields
        payload={payload}
        onChange={onChange}
        errors={errors}
        deckId={deck.id}
        personal={deck.kind === 'personal'}
        locked={item?.event ? !item.event.canEditNotify : false}
        disabled={disabled}
      />
    </div>
  );
}
