/** Image widths for responsive Cloudinary images. */
export const IMAGE_WIDTHS = [360, 720, 1080] as const;

/**
 * Generates a Cloudinary image URL with auto format and quality optimization.
 */
export function cloudinaryImageUrl(cloudName: string, publicId: string, width: number): string {
  const encodedCloudName = encodeURIComponent(cloudName);
  const pathSegments = publicId.split('/').map(encodeURIComponent);
  const encodedPath = pathSegments.join('/');
  return `https://res.cloudinary.com/${encodedCloudName}/image/upload/f_auto,q_auto,c_limit,w_${width}/${encodedPath}`;
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
