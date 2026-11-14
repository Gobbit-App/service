import { useEffect, useRef, type ReactElement } from 'react';
import { IconButton } from '../ui/buttons/IconButton';

/** A shared image, shown from a blob: URL that is revoked when it leaves (CSP allows blob:). */
function Thumbnail({ file }: { file: File }): ReactElement {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={ref} className="share-thumbs__image" alt={file.name || 'Shared image'} />;
}

/** D395: what a shared PDF, audio or video file is called before it has a picture. */
export function fileKindLabel(type: string): string {
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('video/')) return 'Video';
  return 'File';
}

/** A shared PDF, audio or video file: its kind and name (no preview before upload). */
function FileTile({ file }: { file: File }): ReactElement {
  return (
    <span className="share-thumbs__file">
      <strong>{fileKindLabel(file.type)}</strong>
      {file.name && <span className="share-thumbs__name">{file.name}</span>}
    </span>
  );
}

export function ShareThumbnails({
  files,
  onRemove,
}: {
  files: readonly File[];
  onRemove: (index: number) => void;
}): ReactElement | null {
  if (files.length === 0) return null;
  return (
    <ul className="share-thumbs" aria-label="Files">
      {files.map((file, index) => (
        <li key={`${index}-${file.name}`} className="share-thumbs__item">
          {file.type.startsWith('image/') ? <Thumbnail file={file} /> : <FileTile file={file} />}
          <IconButton
            icon="close"
            label={`Remove ${file.name || 'file'}`}
            onClick={() => onRemove(index)}
          />
        </li>
      ))}
    </ul>
  );
}
