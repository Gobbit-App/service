import { describe, expect, it } from 'vitest';
import { sniffImage } from './image-sniff';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('sniffImage', () => {
  it('recognises JPEG, PNG, WebP and HEIC by their magic bytes', () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImage(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp');
    expect(sniffImage(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBe('heic');
    expect(sniffImage(bytes([0, 0, 0, 0x18], 'ftypmif1'))).toBe('heic');
  });

  it('rejects HTML, GIF, MP4 and short input', () => {
    expect(sniffImage(bytes('<!doctype html>'))).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(bytes([0, 0, 0, 0x18], 'ftypisom'))).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
