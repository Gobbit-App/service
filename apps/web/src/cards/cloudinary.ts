import {
  MEDIA_DELIVERY,
  mediaDeliveryUrl,
  type MediaRendition,
} from '@gobbit/shared/media-constants';

/** Image widths for responsive Cloudinary images. */
export const IMAGE_WIDTHS = [360, 720, 1080] as const;

/**
 * Generates a Cloudinary image URL with auto format and quality optimization.
 */
export function cloudinaryImageUrl(cloudName: string, publicId: string, width: number): string {
  return deliveryUrl(cloudName, publicId, `f_auto,q_auto,c_limit,w_${width}`);
}

/** Width of the blurred placeholder variant (D161): a few hundred bytes. */
export const PLACEHOLDER_WIDTH = 32;

/** A tiny blurred variant shown while the sharp image loads (D161). */
export function cloudinaryPlaceholderUrl(cloudName: string, publicId: string): string {
  return deliveryUrl(cloudName, publicId, `f_auto,q_1,e_blur:2000,w_${PLACEHOLDER_WIDTH}`);
}

function deliveryUrl(cloudName: string, publicId: string, transformation: string): string {
  const encodedCloudName = encodeURIComponent(cloudName);
  const encodedPath = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${encodedCloudName}/image/upload/${transformation}/${encodedPath}`;
}

/** 045: one rendition of a stored file at a width (a video still, a PDF page, a gallery photo). */
export type RenditionAt = (width: number) => MediaRendition;

/** The `srcset` of a rendition over the given widths (D161 sizing for stills and pages). */
export function renditionSrcSet(
  cloudName: string,
  publicId: string,
  at: RenditionAt,
  widths: readonly number[] = IMAGE_WIDTHS,
): string {
  return widths.map((w) => `${mediaDeliveryUrl(cloudName, at(w), publicId)} ${w}w`).join(', ');
}

/** Full URL of one rendition (a re-export, so cards import builders from one place). */
export const mediaDeliveryUrlFor = mediaDeliveryUrl;

/** D392: delivery URLs for audio and video always use a signed eager rendition. */
export const mediaUrls = {
  videoStream: (cloudName: string, publicId: string) =>
    mediaDeliveryUrl(cloudName, MEDIA_DELIVERY.videoStream, publicId),
  audioStream: (cloudName: string, publicId: string) =>
    mediaDeliveryUrl(cloudName, MEDIA_DELIVERY.audioStream, publicId),
  waveform: (cloudName: string, publicId: string) =>
    mediaDeliveryUrl(cloudName, MEDIA_DELIVERY.audioWaveform, publicId),
  pdfOriginal: (cloudName: string, publicId: string) =>
    mediaDeliveryUrl(cloudName, MEDIA_DELIVERY.pdfOriginal, publicId),
};

/**
 * Generates a Cloudinary srcset string for responsive images.
 */
export function cloudinarySrcSet(
  cloudName: string,
  publicId: string,
  widths: readonly number[] = IMAGE_WIDTHS,
): string {
  return widths
    .map((width) => {
      const url = cloudinaryImageUrl(cloudName, publicId, width);
      return `${url} ${width}w`;
    })
    .join(', ');
}
