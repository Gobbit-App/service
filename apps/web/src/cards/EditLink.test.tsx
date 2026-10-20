import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { respond } from '../test/api-mock';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { EditLink } = await import('./EditLink');

const me = { user: { id: 'u1', email: 'a@example.com', displayName: 'A' }, decks: [] };

beforeEach(() => {
  respond.mockReset();
  respond.mockImplementation((request) =>
    request === 'GET /me' ? Promise.resolve(me) : Promise.reject(new Error(request)),
  );
});

describe('EditLink', () => {
  it('a reader sees no Edit', () => {
    renderWithClient(<EditLink item={makeItem()} role="reader" />);
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  });

  it('an editor opens the editor for a published card', () => {
    const { navigate } = renderWithClient(<EditLink item={makeItem({ id: 'i1' })} role="editor" />);
    const link = screen.getByRole('link', { name: 'Edit' });
    expect(link).toHaveAttribute('href', '/i/i1/edit');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/i/i1/edit');
  });

  it("an editor sees Edit on their own proposal, not on someone else's", async () => {
    renderWithClient(
      <>
        <EditLink
          item={makeItem({ id: 'mine', status: 'proposed', createdBy: 'u1' })}
          role="editor"
        />
        <EditLink
          item={makeItem({ id: 'theirs', status: 'proposed', createdBy: 'u2' })}
          role="editor"
        />
      </>,
    );
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/i/mine/edit',
    );
    expect(screen.getAllByRole('link', { name: 'Edit' })).toHaveLength(1);
  });

  it('wraps the link in an actions row for lists', () => {
    const { container } = renderWithClient(<EditLink item={makeItem()} role="owner" row />);
    expect(container.querySelector('.card-actions a')).not.toBeNull();
  });
});
