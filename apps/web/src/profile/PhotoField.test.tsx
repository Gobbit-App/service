import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset } from '@gobbit/shared';
import { MEDIA_IMAGE_MAX_BYTES } from '@gobbit/shared/media-constants';
import { mockConfig } from '../test/api-mock';
import { renderWithClient } from '../test/render';
import { UploadError, type signAndUpload } from '../editor/upload';
import type { ProfilePhoto } from './PhotoField';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { PhotoField } = await import('./PhotoField');

let calls: { resolve: (id: string) => void; reject: (e: unknown) => void }[];
let latest: ProfilePhoto | null;
const fakeUpload = vi.fn<typeof signAndUpload>(
  () =>
    new Promise((resolve, reject) => {
      calls.push({
        resolve: (publicId) =>
          resolve({
            publicId,
            version: 1,
            signature: 's',
            width: 512,
            height: 512,
            bytes: 1,
            format: 'jpg',
            kind: 'image',
            resourceType: 'image',
          }),
        reject,
      });
    }),
);
const confirm = vi.fn(
  async (_d: string, u: { publicId: string; width?: number; height?: number }) =>
    ({ publicId: u.publicId, width: u.width ?? null, height: u.height ?? null }) as MediaAsset,
);

function Harness({ initial }: { initial: ProfilePhoto | null }): ReactElement {
  const [photo, setPhoto] = useState(initial);
  return (
    <PhotoField
      member={{ id: 'u1', initials: 'DA' }}
      photo={photo}
      onChange={(next) => {
        latest = next;
        setPhoto(next);
      }}
      uploadDeps={{ signer: vi.fn(), upload: fakeUpload, confirm }}
    />
  );
}

const picture = (name = 'me.jpg', type = 'image/jpeg') => new File(['x'], name, { type });
const render = (initial: ProfilePhoto | null = null) => {
  latest = initial;
  return renderWithClient(<Harness initial={initial} />);
};
const pick = async (label: string, file = picture()) =>
  fireEvent.change(await screen.findByLabelText(label, undefined, SLOW), {
    target: { files: [file] },
  });
// The cropper is a lazy chunk: under a loaded machine its first import takes longer than the 1 s default.
const SLOW = { timeout: 10_000 };
const crop = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Use photo' }, SLOW));
  await waitFor(() => expect(calls).toHaveLength(1), SLOW);
};

beforeEach(() => {
  calls = [];
  fakeUpload.mockClear();
  mockConfig.cloudinaryCloudName = 'demo';
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600 }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['j'])));
});
afterEach(() => {
  mockConfig.cloudinaryCloudName = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PhotoField (046)', () => {
  it('crops a picked photo, uploads it and hands back the publicId', async () => {
    render();
    await pick('Add photo');
    await crop();
    expect((fakeUpload.mock.calls[0]![0] as File).type).toBe('image/jpeg');
    await act(async () => calls[0]!.resolve('gobbit/profiles/u1/a'));
    expect(latest).toEqual({ publicId: 'gobbit/profiles/u1/a', width: 512, height: 512 });
    expect(screen.getByLabelText('Replace photo')).toBeInTheDocument();
    // Lazy-loads the cropper and runs the async crop: slow when the whole suite loads the machine.
  }, 20_000);

  it('takes a dropped photo', async () => {
    const { container } = render();
    await screen.findByLabelText('Add photo', undefined, SLOW);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { types: ['Files'], files: [picture()] },
    });
    act(() => void container.querySelector('.photo-field')!.dispatchEvent(drop));
    await crop();
    await act(async () => calls[0]!.resolve('dropped'));
    expect(latest?.publicId).toBe('dropped');
  });

  it('replaces an existing photo and removes it', async () => {
    render({ publicId: 'old' });
    await pick('Replace photo');
    await crop();
    await act(async () => calls[0]!.resolve('new'));
    expect(latest?.publicId).toBe('new');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(latest).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('a failed upload keeps the previous photo and says why', async () => {
    render({ publicId: 'old' });
    await pick('Replace photo');
    await crop();
    await act(async () =>
      calls[0]!.reject(new UploadError('failed', "The photo couldn't be uploaded.")),
    );
    expect(screen.getByRole('alert')).toHaveTextContent("The photo couldn't be uploaded.");
    expect(latest).toEqual({ publicId: 'old' });
  });

  it('refuses an over-limit or wrong-type file before cropping', async () => {
    render();
    const big = picture();
    Object.defineProperty(big, 'size', { value: MEDIA_IMAGE_MAX_BYTES + 1 });
    await pick('Add photo', big);
    expect(await screen.findByRole('alert', undefined, SLOW)).toHaveTextContent(/at most/i);
    await pick('Add photo', picture('x.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG/);
    expect(screen.queryByRole('button', { name: 'Use photo' })).not.toBeInTheDocument();
  });

  it('an unreadable photo shows the cropper error and uploads nothing', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    render();
    await pick('Add photo');
    expect(await screen.findByRole('alert', undefined, SLOW)).toHaveTextContent(
      "Couldn't read this photo",
    );
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it('is hidden without Cloudinary', async () => {
    mockConfig.cloudinaryCloudName = null;
    render();
    await screen.findByRole('img', { name: /your avatar/i }, SLOW);
    expect(screen.queryByLabelText('Add photo')).not.toBeInTheDocument();
  });
});
