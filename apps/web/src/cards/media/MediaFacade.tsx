import { useRef, useState, type ReactElement } from 'react';
import { MEDIA_DELIVERY } from '@gobbit/shared/media-constants';
import { Button } from '../../ui/buttons/Button';
import { CloudImage } from '../CloudImage';
import { mediaDeliveryUrlFor, mediaUrls } from '../cloudinary';
import type { MediaFilePayload } from '../payload-guards';
import { formatDuration, pageCount } from './format';
import { loadedMediaModule, useMediaModule, type MediaModuleName } from './load-media-module';
import { MediaUnavailable } from './MediaUnavailable';
import { useActiveMedia } from './use-active-media';
import { useIntentPrefetch } from './use-intent-prefetch';

export interface MediaFacadeProps {
  itemId: string;
  title: string;
  payload: MediaFilePayload;
  cloudName: string | null;
  /** Browse's current card loads its picture first (D144). */
  priority?: boolean;
}

const MODULE: Record<MediaFilePayload['kind'], MediaModuleName> = {
  pdf: 'viewer',
  video: 'video',
  audio: 'audio',
};

/**
 * D400: a PDF, video or audio card in a list costs one picture: drawn from the payload alone
 * (page 1, the still, or the sound visual) with its badge and one action. The player or viewer
 * chunk is fetched on intent or idle; the media element exists only after a tap, and only one
 * plays at a time (FR-016).
 */
export function MediaFacade({
  itemId,
  title,
  payload,
  cloudName,
  priority = false,
}: MediaFacadeProps): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const name = MODULE[payload.kind];
  const intent = useIntentPrefetch(name, root);
  const { isActive, activate, release } = useActiveMedia(itemId);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [offline, setOffline] = useState(false);
  const { state, retry } = useMediaModule(name, wanted || isActive || viewerOpen);

  if (!cloudName) return <MediaUnavailable />;
  const label = payload.alt?.trim() || title;
  const sized = payload.width && payload.height;

  const open = () => {
    if (!navigator.onLine && !loadedMediaModule(name)) {
      setOffline(true);
      return;
    }
    setOffline(false);
    setWanted(true);
    if (payload.kind === 'pdf') setViewerOpen(true);
    else activate();
  };

  const playing = isActive && state.status === 'ready' && payload.kind !== 'pdf';
  const badge =
    payload.kind === 'pdf'
      ? `PDF${payload.pages ? ` · ${pageCount(payload.pages)}` : ''}`
      : payload.durationMs
        ? formatDuration(payload.durationMs)
        : payload.kind === 'video'
          ? 'Video'
          : 'Audio';

  let picture: ReactElement;
  if (payload.kind === 'audio') {
    const wave = mediaUrls.waveform(cloudName, payload.publicId);
    picture = (
      <span
        className="media-facade__wave"
        aria-hidden="true"
        style={{ maskImage: `url("${wave}")`, WebkitMaskImage: `url("${wave}")` }}
      />
    );
  } else if (!playing) {
    picture = (
      <CloudImage
        cloudName={cloudName}
        publicId={payload.publicId}
        alt={label}
        width={sized ? payload.width : undefined}
        height={sized ? payload.height : undefined}
        priority={priority}
        rendition={
          payload.kind === 'video'
            ? MEDIA_DELIVERY.videoStill
            : (width) => MEDIA_DELIVERY.pdfPage(1, width)
        }
      />
    );
  } else {
    picture = <></>;
  }

  const Viewer =
    state.status === 'ready' && 'PageViewer' in state.module ? state.module.PageViewer : null;
  const Video =
    state.status === 'ready' && 'VideoPlayer' in state.module ? state.module.VideoPlayer : null;
  const Audio =
    state.status === 'ready' && 'AudioPlayer' in state.module ? state.module.AudioPlayer : null;

  return (
    <div ref={root} className={`media-facade media-facade--${payload.kind}`} {...intent}>
      {picture}
      {playing && Video && (
        <Video
          cloudName={cloudName}
          publicId={payload.publicId}
          label={label}
          width={sized ? payload.width : undefined}
          height={sized ? payload.height : undefined}
          poster={mediaDeliveryUrlFor(cloudName, MEDIA_DELIVERY.videoStill(1080), payload.publicId)}
        />
      )}
      {playing && Audio && (
        <Audio cloudName={cloudName} publicId={payload.publicId} label={label} />
      )}
      <div className="media-facade__bar">
        <span className="media-facade__badge">{badge}</span>
        {!playing && (
          <Button
            icon={payload.kind === 'pdf' ? 'file' : 'play'}
            label={payload.kind === 'pdf' ? 'Read' : 'Play'}
            variant="ghost"
            onClick={open}
          />
        )}
        {playing && <Button icon="close" label="Stop" variant="ghost" onClick={release} />}
      </div>
      {offline && (
        <p className="card-muted" role="status">
          {payload.kind === 'pdf' ? 'Reading needs a connection.' : 'Playing needs a connection.'}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="card-muted" role="status">
          Couldn&apos;t open.{' '}
          <Button icon="refresh" label="Retry" variant="ghost" onClick={retry} />
        </p>
      )}
      {viewerOpen && Viewer && payload.pages && (
        <Viewer
          title={title}
          axis="y"
          counter={(k, n) => `Page ${k} of ${n}`}
          originalHref={mediaUrls.pdfOriginal(cloudName, payload.publicId)}
          pages={Array.from({ length: payload.pages }, (_, i) => ({
            key: `p${i + 1}`,
            src: (w: number) =>
              mediaDeliveryUrlFor(cloudName, MEDIA_DELIVERY.pdfPage(i + 1, w), payload.publicId),
            ...(sized ? { width: payload.width, height: payload.height } : {}),
            alt: `${label}, page ${i + 1}`,
          }))}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
