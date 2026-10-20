import type { ReactElement } from 'react';
import { ImageCard } from '../../cards/ImageCard';
import { useCloudName } from '../../cards/use-cloud-name';
import type { FieldsProps } from './types';

/** 007: image payloads are read-only; 008 replaces this with `ImageFields`. */
export function ReadOnlyImage({ payload }: FieldsProps<'image'>): ReactElement {
  const cloudName = useCloudName();
  return (
    <div className="editor__fields">
      <ImageCard payload={payload} cloudName={cloudName} />
      <p className="muted">The image itself can't be changed here yet.</p>
    </div>
  );
}
