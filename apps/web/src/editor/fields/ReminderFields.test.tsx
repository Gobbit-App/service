import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@gobbit/shared';
import { makeDeck, makeReminder } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';
import type { ReminderDraftPayload } from '../reminder-draft';

const GET = vi.fn();
const unwrap = vi.fn();
vi.mock('../../api/client', () => ({ api: { GET }, unwrap }));
const { DISMISSERS_LOCKED, pickableWriters, ReminderFields } = await import('./ReminderFields');

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
  member('Ed'),
  member('Rita', { role: 'reader' }),
  member('Pam', { acceptedAt: null }),
];

const base: ReminderDraftPayload = {
  deadline: '2026-11-04T09:00',
  storedDeadline: null,
  timeZone: 'UTC',
  showBefore: { amount: '24', unit: 'hours' },
  dismiss: { mode: 'writers', userIds: [] },
};

function setup(
  props: Partial<Parameters<typeof ReminderFields>[0]> = {},
  payload: ReminderDraftPayload = base,
) {
  const onChange = vi.fn();
  renderWithClient(
    <ReminderFields
      payload={payload}
      onChange={onChange}
      errors={{}}
      deck={makeDeck({ kind: 'shared' })}
      disabled={false}
      {...props}
    />,
  );
  return { onChange };
}

beforeEach(() => {
  GET.mockReset().mockReturnValue('members');
  unwrap.mockReset().mockResolvedValue({ data: MEMBERS });
});

describe('ReminderFields (037)', () => {
  it('only live writers can be picked', () => {
    expect(pickableWriters(MEMBERS).map((m) => m.displayName)).toEqual(['Olive', 'Ed']);
  });

  it('edits the deadline and show-before', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-11-05T10:00' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, deadline: '2026-11-05T10:00' });
    fireEvent.change(screen.getByLabelText('Show before unit'), { target: { value: 'days' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...base,
      showBefore: { amount: '24', unit: 'days' },
    });
  });

  it('shows field errors on their inputs', () => {
    setup({ errors: { 'payload.deadline': 'Pick a time in the future' } });
    expect(screen.getByLabelText('Deadline')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Pick a time in the future')).toBeInTheDocument();
  });

  it('lists the deck writers for "Specific people" and toggles them', async () => {
    const people = { ...base, dismiss: { mode: 'people' as const, userIds: ['ed'] } };
    const { onChange } = setup({}, people);
    expect(await screen.findByRole('checkbox', { name: 'Ed' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Rita' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Pam' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Olive' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...base,
      dismiss: { mode: 'people', userIds: ['ed', 'olive'] },
    });
  });

  it('switching away from people drops the picks', () => {
    const people = { ...base, dismiss: { mode: 'people' as const, userIds: ['ed'] } };
    const { onChange } = setup({}, people);
    fireEvent.click(screen.getByRole('radio', { name: 'Only me' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, dismiss: { mode: 'me', userIds: [] } });
  });

  it('hides the choice on a personal deck and asks for no members', () => {
    setup({ deck: makeDeck({ kind: 'personal' }) });
    expect(screen.queryByRole('group', { name: 'Who can dismiss' })).not.toBeInTheDocument();
    expect(GET).not.toHaveBeenCalled();
  });

  it('locks the choice for anyone but the creator', () => {
    setup({ item: makeReminder({ canChangeDismissers: false }) });
    expect(screen.getByRole('group', { name: 'Who can dismiss' })).toBeDisabled();
    expect(screen.getByText(DISMISSERS_LOCKED)).toBeInTheDocument();
  });
});
