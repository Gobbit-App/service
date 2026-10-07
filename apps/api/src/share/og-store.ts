import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryDeliveryUrl, parseCloudinaryUrl } from '../lib/cloudinary-url';

/** Where generated OG images live (D60); Cloudinary in production, memory in tests. */
export interface OgImageStore {
  upload(publicId: string, png: Uint8Array): Promise<void>;
  /** Absolute URL a crawler can fetch for `publicId` with an optional transformation. */
  deliveryUrl(publicId: string, transformation?: string): string;
}

/** Cloudinary-backed store; credentials come from CLOUDINARY_URL and never leave the server. */
export function createCloudinaryOgStore(cloudinaryUrl: string): OgImageStore {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryUrl(cloudinaryUrl);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return {
    async upload(publicId, png) {
      const dataUri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
      await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        resource_type: 'image',
        overwrite: true,
      });
    },
    deliveryUrl: (publicId, transformation = '') =>
      cloudinaryDeliveryUrl(cloudName, publicId, transformation),
  };
}

/** In-memory store for tests: records uploads, serves deterministic URLs. */
export class MemoryOgStore implements OgImageStore {
  readonly uploads = new Map<string, Uint8Array>();

  constructor(private readonly cloudName = 'test-cloud') {}

  async upload(publicId: string, png: Uint8Array): Promise<void> {
    this.uploads.set(publicId, png);
  }

  deliveryUrl(publicId: string, transformation = ''): string {
    return cloudinaryDeliveryUrl(this.cloudName, publicId, transformation);
  }
}
