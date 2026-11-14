import type { MediaKind } from '@gobbit/shared';
import { sniffImage } from '../fetch/image-sniff';

/** What a shared file's first bytes prove it is (D395): its kind and stored format. */
export interface SniffedFile {
  kind: MediaKind;
  /** A format of `MEDIA_FORMATS[kind]` (D389). */
  format: string;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

const IMAGE_FORMAT = { jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic' } as const;

/** ISO base media (`ftyp`) brands of audio-only files (iOS voice memos, Android recorders). */
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ']);
/** QuickTime brand: iPhone camera recordings (HEVC/H.264 in `.mov`). */
const QUICKTIME_BRAND = 'qt  ';
const THREE_GP = /^3g[p2]/;

/**
 * D395: the kind and format a shared file's bytes prove, or null for anything else (an
 * executable renamed `.pdf` fails here). The declared type only breaks ties a container can't
 * (an MP4, WebM or Ogg file may hold sound only), never decides alone.
 */
export function sniffMediaFile(bytes: Uint8Array, declaredMime: string): SniffedFile | null {
  const image = sniffImage(bytes);
  if (image) return { kind: 'image', format: IMAGE_FORMAT[image] };

  const declaredAudio = declaredMime.toLowerCase().startsWith('audio/');
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return { kind: 'pdf', format: 'pdf' };

  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (AUDIO_BRANDS.has(brand)) return { kind: 'audio', format: 'm4a' };
    if (brand === QUICKTIME_BRAND) return { kind: 'video', format: 'mov' };
    if (THREE_GP.test(brand)) return { kind: 'video', format: '3gp' };
    if (brand === 'M4V ' || brand === 'M4VH' || brand === 'M4VP')
      return { kind: 'video', format: 'm4v' };
    return declaredAudio ? { kind: 'audio', format: 'm4a' } : { kind: 'video', format: 'mp4' };
  }
  // EBML header: WebM (Android screen and camera recordings, browser recorders).
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { kind: declaredAudio ? 'audio' : 'video', format: 'webm' };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') {
    // Opus voice notes say so in the first page; anything else in Ogg is Vorbis audio here.
    const head = ascii(bytes, 28, 36);
    return { kind: 'audio', format: head.startsWith('OpusHead') ? 'opus' : 'ogg' };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') {
    return { kind: 'audio', format: 'wav' };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return { kind: 'audio', format: 'flac' };
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '#!AMR') return { kind: 'audio', format: 'amr' };
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return { kind: 'audio', format: 'mp3' };
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0) {
    // ADTS AAC (layer bits 00).
    return { kind: 'audio', format: 'aac' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    // MPEG audio frame sync (MP3 without an ID3 tag).
    return { kind: 'audio', format: 'mp3' };
  }
  return null;
}
