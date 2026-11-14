/**
 * D394: only images from Cloudinary are cached (card pictures, gallery photos, PDF pages, video
 * stills, waveforms). Audio and video go to the network: their range responses don't cache and
 * would evict hundreds of images.
 */
export function isCloudinaryImageRequest({
  url,
  request,
}: {
  url: URL;
  request: Pick<Request, 'destination'>;
}): boolean {
  return url.hostname === 'res.cloudinary.com' && request.destination === 'image';
}
