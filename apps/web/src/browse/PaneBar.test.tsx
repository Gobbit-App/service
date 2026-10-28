import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BrowsePane } from './browse-params';
import { PaneBar } from './PaneBar';

function Controlled({ initial = 'content' as BrowsePane }) {
  const [pane, setPane] = useState<BrowsePane>(initial);
  return <PaneBar pageId="i1" pane={pane} onPane={setPane} active />;
}

describe('PaneBar', () => {
  it('is a tablist named "Card view" whose selection follows the pane', () => {
    const { rerender } = render(<PaneBar pageId="i1" pane="details" onPane={vi.fn()} active />);
    const tabs = within(screen.getByRole('tablist', { name: 'Card view' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Content', 'Details', 'Source']);
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('tabindex', '-1');

    rerender(<PaneBar pageId="i1" pane="source" onPane={vi.fn()} active />);
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys, Home and End', () => {
    render(<Controlled />);
    const content = screen.getByRole('tab', { name: 'Content' });
    content.focus();
    fireEvent.keyDown(content, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Details' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Source' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Source' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows no arrow buttons, only the tabs (D215)', () => {
    render(<Controlled />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('disables everything on a state page', () => {
    render(
      <PaneBar
        pageId="state"
        pane="content"
        onPane={vi.fn()}

        active={false}
        disabled
      />,
    );
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
  });
});
