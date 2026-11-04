import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushState } from '../push/use-push';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { NotificationsSection, PushBlock, NOTIFICATION_COPY, noticeText } =
  await import('./NotificationsSection');

const emailSwitch = () => screen.getByRole('switch', { name: NOTIFICATION_COPY.emailSwitch });

const push = (over: Partial<PushState> = {}): PushState => ({
  support: 'ready',
  subscribed: false,
  busy: false,
  notice: null,
  enable: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
  ...over,
});

beforeEach(() => {
  respond.mockReset();
  requests.mockClear();
});

describe('NotificationsSection (037, D297)', () => {
  it('shows the email switch from the saved preference and no push block without VAPID', async () => {
    respond.mockResolvedValue({ reminderEmails: true });
    renderWithClient(<NotificationsSection pushKey={null} />);
    await waitFor(() => expect(emailSwitch()).toBeChecked());
    expect(screen.queryByRole('button', { name: NOTIFICATION_COPY.enable })).toBeNull();
  });

  it('turns reminder emails off', async () => {
    respond.mockImplementation(async (req) =>
      req.startsWith('PUT') ? { reminderEmails: false } : { reminderEmails: true },
    );
    renderWithClient(<NotificationsSection pushKey={null} />);
    await waitFor(() => expect(emailSwitch()).toBeEnabled());
    fireEvent.click(emailSwitch());
    await waitFor(() => expect(emailSwitch()).not.toBeChecked());
    expect(requests).toHaveBeenCalledWith('PUT /me/notification-preferences', {
      body: { reminderEmails: false },
    });
  });

  it('says so when saving fails', async () => {
    respond.mockImplementation(async (req) => {
      if (req.startsWith('PUT')) throw new Error('500');
      return { reminderEmails: true };
    });
    renderWithClient(<NotificationsSection pushKey={null} />);
    await waitFor(() => expect(emailSwitch()).toBeEnabled());
    fireEvent.click(emailSwitch());
    expect(await screen.findByRole('alert')).toHaveTextContent(NOTIFICATION_COPY.emailFailed);
    expect(emailSwitch()).toBeChecked();
  });
});

describe('PushBlock', () => {
  it('offers to turn notifications on', () => {
    const state = push();
    renderWithClient(<PushBlock push={state} />);
    fireEvent.click(screen.getByRole('button', { name: NOTIFICATION_COPY.enable }));
    expect(state.enable).toHaveBeenCalled();
  });

  it('when on: test and turn off', () => {
    const state = push({ subscribed: true });
    renderWithClient(<PushBlock push={state} />);
    expect(screen.getByText(NOTIFICATION_COPY.on)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: NOTIFICATION_COPY.test }));
    fireEvent.click(screen.getByRole('button', { name: NOTIFICATION_COPY.disable }));
    expect(state.test).toHaveBeenCalled();
    expect(state.disable).toHaveBeenCalled();
  });

  it.each(['denied', 'unsupported', 'ios-not-installed'] as const)(
    'explains %s instead of offering a button',
    (support) => {
      renderWithClient(<PushBlock push={push({ support })} />);
      expect(screen.getByText(NOTIFICATION_COPY.support[support])).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('waits for the current subscription before offering to enable', () => {
    renderWithClient(<PushBlock push={push({ subscribed: null })} />);
    expect(screen.getByRole('button', { name: NOTIFICATION_COPY.enable })).toBeDisabled();
  });

  it('reports the outcome of an action', () => {
    renderWithClient(<PushBlock push={push({ subscribed: true, notice: { tested: 2 } })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sent to 2 devices.');
  });
});

describe('noticeText', () => {
  it('counts devices', () => {
    expect(noticeText({ tested: 1 })).toBe('Sent to 1 device.');
    expect(noticeText({ tested: 0 })).toBe('Sent to 0 devices.');
    expect(noticeText('failed')).toBe(NOTIFICATION_COPY.notice.failed);
  });
});
