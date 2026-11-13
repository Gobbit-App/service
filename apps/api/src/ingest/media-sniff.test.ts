import { describe, expect, it } from 'vitest';
import { kindForFormat } from '@gobbit/shared';
import { sniffMediaFile } from './media-sniff';

const bytes = (head: number[] | string, size = 48): Uint8Array => {
  const out = new Uint8Array(size);
  out.set(typeof head === 'string' ? [...head].map((c) => c.charCodeAt(0)) : head);
  return out;
};
const ftyp = (brand: string) => bytes(`\0\0\0\x20ftyp${brand}`);

describe('sniffMediaFile (D395)', () => {
  it.each([
    ['PDF', bytes('%PDF-1.4'), '', { kind: 'pdf', format: 'pdf' }],
    ['iOS voice memo', ftyp('M4A '), 'audio/x-m4a', { kind: 'audio', format: 'm4a' }],
    ['iPhone video', ftyp('qt  '), 'video/quicktime', { kind: 'video', format: 'mov' }],
    ['Android video', ftyp('isom'), 'video/mp4', { kind: 'video', format: 'mp4' }],
    ['MP4 that says audio', ftyp('isom'), 'audio/mp4', { kind: 'audio', format: 'm4a' }],
    ['3GP recording', ftyp('3gp5'), '', { kind: 'video', format: '3gp' }],
    [
      'WebM video',
      bytes([0x1a, 0x45, 0xdf, 0xa3]),
      'video/webm',
      { kind: 'video', format: 'webm' },
    ],
    [
      'WebM audio',
      bytes([0x1a, 0x45, 0xdf, 0xa3]),
      'audio/webm',
      { kind: 'audio', format: 'webm' },
    ],
    ['MP3 with ID3', bytes('ID3\x04'), 'audio/mpeg', { kind: 'audio', format: 'mp3' }],
    ['WAV', bytes('RIFF\0\0\0\0WAVE'), '', { kind: 'audio', format: 'wav' }],
    ['AMR', bytes('#!AMR\n'), '', { kind: 'audio', format: 'amr' }],
    ['FLAC', bytes('fLaC'), '', { kind: 'audio', format: 'flac' }],
    [
      'PNG',
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
      { kind: 'image', format: 'png' },
    ],
  ])('%s', (_label, data, mime, expected) => {
    expect(sniffMediaFile(data, mime)).toEqual(expected);
  });

  it('refuses a disguised or unknown file whatever its declared type', () => {
    expect(sniffMediaFile(bytes('MZ\x90\0'), 'application/pdf')).toBeNull();
    expect(sniffMediaFile(bytes('PK\x03\x04'), 'video/mp4')).toBeNull();
    expect(sniffMediaFile(new Uint8Array(0), 'audio/mpeg')).toBeNull();
  });

  it('only ever names a format its kind allows (D389)', () => {
    for (const [head, mime] of [
      [ftyp('M4A '), 'audio/mp4'],
      [ftyp('qt  '), 'video/quicktime'],
      [ftyp('isom'), 'video/mp4'],
      [bytes('OggS'), 'audio/ogg'],
    ] as const) {
      const sniffed = sniffMediaFile(head, mime)!;
      expect([sniffed.kind, 'video']).toContain(kindForFormat(sniffed.format));
    }
  });
});
