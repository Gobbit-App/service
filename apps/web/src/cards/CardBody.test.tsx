import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { CardBody, INVALID_CARD_COPY } from './CardBody';

describe('CardBody', () => {
  // The first import of the calc chunk transforms mathjs (and instruments it under coverage),
  // which can exceed findBy's 1 s on a cold CI runner. Warming the module cache here keeps that
  // one-off cost out of the assertion; the test below still renders through React.lazy/Suspense.
  beforeAll(async () => {
    await import('./CalcCard');
  }, 30_000);

  it('renders a text card body as markdown', () => {
    render(<CardBody item={makeItem({ body: 'Hello **world**' })} cloudName={null} />);
    expect(screen.getByText('world').tagName).toBe('STRONG');
  });

  it('renders a table card', () => {
    const item = makeItem({
      type: 'table',
      body: '',
      payload: { columns: ['Day', 'Bus'], rows: [['Mon', '7:40']] },
    } as never);
    render(<CardBody item={item} cloudName={null} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders the image card with the configured cloud', () => {
    const item = makeItem({
      type: 'image',
      body: '',
      payload: { publicId: 'family/map', alt: 'School map' },
    } as never);
    render(<CardBody item={item} cloudName="demo" />);
    expect(screen.getByAltText('School map').getAttribute('src')).toContain('/demo/');
  });

  it('lazy-loads the calculator', async () => {
    const item = makeItem({
      type: 'calc',
      body: '',
      payload: {
        fields: [{ key: 'a', label: 'Kids', default: 2 }],
        expression: 'a * 10',
        resultLabel: 'Total',
      },
    } as never);
    render(<CardBody item={item} cloudName={null} />);
    expect(await screen.findByLabelText('Kids')).toBeInTheDocument();
  });

  it('shows a note instead of throwing for a malformed payload', () => {
    const item = makeItem({ type: 'table', body: '', payload: { rows: 'nope' } } as never);
    render(<CardBody item={item} cloudName={null} />);
    expect(screen.getByText(INVALID_CARD_COPY)).toBeInTheDocument();
  });

  it('keeps the body text under a typed card', () => {
    const item = makeItem({
      type: 'link',
      body: 'Bring a hat',
      payload: { url: 'https://example.org/trip' },
    } as never);
    render(<CardBody item={item} cloudName={null} />);
    expect(screen.getByText('Bring a hat')).toBeInTheDocument();
    expect(screen.getByText('example.org')).toBeInTheDocument();
  });
});
