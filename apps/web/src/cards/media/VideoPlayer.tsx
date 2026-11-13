import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { mediaUrls } from '../cloudinary';

export interface PlayerProps {
  cloudName: string;
  publicId: string;
  /** The card's description, else its title: the player's accessible name (FR-018). */
  label: string;
  /** Payload size, so a portrait video keeps its shape (US3.5). */
  width?: number;
  height?: number;
  /** The facade's still, shown until the first frame. */
  poster?: string;
}

/**
 * D392/D400 (lazy chunk): a video plays only once tapped. `play()` runs in a layout effect,
 * inside the tap's task, so phones allow sound. Unmounting (another player starts, Browse
 * moves on, the deck closes) pauses it and releases the buffer.
 */
export function VideoPlayer({
  cloudName,
  publicId,
  label,
  width,
  height,
  poster,
}: PlayerProps): ReactElement {
  const ref = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useLayoutEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.play()?.catch(() => undefined);
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return (
    <figure className="media-player media-player--video">
      <video
        ref={ref}
        className="media-player__video"
        src={mediaUrls.videoStream(cloudName, publicId)}
        poster={poster}
        controls
        playsInline
        preload="none"
        width={width}
        height={height}
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
    </figure>
  );
}
