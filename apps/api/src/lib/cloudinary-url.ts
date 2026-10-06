/** Cloudinary API credentials parsed from URL. */
export type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/** Parse CLOUDINARY_URL environment variable. */
export function parseCloudinaryUrl(url: string): CloudinaryCredentials {
  if (!URL.canParse(url)) {
    throw new Error('Invalid CLOUDINARY_URL');
  }

  const parsed = new URL(url);
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);
  const cloudName = parsed.hostname;

  if (parsed.protocol !== 'cloudinary:' || !apiKey || !apiSecret || !cloudName) {
    throw new Error('Invalid CLOUDINARY_URL');
  }

  return { cloudName, apiKey, apiSecret };
}

/** Extract cloud name from CLOUDINARY_URL or return null. */
export function cloudNameFrom(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const creds = parseCloudinaryUrl(url);
    return creds.cloudName;
  } catch {
    return null;
  }
}

/** Build Cloudinary delivery URL. */
export function cloudinaryDeliveryUrl(
  cloudName: string,
  publicId: string,
  transformation: string,
): string {
  const encodedSegments = publicId.split('/').map((segment) => encodeURIComponent(segment));
  const encodedPublicId = encodedSegments.join('/');

  if (transformation) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${encodedPublicId}`;
  }
  return `https://res.cloudinary.com/${cloudName}/image/upload/${encodedPublicId}`;
}
