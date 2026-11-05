import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableCard } from '../../cards/TableCard';
import { TextCard } from '../../cards/TextCard';
import { currentToast, dismissToast } from '../../ui/toast-store';
import { COPY_TOAST_MS } from './Detected';
import { DetectionProvider } from './detection';

const inBrowse = (ui: React.ReactElement) => render(<DetectionProvider>{ui}</DetectionProvider>);

/** jsdom has no clipboard; user-event installs its own, so set this after `userEvent.setup()`. */
function setClipboard(clipboard: Pick<Clipboard, 'writeText'> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

afterEach(() => {
  const toast = currentToast();
  if (toast) dismissToast(toast.id);
  vi.restoreAllMocks();
});

describe('detected text in a card body (D340)', () => {
  it('links phones, emails and web addresses with action labels', () => {
    inBrowse(
      <TextCard body={'Mum: +30 697 349 6445\nMail ana@example.com or see pizza.com/menu'} />,
    );
    expect(screen.getByRole('link', { name: 'Call +30 697 349 6445' })).toHaveAttribute(
      'href',
      'tel:+306973496445',
    );
    expect(screen.getByRole('link', { name: 'Email ana@example.com' })).toHaveAttribute(
      'href',
      'mailto:ana@example.com',
    );
    const open = screen.getByRole('link', { name: 'Open pizza.com/menu' });
    expect(open).toHaveAttribute('href', 'http://pizza.com/menu');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps the text as written', () => {
    const { container } = inBrowse(<TextCard body="Door code 4821, call 050-123-4567." />);
    expect(container.textContent).toBe('Door code 4821, call 050-123-4567.');
  });

  it('never marks text inside a link or code', () => {
    inBrowse(<TextCard body={'[call 050-123-4567](https://a.example) and `4821` too'} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks text inside emphasis and list items', () => {
    inBrowse(<TextCard body={'- **code 4821**\n- _050-123-4567_'} />);
    expect(screen.getByRole('button', { name: 'Copy 4821' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 050-123-4567' })).toBeInTheDocument();
  });

  it('leaves dates, years and short numbers alone', () => {
    inBrowse(<TextCard body="Since 2019, on 12/05/2024 at 10:30, room 12." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders nothing extra outside Browse', () => {
    render(<TextCard body="Door code 4821, call +30 697 349 6445" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('copying a number', () => {
  it('copies the number and says so for two seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setClipboard({ writeText });
    inBrowse(<TextCard body="Booking ref 1,250,000" />);

    await user.click(screen.getByRole('button', { name: 'Copy 1,250,000' }));

    expect(writeText).toHaveBeenCalledWith('1,250,000');
    expect(currentToast()).toMatchObject({ message: 'Copied', timeoutMs: COPY_TOAST_MS });
  });

  it('says so when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    setClipboard({ writeText });
    inBrowse(<TextCard body="Door code 4821" />);

    await user.click(screen.getByRole('button', { name: 'Copy 4821' }));

    expect(currentToast()?.message).toBe("Couldn't copy that number");
  });

  it('says so when there is no clipboard', async () => {
    setClipboard(undefined);
    inBrowse(<TextCard body="Door code 4821" />);

    await act(async () => screen.getByRole('button', { name: 'Copy 4821' }).click());

    expect(currentToast()?.message).toBe("Couldn't copy that number");
  });
});

describe('detected text in a table', () => {
  const payload = {
    columns: ['Who', 'Phone'],
    rows: [
      ['Plumber 4821', '+30 697 349 6445'],
      ['Office', 'office@example.com'],
    ],
  };

  it('marks body cells in Browse', () => {
    inBrowse(<TableCard payload={payload} />);
    expect(screen.getByRole('link', { name: 'Call +30 697 349 6445' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email office@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy 4821' })).toBeInTheDocument();
  });

  it('leaves cells as text elsewhere', () => {
    render(<TableCard payload={payload} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('cell', { name: '+30 697 349 6445' })).toBeInTheDocument();
  });
});
