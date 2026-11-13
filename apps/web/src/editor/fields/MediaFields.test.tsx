import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset, MediaKind, MediaSignResponse } from '@gobbit/shared';
import { makeDeck } from '../../test/fixtures';
import { paste } from '../../test/paste';
import { renderWithClient } from '../../test/render';
import type { MediaPayload } from '../../cards/payload-guards';
import { UploadError, type signAndUpload, type UploadedImage, type UploadOptions } from '../upload';
import { validateDraft } from '../validate';
import { emptyDraft } from '../draft';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { MediaFields } = await import('./MediaFields');

type Done = { publicId: string; kind?: MediaKind; pages?: number; durationMs?: number };
type UploadCall = {
  file: Blob;
  options: UploadOptions;
  resolve: (r: Done) => void;
  reject: (e: unknown) => void;
};

const deck = makeDeck();
const MB = 1024 * 1024;
let calls: UploadCall[];
let latest: MediaPayload;
let uploading: boolean[];

/** Never-settling upload the test resolves, rejects or aborts by hand. */
const fakeUpload = vi.fn<typeof signAndUpload>(
  (file, _signer, options = {}) =>
    new Promise((resolve, reject) => {
      calls.push({
        file,
        options,
        resolve: ({ publicId, kind = 'image' }) =>
          resolve({
            publicId,
            version: 1,
            signature: 's',
            width: kind === 'audio' ? undefined : 10,
            height: kind === 'audio' ? undefined : 10,
            bytes: 1,
            format: kind === 'image' ? 'jpg' : kind === 'pdf' ? 'pdf' : 'mp4',
            kind,
            resourceType: kind === 'image' || kind === 'pdf' ? 'image' : 'video',
          }),
        reject,
      });
      options.signal?.addEventListener('abort', () =>
        reject(new UploadError('aborted', 'Upload cancelled')),
      );
    }),
);
const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>();
/** The API's confirm step: records the upload and answers with the asset (D157). */
const confirm = vi.fn<(deckId: string, uploaded: UploadedImage) => Promise<MediaAsset>>(
  async (_deckId, { publicId, width, height, bytes, format, kind }) => ({
    publicId,
    kind: kind ?? 'image',
    resourceType: 'image',
    width: width ?? null,
    height: height ?? null,
    durationMs: kind === 'video' || kind === 'audio' ? 65_000 : null,
    pages: kind === 'pdf' ? 3 : null,
    originalFilename: kind && kind !== 'image' ? `minutes.${format}` : null,
    bytes,
    format,
    source: 'editor',
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
);

function Harness({ initial }: { initial: MediaPayload }): ReactElement {
  const [payload, setPayload] = useState(initial);
  const onChange = (next: MediaPayload) => {
    latest = next;
    setPayload(next);
  };
  const draft = { ...emptyDraft('media', 'cat'), title: 'T', payload };
  return (
    <MediaFields
      payload={payload}
      onChange={onChange}
      errors={validateDraft(draft)}
      deck={deck}
      disabled={false}
      onUploadingChange={(busy) => uploading.push(busy)}
      uploadDeps={{ signer, upload: fakeUpload, confirm }}
    />
  );
}

const EMPTY: MediaPayload = { kind: 'image', images: [{ publicId: '', alt: '' }] };

function renderFields(initial: MediaPayload = EMPTY) {
  latest = initial;
  return renderWithClient(<Harness initial={initial} />);
}

function file(name = 'photo.jpg', type = 'image/jpeg', size = MB): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function pick(label: string, ...files: File[]) {
  fireEvent.change(screen.getByLabelText(label), { target: { files } });
}

const photos = () => (latest.kind === 'image' ? latest.images : []);

beforeEach(() => {
  calls = [];
  uploading = [];
  fakeUpload.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:local');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('MediaFields — photos (D398)', () => {
  it('offers a camera input, a multi-photo library input and a file input', () => {
    renderFields();
    const camera = screen.getByLabelText('Take photo');
    const library = screen.getByLabelText('Choose photos');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(library).not.toHaveAttribute('capture');
    expect(library).toHaveAttribute('multiple');
    expect(library.getAttribute('accept')).toContain('.heic');
    const other = screen.getByLabelText('Choose file');
    expect(other.getAttribute('accept')).toContain('application/pdf');
    expect(other.getAttribute('accept')).toContain('video/*');
  });

  it('refuses a wrong type or an oversized photo before any upload (FR-004)', () => {
    renderFields();
    pick('Choose photos', file('doc.gif', 'image/gif'));
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG, WebP or HEIC');
    pick('Choose photos', file('big.jpg', 'image/jpeg', 9 * MB));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 8 MB');
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it('accepts a HEIC by extension when the browser reports no type', () => {
    renderFields();
    pick('Take photo', file('IMG_0001.HEIC', ''));
    expect(fakeUpload).toHaveBeenCalledTimes(1);
  });

  it('shows progress, then adds the photo; the description is optional', async () => {
    renderFields();
    pick('Choose photos', file());
    expect(screen.getByText('Preparing upload…')).toBeInTheDocument();
    act(() => calls[0]!.options.onProgress?.(40));
    expect(screen.getByText('Uploading… 40%')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload progress')).toHaveAttribute('value', '40');
    await act(async () => calls[0]!.resolve({ publicId: 'gobbit/items/d/p1' }));
    expect(photos()).toEqual([{ publicId: 'gobbit/items/d/p1', alt: '', width: 10, height: 10 }]);
    expect(screen.getByLabelText('Description (optional)')).toHaveAccessibleDescription(
      'Helps people who use a screen reader. Leave empty to use the card title.',
    );
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'A loaf' },
    });
    expect(photos()[0]?.alt).toBe('A loaf');
  });

  it('uploads several photos at once and Save waits for all of them', async () => {
    renderFields();
    pick('Choose photos', file('a.jpg'), file('b.jpg'));
    expect(calls).toHaveLength(2);
    expect(uploading.at(-1)).toBe(true);
    await act(async () => calls[1]!.resolve({ publicId: 'b' }));
    expect(photos().map((p) => p.publicId)).toEqual(['b']);
    expect(uploading.at(-1)).toBe(true);
    await act(async () => calls[0]!.resolve({ publicId: 'a' }));
    expect(photos().map((p) => p.publicId)).toEqual(['b', 'a']);
    expect(uploading.at(-1)).toBe(false);
    expect(screen.getByText('2 of 8 photos')).toBeInTheDocument();
  });

  it('moves and removes photos, each with its own description', () => {
    renderFields({
      kind: 'image',
      images: [
        { publicId: 'a', alt: 'A' },
        { publicId: 'b', alt: 'B' },
        { publicId: 'c', alt: 'C' },
      ],
    });
    expect(screen.getByRole('button', { name: 'Move photo 1 earlier' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 1 later' }));
    expect(photos().map((p) => p.publicId)).toEqual(['b', 'a', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }));
    expect(photos().map((p) => p.publicId)).toEqual(['b', 'c', 'a']);
    fireEvent.change(screen.getByLabelText('Description of photo 2 (optional)'), {
      target: { value: 'Sea' },
    });
    expect(photos()[1]).toEqual({ publicId: 'c', alt: 'Sea' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(photos().map((p) => p.publicId)).toEqual(['c', 'a']);
  });

  it('removing the last photo leaves an empty card that needs a photo', () => {
    renderFields({ kind: 'image', images: [{ publicId: 'a', alt: '' }] });
    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(latest).toEqual(EMPTY);
    expect(screen.getByText('Add a photo')).toBeInTheDocument();
  });

  it('holds at most 8 photos and says how many were left out', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ publicId: `p${i}`, alt: '' }));
    renderFields({ kind: 'image', images: six });
    pick('Add photos', file('1.jpg'), file('2.jpg'), file('3.jpg'), file('4.jpg'));
    expect(calls).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A card holds at most 8 photos; 2 photos were not added.',
    );
    expect(screen.queryByLabelText('Add photos')).not.toBeInTheDocument();
  });

  it('cancelling leaves no photo (FR-005)', async () => {
    renderFields();
    pick('Choose photos', file());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' })));
    expect(calls[0]!.options.signal?.aborted).toBe(true);
    expect(photos()).toEqual(EMPTY.kind === 'image' ? EMPTY.images : []);
    expect(screen.getByText('Add a photo')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
    expect(uploading.at(-1)).toBe(false);
  });

  it('a failed photo stays out of the card and retries with the same file', async () => {
    renderFields();
    const shot = file();
    pick('Choose photos', shot);
    await act(async () =>
      calls[0]!.reject(new UploadError('failed', "The photo couldn't be uploaded.")),
    );
    expect(screen.getByRole('alert')).toHaveTextContent("The photo couldn't be uploaded.");
    expect(uploading.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));
    expect(calls[1]!.file).toBe(shot);
    await act(async () => calls[1]!.resolve({ publicId: 'p2' }));
    expect(photos().map((p) => p.publicId)).toEqual(['p2']);
  });

  it('adds a photo only after the API confirms it (D157)', async () => {
    let finish: () => void = () => {};
    confirm.mockImplementationOnce(
      (_deckId, { publicId }) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              publicId,
              kind: 'image',
              resourceType: 'image',
              durationMs: null,
              pages: null,
              originalFilename: null,
              width: 10,
              height: 10,
              bytes: 1,
              format: 'jpg',
              source: 'editor',
              createdAt: '2026-03-01T00:00:00.000Z',
            });
        }),
    );
    renderFields();
    pick('Choose photos', file());
    await act(async () => calls[0]!.resolve({ publicId: 'gobbit/items/d/p1' }));
    expect(screen.getByText('Saving photo…')).toBeInTheDocument();
    expect(photos()[0]?.publicId).toBe('');
    await act(async () => finish());
    expect(photos()[0]?.publicId).toBe('gobbit/items/d/p1');
  });

  it('a refused confirm offers a retry', async () => {
    const { ApiError } = await import('../../api/api-error');
    confirm.mockRejectedValueOnce(
      new ApiError(422, { type: '/problems/validation', status: 422, title: 'Validation failed' }),
    );
    renderFields();
    pick('Choose photos', file());
    await act(async () => calls[0]!.resolve({ publicId: 'p1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't be verified/);
    expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
  });

  it('adds a pasted photo to the gallery, or refuses it like a picked one', async () => {
    renderFields({ kind: 'image', images: [{ publicId: 'a', alt: '' }] });
    expect(screen.getByText('Or paste a photo.')).toBeInTheDocument();
    act(() => void paste(document.body, [file('doc.gif', 'image/gif')]));
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG, WebP or HEIC');
    const shot = file('image.png', 'image/png');
    act(() => void paste(document.body, [shot]));
    expect(calls[0]!.file).toBe(shot);
    await act(async () => calls[0]!.resolve({ publicId: 'b' }));
    expect(photos().map((p) => p.publicId)).toEqual(['a', 'b']);
  });

  it('disables picking offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderFields();
    expect(screen.getByLabelText('Take photo')).toBeDisabled();
    expect(screen.getByLabelText('Choose file')).toBeDisabled();
    expect(screen.getByText(/back online/)).toBeInTheDocument();
    expect(screen.queryByText('Or paste a photo.')).not.toBeInTheDocument();
    paste(document.body, [file('image.png', 'image/png')]);
    expect(fakeUpload).not.toHaveBeenCalled();
  });
});

describe('MediaFields — one file (D386, D389)', () => {
  it('refuses an oversized file with its kind limit before any upload (FR-008)', () => {
    renderFields();
    pick('Choose file', file('talk.mp4', 'video/mp4', 30 * MB));
    expect(screen.getByRole('alert')).toHaveTextContent('The video must be at most 25 MB.');
    pick('Choose file', file('book.pdf', 'application/pdf', 11 * MB));
    expect(screen.getByRole('alert')).toHaveTextContent('The PDF must be at most 10 MB.');
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it('uploads a PDF and shows what the stored file says', async () => {
    renderFields();
    pick('Choose file', file('minutes.pdf', 'application/pdf'));
    expect(screen.getByText('Preparing upload…')).toBeInTheDocument();
    expect(uploading.at(-1)).toBe(true);
    await act(async () => calls[0]!.resolve({ publicId: 'gobbit/items/d/f1', kind: 'pdf' }));
    expect(latest).toEqual({
      kind: 'pdf',
      publicId: 'gobbit/items/d/f1',
      alt: '',
      width: 10,
      height: 10,
      pages: 3,
      fileName: 'minutes.pdf',
    });
    expect(screen.getByText('PDF · 3 pages')).toBeInTheDocument();
    expect(screen.getByText('minutes.pdf')).toBeInTheDocument();
    expect(uploading.at(-1)).toBe(false);
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Meeting notes' },
    });
    expect(latest).toMatchObject({ kind: 'pdf', alt: 'Meeting notes' });
  });

  it('shows a refused file the server could not read, without a retry (FR-009)', async () => {
    const { ApiError } = await import('../../api/api-error');
    confirm.mockRejectedValueOnce(
      new ApiError(422, {
        status: 422,
        errors: [
          {
            path: 'file',
            message: "This file can't be read (a password-protected or damaged file?)",
          },
        ],
      }),
    );
    renderFields();
    pick('Choose file', file('locked.pdf', 'application/pdf'));
    await act(async () => calls[0]!.resolve({ publicId: 'f1', kind: 'pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent("This file can't be read");
    expect(screen.queryByRole('button', { name: 'Retry upload' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Choose photos')).toBeInTheDocument();
  });

  it('replaces and removes a video, keeping its description', async () => {
    renderFields({ kind: 'video', publicId: 'v1', alt: 'Recital', durationMs: 5000 });
    expect(screen.getByText('Video · 0:05')).toBeInTheDocument();
    pick('Replace file', file('song.m4a', 'audio/mp4'));
    await act(async () => calls[0]!.resolve({ publicId: 'a1', kind: 'audio' }));
    expect(latest).toMatchObject({
      kind: 'audio',
      publicId: 'a1',
      alt: 'Recital',
      durationMs: 65_000,
    });
    expect(screen.getByText('Audio · 1:05')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
    expect(latest).toEqual(EMPTY);
    expect(screen.getByLabelText('Choose photos')).toBeInTheDocument();
  });

  it('cancelling the first file goes back to the empty card', async () => {
    renderFields();
    pick('Choose file', file('clip.mov', 'video/quicktime'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' })));
    expect(latest).toEqual(EMPTY);
    expect(screen.getByLabelText('Choose photos')).toBeInTheDocument();
  });
});
