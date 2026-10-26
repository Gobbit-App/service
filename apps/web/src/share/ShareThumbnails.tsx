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

export function ShareThumbnails({
  files,
  onRemove,
}: {
  files: readonly File[];
  onRemove: (index: number) => void;
}): ReactElement | null {
  if (files.length === 0) return null;
  return (
    <ul className="share-thumbs" aria-label="Images">
      {files.map((file, index) => (
        <li key={`${index}-${file.name}`} className="share-thumbs__item">
          <Thumbnail file={file} />
          <IconButton
            icon="close"
            label={`Remove ${file.name || 'image'}`}
            onClick={() => onRemove(index)}
          />
        </li>
      ))}
    </ul>
  );
}
