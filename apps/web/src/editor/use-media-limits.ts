import { useQuery } from '@tanstack/react-query';
import { MEDIA_MAX_BYTES_DEFAULTS, type MediaMaxBytes } from '@gobbit/shared/media-constants';
import { configQuery } from '../api/queries';

/** FR-008/D393: the upload limit per kind from `/config`; the defaults until it has loaded. */
export function useMediaLimits(): MediaMaxBytes {
  const { data } = useQuery({ ...configQuery(), select: (config) => config.media?.maxBytes });
  return data ?? MEDIA_MAX_BYTES_DEFAULTS;
}
