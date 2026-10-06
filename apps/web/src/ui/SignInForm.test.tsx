import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/api-error';
import { SignInForm } from './SignInForm';

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  return user;
}

describe('SignInForm', () => {
  it('sends the trimmed email and shows the inbox message', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<SignInForm onSubmit={onSubmit} />);

    await submit('  ada@example.com ');

    expect(onSubmit).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent('ada@example.com');
  });

  it('disables the button while sending', async () => {
    let finish!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<SignInForm onSubmit={onSubmit} />);

    await submit('ada@example.com');

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    finish();
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
  });

  it('explains rate limiting on 429', async () => {
    render(<SignInForm onSubmit={() => Promise.reject(new ApiError(429, null))} />);

    await submit('ada@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });

  it('shows a generic error otherwise and keeps the email', async () => {
    render(<SignInForm onSubmit={() => Promise.reject(new TypeError('offline'))} />);

    await submit('ada@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send the link");
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
  });

  it('returns to an empty form from the sent state', async () => {
    render(<SignInForm onSubmit={async () => {}} />);

    const user = await submit('ada@example.com');
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }));

    expect(screen.getByLabelText('Email')).toHaveValue('');
  });
});
