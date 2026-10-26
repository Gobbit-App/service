import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeDeck, makeItem } from '../test/fixtures';
import { renderInRouter } from '../test/render-in-router';
import { ReviewEditForm } from './ReviewEditForm';

const general = makeCategory({ id: 'c-general', name: 'General' });
const health = makeCategory({ id: 'c-health', name: 'Health', isDefault: false });

async function setup(
  item = makeItem({ id: 'p1', status: 'proposed', categoryIds: ['c-general'] }),
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const view = await renderInRouter(
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
  it('sends only the changed title', async () => {
    const { onSave } = await setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    save();
    expect(onSave).toHaveBeenCalledWith({ title: 'Renamed' });
  });

  it('sends the new category list when a chip is toggled', async () => {
    const { onSave } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    save();
    expect(onSave).toHaveBeenCalledWith({ categoryIds: ['c-general', 'c-health'] });
  });

  it('sends the whole link payload when the url changes', async () => {
    const link = makeItem({
      id: 'p2',
      type: 'link',
      status: 'proposed',
      categoryIds: ['c-general'],
      payload: { url: 'https://a.example/', preview: { title: 'A' } },
    });
    const { onSave } = await setup(link);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://b.example/' } });
    save();
    expect(onSave).toHaveBeenCalledWith({
      payload: { url: 'https://b.example/', preview: { title: 'A' } },
    });
  });

  it('closes without a request when nothing changed', async () => {
    const { onSave, onCancel } = await setup();
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('lets a proposal keep no category (publishing assigns one)', async () => {
    const { onSave } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    save();
    expect(onSave).toHaveBeenCalledWith({ categoryIds: [] });
  });

  it('blocks an empty title', async () => {
    const { onSave } = await setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers "Edit fully" back to the review queue', async () => {
    await setup();
    expect(screen.getByRole('link', { name: 'Edit fully' })).toHaveAttribute(
      'href',
      '/i/p1/edit?from=review',
    );
  });
});

describe('ReviewEditForm: unsaved-changes guard (022 FR-010)', () => {
  const cancel = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const rename = () =>
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });

  it('Cancel with no changes closes at once', async () => {
    const { onCancel } = await setup();
    cancel();
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel with changes asks; Keep editing keeps them', async () => {
    const { onCancel } = await setup();
    rename();
    cancel();
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('Renamed');
  });

  it('Discard closes the form', async () => {
    const { onCancel } = await setup();
    rename();
    cancel();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('leaving the page with changes asks first', async () => {
    const { location } = await setup();
    rename();
    fireEvent.click(screen.getByRole('link', { name: 'Edit fully' }));
    await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(location()).toBe('/here');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await screen.findByText('Elsewhere');
    expect(location()).toBe('/i/p1/edit?from=review');
  });
});
