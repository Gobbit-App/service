import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { ReviewEditForm } from './ReviewEditForm';

const general = makeCategory({ id: 'c-general', name: 'General' });
const health = makeCategory({ id: 'c-health', name: 'Health', isDefault: false });

function setup(item = makeItem({ id: 'p1', status: 'proposed', categoryIds: ['c-general'] })) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const view = renderWithClient(
    <ReviewEditForm
      item={item}
      deck={makeDeck()}
      categories={[general, health]}
      saving={false}
      errors={[]}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  return { ...view, onSave, onCancel };
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('ReviewEditForm (FR-016)', () => {
  it('sends only the changed title', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    save();
    expect(onSave).toHaveBeenCalledWith({ title: 'Renamed' });
  });

  it('sends the new category list when a chip is toggled', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    save();
    expect(onSave).toHaveBeenCalledWith({ categoryIds: ['c-general', 'c-health'] });
  });

  it('sends the whole link payload when the url changes', () => {
    const link = makeItem({
      id: 'p2',
      type: 'link',
      status: 'proposed',
      categoryIds: ['c-general'],
      payload: { url: 'https://a.example/', preview: { title: 'A' } },
    });
    const { onSave } = setup(link);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://b.example/' } });
    save();
    expect(onSave).toHaveBeenCalledWith({
      payload: { url: 'https://b.example/', preview: { title: 'A' } },
    });
  });

  it('closes without a request when nothing changed', () => {
    const { onSave, onCancel } = setup();
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('lets a proposal keep no category (publishing assigns one)', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    save();
    expect(onSave).toHaveBeenCalledWith({ categoryIds: [] });
  });

  it('blocks an empty title', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers "Edit fully" back to the review queue', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Edit fully' })).toHaveAttribute(
      'href',
      '/i/p1/edit?from=review',
    );
  });
});
