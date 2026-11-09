import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, Member } from '@gobbit/shared';
import { makeDeck, makeItem } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';
import { NOTIFY_LOCKED, type EventDraftPayload } from '../event-draft';

const GET = vi.fn();
const POST = vi.fn();
const unwrap = vi.fn();
vi.mock('../../api/client', () => ({ api: { GET, POST }, unwrap }));
const { EventFields } = await import('./EventFields');
const { pickableMembers } = await import('./EventNotifyFields');

const member = (displayName: string, overrides: Partial<Member> = {}): Member => ({
  userId: displayName.toLowerCase(),
  email: `${displayName.toLowerCase()}@example.com`,
  displayName,
  role: 'editor',
  invitedAt: '2026-01-01T00:00:00.000Z',
  acceptedAt: '2026-01-02T00:00:00.000Z',
  implicit: false,
  ...overrides,
});

const MEMBERS = [
  member('Olive', { role: 'owner', implicit: true, invitedAt: null, acceptedAt: null }),
  member('Rita', { role: 'reader' }),
  member('Pam', { acceptedAt: null }),
];

const base: EventDraftPayload = {
  allDay: false,
  start: '2026-12-03T18:00',
  end: '',
  timeZone: 'UTC',
  stored: null,
  location: '',
  url: '',
  notify: { before: [{ amount: '1', unit: 'days' }], audience: { mode: 'everyone', userIds: [] } },
};

type Props = Parameters<typeof EventFields>[0];

function setup(props: Partial<Props> = {}, payload: EventDraftPayload = base) {
  const onChange = vi.fn();
  renderWithClient(
    <EventFields
      payload={payload}
      onChange={onChange}
      errors={{}}
      deck={makeDeck({ kind: 'shared' })}
      disabled={false}
      setTitleIfEmpty={() => {}}
      {...(props as object)}
    />,
  );
  return { onChange };
}

beforeEach(() => {
  GET.mockReset().mockReturnValue('members');
  POST.mockReset();
  unwrap.mockReset().mockResolvedValue({ data: MEMBERS });
});

describe('EventFields (042)', () => {
  it('anyone who joined can be notified, readers included', () => {
    expect(pickableMembers(MEMBERS).map((m) => m.displayName)).toEqual(['Olive', 'Rita']);
  });

  it('edits the start and the location', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-12-04T10:00' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, start: '2026-12-04T10:00' });
    fireEvent.change(screen.getByLabelText(/Where/), { target: { value: 'Town hall' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, location: 'Town hall' });
  });

  it('switching to all day keeps the date and counts notify times in days', () => {
    const { onChange } = setup(
      {},
      {
        ...base,
        notify: { ...base.notify, before: [{ amount: '30', unit: 'hours' }] },
      },
    );
    fireEvent.click(screen.getByLabelText('All day'));
    const next = onChange.mock.lastCall?.[0] as EventDraftPayload;
    expect(next.allDay).toBe(true);
    expect(next.start).toBe('2026-12-03');
    expect(next.notify.before).toEqual([{ amount: '1', unit: 'days' }]);
  });

  it('shows date inputs and no zone note for all-day events', () => {
    setup({}, { ...base, allDay: true, start: '2026-12-03' });
    expect(screen.getByLabelText('Starts')).toHaveAttribute('type', 'date');
    expect(screen.queryByText(/^Times in /)).not.toBeInTheDocument();
  });

  it('shows field errors on their inputs and opens Notifications on a notify error', () => {
    setup({
      errors: {
        'payload.end': 'The end must be after the start',
        'payload.notify.before.0.amount': 'Too far',
      },
    });
    expect(screen.getByLabelText(/Ends/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The end must be after the start')).toBeInTheDocument();
    expect(screen.getByText('Notifications').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('Notify time 1 amount')).toHaveAttribute('aria-invalid', 'true');
  });

  it('adds up to three notify times and removes them', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a time' }));
    expect((onChange.mock.lastCall?.[0] as EventDraftPayload).notify.before).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove notify time 1' }));
    expect((onChange.mock.lastCall?.[0] as EventDraftPayload).notify.before).toEqual([]);
  });

  it('hides "Add a time" at three times', () => {
    const row = { amount: '1', unit: 'hours' } as const;
    setup({}, { ...base, notify: { ...base.notify, before: [row, row, row] } });
    expect(screen.queryByRole('button', { name: 'Add a time' })).not.toBeInTheDocument();
  });

  it('lists the people to pick from on a shared deck', async () => {
    const { onChange } = setup(
      {},
      {
        ...base,
        notify: { ...base.notify, audience: { mode: 'people', userIds: [] } },
      },
    );
    const people = screen.getByLabelText('People to notify');
    fireEvent.click(await within(people).findByLabelText('Rita'));
    expect((onChange.mock.lastCall?.[0] as EventDraftPayload).notify.audience).toEqual({
      mode: 'people',
      userIds: ['rita'],
    });
    expect(within(people).queryByLabelText('Pam')).not.toBeInTheDocument();
  });

  it('counts all-day notify times in days only, with no unit picker', () => {
    setup(
      {},
      {
        ...base,
        allDay: true,
        start: '2026-12-03',
        notify: { ...base.notify, before: [{ amount: '2', unit: 'days' }] },
      },
    );
    expect(screen.queryByLabelText('Notify time 1 unit')).not.toBeInTheDocument();
    expect(screen.getByText('days before')).toBeInTheDocument();
  });

  it('says which notify times are already past and won’t be sent', () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setup(
      {},
      {
        ...base,
        start: local,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notify: { ...base.notify, before: [{ amount: '1', unit: 'days' }] },
      },
    );
    expect(screen.getByText(/Already past, won.t be sent: /)).toHaveAttribute('role', 'status');
  });

  it('offers no audience choice on a personal deck', () => {
    setup({ deck: makeDeck({ kind: 'personal' }) });
    expect(screen.queryByText('Who is notified')).not.toBeInTheDocument();
  });

  it('locks Notifications for someone other than the creator', () => {
    const item = makeItem({
      type: 'event',
      event: { canEditNotify: false } as Item['event'],
    });
    setup({ item });
    expect(screen.getByText(NOTIFY_LOCKED)).toBeInTheDocument();
    expect(screen.getByLabelText('Notify time 1 amount')).toBeDisabled();
    expect(screen.getByLabelText('Starts')).toBeEnabled();
  });
});
