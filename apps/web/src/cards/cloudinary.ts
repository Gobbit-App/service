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
