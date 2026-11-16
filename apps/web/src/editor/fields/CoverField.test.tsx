import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset, MediaSignResponse } from '@gobbit/shared';
import type { CardCover } from '@gobbit/shared/card-cover';
import { paste } from '../../test/paste';
import { renderWithClient } from '../../test/render';
import { UploadError, type signAndUpload, type UploadedImage } from '../upload';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { CoverField } = await import('./CoverField');

type Call = { resolve: (publicId: string) => void; reject: (e: unknown) => void };
let calls: Call[];
let latest: CardCover | null | undefined;

const fakeUpload = vi.fn<typeof signAndUpload>(
  () =>
    new Promise((resolve, reject) => {
      calls.push({
        resolve: (publicId) =>
          resolve({
            publicId,
            version: 1,
            signature: 's',
            width: 1600,
            height: 900,
            bytes: 1,
            format: 'jpg',
            kind: 'image',
            resourceType: 'image',
          }),
        reject,
      });
    }),
);
const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>();
const confirm = vi.fn<(deckId: string, uploaded: UploadedImage) => Promise<MediaAsset>>(
  async (_deckId, { publicId, width, height, bytes, format }) => ({
    publicId,
    kind: 'image',
    resourceType: 'image',
    width: width ?? null,
    height: height ?? null,
    durationMs: null,
    pages: null,
    originalFilename: null,
    bytes,
    format,
    source: 'editor',
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
);

function Harness({ initial }: { initial: CardCover | null }): ReactElement {
  const [cover, setCover] = useState<CardCover | null>(initial);
  return (
    <CoverField
      deckId="d1"
      cover={cover}
      onChange={(next) => {
        latest = next;
        setCover(next);
      }}
      uploadDeps={{ signer, upload: fakeUpload, confirm }}
    />
  );
}

const image = () => new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
const render = (initial: CardCover | null = null) => {
  latest = initial;
  return renderWithClient(<Harness initial={initial} />);
};
const pick = (label: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [image()] } });

beforeEach(() => {
  calls = [];
  fakeUpload.mockClear();
});

describe('CoverField (D412)', () => {
  it('adds a picked image as the cover with its dimensions', async () => {
    render();
    expect(screen.queryByRole('button', { name: 'Remove cover image' })).not.toBeInTheDocument();
    pick('Add cover image');
    await act(async () => calls[0]!.resolve('gobbit/items/d1/c1'));
    expect(latest).toEqual({ publicId: 'gobbit/items/d1/c1', width: 1600, height: 900 });
    expect(screen.getByLabelText('Replace cover image')).toBeInTheDocument();
  });

  it('replaces an existing cover', async () => {
    render({ publicId: 'old', width: 10, height: 10 });
    pick('Replace cover image');
    await act(async () => calls[0]!.resolve('new'));
    expect(latest?.publicId).toBe('new');
  });

  it('removes the cover', () => {
    render({ publicId: 'old', width: 10, height: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove cover image' }));
    expect(latest).toBeNull();
    expect(screen.getByLabelText('Add cover image')).toBeInTheDocument();
  });

  it('a failed upload shows the error and keeps the previous cover', async () => {
    const previous = { publicId: 'old', width: 10, height: 10 };
    render(previous);
    pick('Replace cover image');
    await act(async () => calls[0]!.reject(new UploadError('failed', "The image didn't upload.")));
    expect(screen.getByRole('alert')).toHaveTextContent("The image didn't upload.");
    expect(latest).toEqual(previous);
  });

  it('takes an image dropped on the field', async () => {
    const { container } = render();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [image()] } });
    act(() => void container.querySelector('.cover-field')!.dispatchEvent(drop));
    await act(async () => calls[0]!.resolve('dropped'));
    expect(latest?.publicId).toBe('dropped');
  });

  it('takes a paste with focus in the field, and ignores one elsewhere', async () => {
    render();
    act(() => void paste(document.body, [image()]));
    expect(calls).toHaveLength(0);
    const input = screen.getByLabelText('Add cover image');
    act(() => void paste(input, [image()]));
    await act(async () => calls[0]!.resolve('pasted'));
    expect(latest?.publicId).toBe('pasted');
  });
});
