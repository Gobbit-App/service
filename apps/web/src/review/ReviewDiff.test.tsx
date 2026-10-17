import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewDiff } from './ReviewDiff';
import type { FieldChange } from './review-diff';

describe('ReviewDiff (D106)', () => {
  it('renders the same-as-existing message when there are no changes', () => {
    render(<ReviewDiff changes={[]} />);
    expect(screen.getByText('Same as the existing card.')).toBeInTheDocument();
  });

  it('renders field labels, del/ins values, and a dash for an empty before', () => {
    const changes: FieldChange[] = [
      { field: 'title', label: 'Title', before: 'Old', after: 'New' },
      { field: 'body', label: 'Text', before: '', after: 'Hi' },
    ];
    render(<ReviewDiff changes={changes} />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Old').tagName).toBe('DEL');
    expect(screen.getByText('New').tagName).toBe('INS');
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
