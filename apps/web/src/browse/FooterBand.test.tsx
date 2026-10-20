import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BrowsePane } from './browse-params';
import { FooterBand, stepPane } from './FooterBand';

function Controlled({ initial = 'content' as BrowsePane, onNextCard = vi.fn() }) {
  const [pane, setPane] = useState<BrowsePane>(initial);
  return <FooterBand pageId="i1" pane={pane} onPane={setPane} onNextCard={onNextCard} active />;
}

describe('stepPane', () => {
  it('steps without wrapping', () => {
    expect(stepPane('content', 'next')).toBe('details');
    expect(stepPane('details', 'next')).toBe('source');
    expect(stepPane('source', 'next')).toBeNull();
    expect(stepPane('content', 'prev')).toBeNull();
  });
});

describe('FooterBand', () => {
  it('is a tablist named "Card view" whose selection follows the pane', () => {
    const { rerender } = render(
      <FooterBand pageId="i1" pane="details" onPane={vi.fn()} onNextCard={null} active />,
    );
    const tabs = within(screen.getByRole('tablist', { name: 'Card view' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Content', 'Details', 'Source']);
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Next card' })).toBeDisabled();

    rerender(<FooterBand pageId="i1" pane="source" onPane={vi.fn()} onNextCard={null} active />);
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Next view' })).toBeDisabled();
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

  it('switches panes with the ‹ › buttons and pages with ↓', () => {
    const onNextCard = vi.fn();
    render(<Controlled onNextCard={onNextCard} />);
    expect(screen.getByRole('button', { name: 'Previous view' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next view' }));
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(onNextCard).toHaveBeenCalledOnce();
  });

  it('disables everything on a state page', () => {
    render(
      <FooterBand
        pageId="state"
        pane="content"
        onPane={vi.fn()}
        onNextCard={null}
        active={false}
        disabled
      />,
    );
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next view' })).toBeDisabled();
  });
});
