import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset } from '@gobbit/shared';
import type { CardCover } from '@gobbit/shared/card-cover';
import { paste } from '../../test/paste';
import { renderWithClient } from '../../test/render';
import { UploadError, type signAndUpload, type UploadedImage, type UploadOptions } from '../upload';

vi.mock('../../cards/use-cloud-name', () => ({ useCloudName: () => 'demo' }));
vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { CoverField } = await import('./CoverField');

type UploadCall = {
  options: UploadOptions;
  resolve: (publicId: string) => void;
  reject: (e: unknown) => void;
};

let calls: UploadCall[];
let latest: CardCover | null;

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
            width: 1200,
            height: 300,
            bytes: 1,
            format: 'jpg',
          }),
        reject,
      });
    }),
);
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

function Harness({
  initial,
  scoped = false,
}: {
  initial: CardCover | null;
  scoped?: boolean;
}): ReactElement {
  const [cover, setCover] = useState(initial);
  return (
    <div>
      <button type="button">elsewhere</button>
      <CoverField
        cover={cover}
        onChange={(next) => {
          latest = next;
          setCover(next);
        }}
        deckId="d1"
        disabled={false}
        scoped={scoped}
        uploadDeps={{ signer: vi.fn(), upload: fakeUpload, confirm }}
      />
    </div>
  );
}

function renderField(initial: CardCover | null = null, scoped = false) {
  latest = initial;
  return renderWithClient(<Harness initial={initial} scoped={scoped} />);
}

const png = () => new File(['x'], 'image.png', { type: 'image/png' });

function pick(label: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [png()] } });
}

const existing: CardCover = { publicId: 'gobbit/items/d1/old', width: 800, height: 200 };

beforeEach(() => {
  calls = [];
  fakeUpload.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:local');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('CoverField (044)', () => {
  it('offers Add image only when there is no cover', () => {
    renderField();
    expect(screen.getByLabelText('Add image')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument();
  });

  it('previews a set cover and offers Replace and Remove', () => {
    const { container } = renderField(existing);
    expect(container.querySelector('.card__cover')).toBeInTheDocument();
    expect(screen.getByLabelText('Replace image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument();
  });

  it('sets the cover to the recorded asset after a successful upload', async () => {
    renderField();
    pick('Add image');
    expect(latest).toBeNull();
    await act(async () => calls[0]!.resolve('gobbit/items/d1/new'));
    expect(latest).toEqual({ publicId: 'gobbit/items/d1/new', width: 1200, height: 300 });
  });

  it('a failed upload shows the error and keeps the previous cover', async () => {
    renderField(existing);
    pick('Replace image');
    await act(async () =>
      calls[0]!.reject(new UploadError('failed', "The photo couldn't be uploaded.")),
    );
    expect(screen.getByRole('alert')).toHaveTextContent("The photo couldn't be uploaded.");
    expect(latest).toEqual(existing);
  });

  it('Remove sets the cover to null', () => {
    renderField(existing);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(latest).toBeNull();
    expect(screen.getByLabelText('Add image')).toBeInTheDocument();
  });

  it('a dropped image takes the same path as a picked one', async () => {
    const { container } = renderField();
    const field = container.querySelector('.cover-field')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [png()], types: ['Files'] } });
    act(() => void field.dispatchEvent(drop));
    await act(async () => calls[0]!.resolve('gobbit/items/d1/dropped'));
    expect(latest?.publicId).toBe('gobbit/items/d1/dropped');
  });

  it('a pasted image is taken page-wide by default', async () => {
    renderField();
    act(() => void paste(document.body, [png()]));
    await act(async () => calls[0]!.resolve('gobbit/items/d1/pasted'));
    expect(latest?.publicId).toBe('gobbit/items/d1/pasted');
  });

  it('when scoped, only pastes inside the field are taken', async () => {
    renderField(null, true);
    act(() => void paste(screen.getByRole('button', { name: 'elsewhere' }), [png()]));
    expect(calls).toHaveLength(0);
    act(() => void paste(screen.getByLabelText('Add image'), [png()]));
    await act(async () => calls[0]!.resolve('gobbit/items/d1/in'));
    expect(latest?.publicId).toBe('gobbit/items/d1/in');
  });
});
