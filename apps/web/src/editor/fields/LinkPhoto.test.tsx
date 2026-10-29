import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset, MediaSignResponse } from '@gobbit/shared';
import { renderWithClient } from '../../test/render';
import { UploadError, type signAndUpload, type UploadedImage, type UploadOptions } from '../upload';
import type { LinkPreview } from './LinkFields';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { LinkPhoto, withoutLinkPhoto } = await import('./LinkPhoto');

type UploadCall = {
  options: UploadOptions;
  resolve: (publicId: string) => void;
  reject: (e: unknown) => void;
};

let calls: UploadCall[];
let latest: LinkPreview;

const fakeUpload = vi.fn<typeof signAndUpload>(
  (_file, _signer, options = {}) =>
    new Promise((resolve, reject) => {
      calls.push({
        options,
        resolve: (publicId) =>
          resolve({
            publicId,
            version: 1,
            signature: 's',
            width: 1080,
            height: 1350,
            bytes: 1,
            format: 'jpg',
          }),
        reject,
      });
      options.signal?.addEventListener('abort', () =>
        reject(new UploadError('aborted', 'Upload cancelled')),
      );
    }),
);
const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>();
const confirm = vi.fn<(deckId: string, uploaded: UploadedImage) => Promise<MediaAsset>>(
  async (_deckId, { publicId, width, height, bytes, format }) => ({
    publicId,
    width,
    height,
    bytes,
    format,
    source: 'editor',
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
);

function Harness({ initial }: { initial: LinkPreview }): ReactElement {
  const [preview, setPreview] = useState(initial);
  const onChange = (next: LinkPreview) => {
    latest = next;
    setPreview(next);
  };
  return (
    <LinkPhoto
      url="https://www.instagram.com/p/abc/"
      preview={preview}
      setPreview={onChange}
      setTitleIfEmpty={() => {}}
      deckId="d1"
      disabled={false}
      uploadDeps={{ signer, upload: fakeUpload, confirm }}
    />
  );
}

function renderPhoto(initial: LinkPreview = { title: 'Dan the Plumber' }) {
  latest = initial;
  return renderWithClient(<Harness initial={initial} />);
}

function pick(label: string) {
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

beforeEach(() => {
  calls = [];
  fakeUpload.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:local');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('LinkPhoto (015)', () => {
  it('adds the uploaded photo to the preview with its dimensions, keeping the text', async () => {
    renderPhoto();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
    pick('Add photo');
    await act(async () => calls[0]!.resolve('gobbit/items/d1/p1'));
    expect(latest).toEqual({
      title: 'Dan the Plumber',
      publicId: 'gobbit/items/d1/p1',
      width: 1080,
      height: 1350,
    });
    expect(screen.getByLabelText('Replace photo')).toBeInTheDocument();
  });

  it('cancelling or a failed upload leaves the preview without a photo', async () => {
    renderPhoto();
    pick('Add photo');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' })));
    expect(calls[0]!.options.signal?.aborted).toBe(true);
    pick('Add photo');
    await act(async () =>
      calls[1]!.reject(new UploadError('failed', "The photo couldn't be uploaded.")),
    );
    expect(screen.getByRole('alert')).toHaveTextContent("The photo couldn't be uploaded.");
    expect(latest).toEqual({ title: 'Dan the Plumber' });
  });

  it('"Remove photo" sends publicId null and drops the page image so nothing copies it back', () => {
    renderPhoto({
      title: 'T',
      image: 'https://cdn.test/og.jpg',
      publicId: 'gobbit/links/x',
      width: 10,
      height: 20,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(latest).toEqual({ title: 'T', publicId: null });
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument();
  });

  it('withoutLinkPhoto keeps the text fields', () => {
    expect(withoutLinkPhoto({ title: 'a', description: 'b', image: 'i', publicId: 'p' })).toEqual({
      title: 'a',
      description: 'b',
      publicId: null,
    });
  });
});
