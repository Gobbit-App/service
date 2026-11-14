import { describe, expect, it } from 'vitest';
import { isCloudinaryImageRequest } from './sw-routes';

const at = (href: string, destination: RequestDestination) => ({
  url: new URL(href),
  request: { destination },
});

describe('isCloudinaryImageRequest (D394)', () => {
  it('caches Cloudinary images, PDF pages and video stills', () => {
    expect(
      isCloudinaryImageRequest(at('https://res.cloudinary.com/c/image/upload/p', 'image')),
    ).toBe(true);
    expect(
      isCloudinaryImageRequest(
        at('https://res.cloudinary.com/c/video/upload/so_auto/v.jpg', 'image'),
      ),
    ).toBe(true);
  });

  it('never caches audio or video streams, or other hosts', () => {
    expect(
      isCloudinaryImageRequest(at('https://res.cloudinary.com/c/video/upload/v.mp4', 'video')),
    ).toBe(false);
    expect(
      isCloudinaryImageRequest(at('https://res.cloudinary.com/c/video/upload/a.mp3', 'audio')),
    ).toBe(false);
    expect(isCloudinaryImageRequest(at('https://example.com/p.png', 'image'))).toBe(false);
  });
});
