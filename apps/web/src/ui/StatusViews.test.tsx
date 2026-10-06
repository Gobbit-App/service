import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineBanner, EmptyState, ErrorState, UpdatePrompt, LoadingState } from './StatusViews';

describe('OfflineBanner', () => {
  it('returns null when not visible', () => {
    const { container } = render(<OfflineBanner visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when visible', () => {
    render(<OfflineBanner visible={true} />);
    expect(screen.getByText("You're offline — showing saved cards.")).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No items');
  });

  it('renders body when children provided', () => {
    render(<EmptyState title="Empty" children={<p>No data</p>} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="Empty" action={<button>Create one</button>} />);
    expect(screen.getByRole('button')).toHaveTextContent('Create one');
  });
});

describe('ErrorState', () => {
  it('has alert role', () => {
    render(<ErrorState message="Something failed" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders default title', () => {
    render(<ErrorState message="Error message" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Something went wrong');
  });

  it('calls onRetry when retry button clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Failed" onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('does not render retry button when onRetry not provided', () => {
    render(<ErrorState message="Error" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('UpdatePrompt', () => {
  it('returns null when not visible', () => {
    const { container } = render(
      <UpdatePrompt visible={false} onUpdate={() => {}} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onUpdate when Reload clicked', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<UpdatePrompt visible={true} onUpdate={onUpdate} onDismiss={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onDismiss when Later clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<UpdatePrompt visible={true} onUpdate={() => {}} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('LoadingState', () => {
  it('renders default label', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<LoadingState label="Please wait" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
  });
});
