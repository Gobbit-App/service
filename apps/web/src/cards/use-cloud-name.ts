import { useQuery } from '@tanstack/react-query';
import { configQuery } from '../api/queries';

/** D55: Cloudinary cloud name from `/config`; null until loaded or when images are off. */
export function useCloudName(): string | null {
  const { data } = useQuery({ ...configQuery(), select: (config) => config.cloudinaryCloudName });
  return data ?? null;
}
