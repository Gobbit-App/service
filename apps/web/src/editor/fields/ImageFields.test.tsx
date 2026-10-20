import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSignResponse } from '@pb/shared';
import { makeDeck } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';
import { UploadError, type signAndUpload, type UploadOptions } from '../upload';
import { validateDraft } from '../validate';
import { emptyDraft } from '../draft';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { ImageFields } = await import('./ImageFields');

type Payload = { publicId: string; alt: string };
type UploadCall = {
  file: Blob;
  options: UploadOptions;
  resolve: (r: { publicId: string }) => void;
  reject: (e: unknown) => void;
};

const deck = makeDeck();
const MB = 1024 * 1024;
let calls: UploadCall[];
let latest: Payload;

/** Never-settling upload the test resolves, rejects or aborts by hand. */
const fakeUpload = vi.fn<typeof signAndUpload>(
  (file, _signer, options = {}) =>
    new Promise((resolve, reject) => {
      calls.push({ file, options, resolve, reject });
      options.signal?.addEventListener('abort', () =>
        reject(new UploadError('aborted', 'Upload cancelled')),
      );
    }),
);
const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>();

function Harness({ initial }: { initial: Payload }): ReactElement {
  const [payload, setPayload] = useState(initial);
  const onChange = (next: Payload) => {
    latest = next;
    setPayload(next);
  };
  const draft = { ...emptyDraft('image', 'cat'), title: 'T', payload };
  return (
    <ImageFields
      payload={payload}
      onChange={onChange}
      errors={validateDraft(draft)}
      deck={deck}
      disabled={false}
      uploadDeps={{ signer, upload: fakeUpload }}
    />
  );
}

function renderFields(initial: Payload = { publicId: '', alt: '' }) {
  latest = initial;
  return renderWithClient(<Harness initial={initial} />);
}

function photo(name = 'photo.jpg', type = 'image/jpeg', size = MB): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function pickFile(label: string, file: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

beforeEach(() => {
  calls = [];
  fakeUpload.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:local');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('ImageFields', () => {
  it('offers a camera input and a library input that accept the image types', () => {
    renderFields();
    const camera = screen.getByLabelText('Take photo');
    const library = screen.getByLabelText('Choose photo');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(library).not.toHaveAttribute('capture');
    expect(library.getAttribute('accept')).toContain('.heic');
  });

  it('refuses a wrong type or an oversized file before any upload (FR-004)', () => {
    renderFields();
    pickFile('Choose photo', photo('doc.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG, WebP or HEIC');
    pickFile('Choose photo', photo('big.jpg', 'image/jpeg', 9 * MB));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 8 MB');
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it('accepts a HEIC by extension when the browser reports no type', () => {
    renderFields();
    pickFile('Take photo', photo('IMG_0001.HEIC', ''));
    expect(fakeUpload).toHaveBeenCalledTimes(1);
  });

  it('shows progress, then attaches the public id; alt is still needed to save', async () => {
    renderFields();
    pickFile('Choose photo', photo());
    expect(screen.getByText('Preparing upload…')).toBeInTheDocument();
    act(() => calls[0]!.options.onProgress?.(40));
    expect(screen.getByText('Uploading… 40%')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload progress')).toHaveAttribute('value', '40');
    await act(async () => calls[0]!.resolve({ publicId: 'gobbit/items/d/p1' }));
    expect(latest).toEqual({ publicId: 'gobbit/items/d/p1', alt: '' });
    expect(screen.getByText('Alt text is required')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Alt text'), { target: { value: 'A loaf' } });
    expect(latest).toEqual({ publicId: 'gobbit/items/d/p1', alt: 'A loaf' });
    expect(screen.queryByText('Alt text is required')).not.toBeInTheDocument();
  });

  it('keeps alt typed during the upload', async () => {
    renderFields();
    pickFile('Choose photo', photo());
    fireEvent.change(screen.getByLabelText('Alt text'), { target: { value: 'Bread' } });
    await act(async () => calls[0]!.resolve({ publicId: 'p1' }));
    expect(latest).toEqual({ publicId: 'p1', alt: 'Bread' });
  });

  it('cancelling leaves no photo (FR-005)', async () => {
    renderFields();
    pickFile('Choose photo', photo());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' })));
    expect(calls[0]!.options.signal?.aborted).toBe(true);
    expect(latest.publicId).toBe('');
    expect(screen.getByLabelText('Take photo')).toBeInTheDocument();
    expect(screen.getByText('Add a photo')).toBeInTheDocument();
  });

  it('a failed upload leaves no photo and retries with the same file', async () => {
    renderFields();
    const file = photo();
    pickFile('Choose photo', file);
    await act(async () =>
      calls[0]!.reject(new UploadError('failed', "The photo couldn't be uploaded.")),
    );
    expect(screen.getByRole('alert')).toHaveTextContent("The photo couldn't be uploaded.");
    expect(latest.publicId).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));
    expect(calls[1]!.file).toBe(file);
    await act(async () => calls[1]!.resolve({ publicId: 'p2' }));
    expect(latest.publicId).toBe('p2');
  });

  it('replaces and removes an existing photo (FR-007)', async () => {
    renderFields({ publicId: 'old', alt: 'Old' });
    expect(screen.queryByLabelText('Take photo')).not.toBeInTheDocument();
    pickFile('Replace photo', photo());
    expect(latest).toEqual({ publicId: '', alt: 'Old' });
    await act(async () => calls[0]!.resolve({ publicId: 'new' }));
    expect(latest).toEqual({ publicId: 'new', alt: 'Old' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(latest).toEqual({ publicId: '', alt: 'Old' });
    expect(screen.getByLabelText('Choose photo')).toBeInTheDocument();
  });

  it('frees the local thumbnail when the photo is removed', async () => {
    renderFields();
    pickFile('Choose photo', photo());
    await act(async () => calls[0]!.resolve({ publicId: 'p1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
  });

  it('disables picking offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderFields();
    expect(screen.getByLabelText('Take photo')).toBeDisabled();
    expect(screen.getByText(/back online/)).toBeInTheDocument();
  });
});
