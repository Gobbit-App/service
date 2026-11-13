import { describe, expect, it } from 'vitest';
import { mediaKinds } from '../enums';
import {
  MEDIA_DELIVERY,
  MEDIA_FORMATS,
  MEDIA_IMAGE_WIDTHS,
  kindForFormat,
  mediaDeliveryPath,
  mediaDeliveryUrl,
  mediaEagerParam,
  mediaEagerRenditions,
  resourceTypeForKind,
} from './constants';

describe('media formats (D389, D390)', () => {
  it('keeps the per-kind format lists disjoint', () => {
    const all = Object.values(MEDIA_FORMATS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('derives every listed format back to its own kind', () => {
    for (const kind of mediaKinds) {
      for (const format of MEDIA_FORMATS[kind]) expect(kindForFormat(format)).toBe(kind);
    }
  });

  it('reads provider spellings and refuses unknown formats', () => {
    expect(kindForFormat('JPEG')).toBe('image');
    expect(kindForFormat(' MOV ')).toBe('video');
    expect(kindForFormat('exe')).toBeNull();
    expect(kindForFormat('')).toBeNull();
  });

  it('stores PDFs as images and audio as video (D388)', () => {
    expect(resourceTypeForKind('image')).toBe('image');
    expect(resourceTypeForKind('pdf')).toBe('image');
    expect(resourceTypeForKind('audio')).toBe('video');
    expect(resourceTypeForKind('video')).toBe('video');
  });
});

describe('delivery and eager renditions (D392)', () => {
  it('signs the video stream and every still width, and the audio stream and waveform', () => {
    expect(mediaEagerRenditions('video')).toEqual([
      MEDIA_DELIVERY.videoStream,
      ...MEDIA_IMAGE_WIDTHS.map((w) => MEDIA_DELIVERY.videoStill(w)),
    ]);
    expect(mediaEagerRenditions('audio')).toEqual([
      MEDIA_DELIVERY.audioStream,
      MEDIA_DELIVERY.audioWaveform,
    ]);
    expect(mediaEagerRenditions('image')).toEqual([]);
    expect(mediaEagerRenditions('pdf')).toEqual([]);
  });

  it('formats the eager parameter as transformation/ext pairs', () => {
    expect(mediaEagerParam('audio')).toBe(
      'q_auto/mp3|fl_waveform,co_white,b_transparent,w_720,h_96/png',
    );
    expect(mediaEagerParam('video')?.split('|')[0]).toBe(
      'c_limit,w_1280,h_1280,q_auto,vc_auto/mp4',
    );
    expect(mediaEagerParam('pdf')).toBeNull();
  });

  it('builds delivery paths per resource type with encoded ids', () => {
    expect(mediaDeliveryPath(MEDIA_DELIVERY.audioStream, 'gobbit/items/d1/a b')).toBe(
      'video/upload/q_auto/gobbit/items/d1/a%20b.mp3',
    );
    expect(mediaDeliveryPath(MEDIA_DELIVERY.pdfOriginal, 'f')).toBe('image/upload/f.pdf');
    expect(mediaDeliveryPath(MEDIA_DELIVERY.pdfPage(2, 720), 'f')).toBe(
      'image/upload/pg_2,f_auto,q_auto,c_limit,w_720/f',
    );
    expect(mediaDeliveryUrl('demo', MEDIA_DELIVERY.image(360), 'p')).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_360/p',
    );
  });
});
