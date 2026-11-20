import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeResizeObserver } from '../test/resize-observer';
import { CardClamp } from './CardClamp';

// jsdom has no layout: the clip box is 400 px tall, the content whatever the test says.
let contentHeight = 0;
const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const client = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return this.classList.contains('card__clip-content') ? contentHeight : 0;
  },
});
Object.defineProperty(Element.prototype, 'clientHeight', {
  configurable: true,
  get(this: Element) {
    return this.classList.contains('card__clip') ? 400 : 0;
  },
});
afterAll(() => {
  if (offset) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offset);
  if (client) Object.defineProperty(Element.prototype, 'clientHeight', client);
});

const renderClamp = () =>
  render(
    <article>
      <CardClamp title="Lyrics">
        <p>Long text</p>
      </CardClamp>
    </article>,
  );

describe('CardClamp', () => {
  beforeEach(() => {
    contentHeight = 0;
  });

  it('shows no toggle when the content fits', () => {
    contentHeight = 300;
    renderClamp();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('.card__clip')).not.toHaveClass('card__clip--more');
  });

  it('expands and collapses an overflowing card on demand', () => {
    contentHeight = 900;
    renderClamp();
    const clip = document.querySelector('.card__clip')!;
    const toggle = screen.getByRole('button', { name: 'Show more: Lyrics' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', clip.id);
    expect(clip).toHaveClass('card__clip--more');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less: Lyrics' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(clip).toHaveClass('card__clip--open');

    fireEvent.click(screen.getByRole('button', { name: 'Show less: Lyrics' }));
    expect(screen.getByRole('button', { name: 'Show more: Lyrics' })).toBeInTheDocument();
    expect(clip).not.toHaveClass('card__clip--open');
  });

  it('offers the toggle once late media make the content overflow', () => {
    contentHeight = 300;
    renderClamp();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    contentHeight = 900;
    act(() => FakeResizeObserver.resize(document.querySelector('.card__clip-content')!, 600));
    expect(screen.getByRole('button', { name: 'Show more: Lyrics' })).toBeInTheDocument();
  });

  it('opens when focus or find-in-page scrolls the clipped part', () => {
    contentHeight = 900;
    renderClamp();
    fireEvent.scroll(document.querySelector('.card__clip')!);
    expect(screen.getByRole('button', { name: 'Show less: Lyrics' })).toBeInTheDocument();
  });
});
