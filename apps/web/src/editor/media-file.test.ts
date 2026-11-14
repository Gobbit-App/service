import { describe, expect, it } from 'vitest';
import { MEDIA_MAX_BYTES_DEFAULTS } from '@gobbit/shared/media-constants';
import { checkMediaFile, FILE_ACCEPT, kindOfFile } from './media-file';

const MB = 1024 * 1024;
const f = (name: string, type: string, size = MB) => ({ name, type, size });

describe('kindOfFile (D389)', () => {
  it('reads the kind from the type, else the extension', () => {
    expect(kindOfFile(f('a.pdf', 'application/pdf'))).toBe('pdf');
    expect(kindOfFile(f('memo.m4a', 'audio/x-m4a'))).toBe('audio');
    expect(kindOfFile(f('clip.mov', 'video/quicktime'))).toBe('video');
    expect(kindOfFile(f('IMG.HEIC', ''))).toBe('image');
    expect(kindOfFile(f('photo.jpeg', ''))).toBe('image');
    expect(kindOfFile(f('x.gif', 'image/gif'))).toBeNull();
    expect(kindOfFile(f('notes.zip', 'application/zip'))).toBeNull();
  });
});

describe('checkMediaFile (FR-008)', () => {
  it('applies each kind its own limit, from /config when given', () => {
    expect(checkMediaFile(f('a.pdf', 'application/pdf', 10 * MB))).toBeNull();
    expect(checkMediaFile(f('a.pdf', 'application/pdf', 11 * MB))).toBe(
      'The PDF must be at most 10 MB.',
    );
    expect(checkMediaFile(f('v.mp4', 'video/mp4', 26 * MB))).toMatch(
      /^The video must be at most 25 MB\. Choose a shorter clip/,
    );
    const limits = { ...MEDIA_MAX_BYTES_DEFAULTS, audio: 1.5 * MB };
    expect(checkMediaFile(f('a.mp3', 'audio/mpeg', 2 * MB), limits)).toBe(
      'The audio file must be at most 1.5 MB.',
    );
    expect(checkMediaFile(f('big.jpg', 'image/jpeg', 9 * MB))).toBe(
      'The photo must be at most 8 MB.',
    );
  });

  it('refuses kinds no card takes', () => {
    expect(checkMediaFile(f('x.gif', 'image/gif'))).toMatch(/Choose a photo, a PDF/);
    expect(checkMediaFile(f('notes.zip', 'application/zip'))).toMatch(/Choose a photo, a PDF/);
  });

  it('the file picker offers PDF, audio and video (with extensions for iOS)', () => {
    expect(FILE_ACCEPT).toContain('application/pdf');
    expect(FILE_ACCEPT).toContain('audio/*');
    expect(FILE_ACCEPT).toContain('.m4a');
  });
});
