import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { mediaUrls } from '../cloudinary';
import type { PlayerProps } from './VideoPlayer';

/**
 * D392/D400 (lazy chunk): an audio clip with the browser's own controls, started inside the
 * tap; the sound visual stays on the facade above it. Unmounting stops it and frees the buffer.
 */
export function AudioPlayer({ cloudName, publicId, label }: PlayerProps): ReactElement {
  const ref = useRef<HTMLAudioElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useLayoutEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.play()?.catch(() => undefined);
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return (
    <div className="media-player media-player--audio">
      <audio
        ref={ref}
        className="media-player__audio"
        src={mediaUrls.audioStream(cloudName, publicId)}
        controls
        preload="none"
        aria-label={label}
        onError={() =>
          setProblem(
            navigator.onLine
              ? 'Still processing. Try again shortly.'
              : 'Playing needs a connection.',
          )
        }
      />
      {problem && (
        <p className="card-muted" role="status">
          {problem}
        </p>
      )}
    </div>
  );
}
