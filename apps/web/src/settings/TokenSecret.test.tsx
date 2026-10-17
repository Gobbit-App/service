import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IngestTokenCreated } from '@pb/shared';
import { TokenSecret } from './TokenSecret';

const created: IngestTokenCreated = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'My iPhone',
  prefix: 'ing_abcd',
  deckId: null,
  lastUsedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  token: 'ing_secret123',
};

describe('TokenSecret', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the token text and a Copy token button', () => {
    render(<TokenSecret created={created} emailDomain={null} onDone={vi.fn()} />);

    expect(screen.getByText('ing_secret123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy token' })).toBeInTheDocument();
  });

  it('shows the email address and a Copy email address button when a domain is set', () => {
    render(<TokenSecret created={created} emailDomain="in.example.com" onDone={vi.fn()} />);

    expect(screen.getByText('secret123@in.example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy email address' })).toBeInTheDocument();
  });

  it('omits the Copy email address button when there is no domain', () => {
    render(<TokenSecret created={created} emailDomain={null} onDone={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Copy email address' })).toBeNull();
  });

  it('calls onDone when Done is clicked', () => {
    const onDone = vi.fn();
    render(<TokenSecret created={created} emailDomain={null} onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
