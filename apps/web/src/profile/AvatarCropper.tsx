import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { Button } from '../ui/buttons/Button';
import { Sheet } from '../ui/sheet/Sheet';

/** The circle's box on screen (px, a measure) and the stored photo's side. */
export const CROP_VIEW = 256;
export const CROP_OUTPUT = 512;
const MAX_ZOOM = 3;
const KEY_STEP = 16;
export const CROP_UNREADABLE = "Couldn't read this photo";

type Source = CanvasImageSource & { width: number; height: number };
/** `x`,`y`: the centre of the visible square, in source pixels. */
type View = { x: number; y: number; zoom: number };

async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sideOf = (src: Source, zoom: number) => Math.min(src.width, src.height) / zoom;

/** Keeps the visible square inside the image, so the circle is always covered. */
export function clampView(src: Source, view: View): View {
  const half = sideOf(src, view.zoom) / 2;
  return {
    zoom: view.zoom,
    x: Math.min(Math.max(view.x, half), src.width - half),
    y: Math.min(Math.max(view.y, half), src.height - half),
  };
}

function paint(canvas: HTMLCanvasElement, src: Source, view: View, size: number): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const side = sideOf(src, view.zoom);
  ctx.drawImage(src, view.x - side / 2, view.y - side / 2, side, side, 0, 0, size, size);
  return true;
}

/**
 * 046 (Story 3, D423): crops a picked photo to the square the profile keeps, in the shared sheet.
 * Drag or arrow keys move the photo under the circle, Zoom scales it; the visible square is drawn
 * to a 512 px canvas and handed back as a JPEG. Mount it only while cropping.
 */
export default function AvatarCropper({
  file,
  onConfirm,
  onCancel,
  onError,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const titleId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<Source | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const latestError = useRef(onError);
  useEffect(() => {
    latestError.current = onError;
  });

  useEffect(() => {
    let live = true;
    decode(file).then(
      (src) => {
        if (!live) return;
        if (!(src.width > 0 && src.height > 0)) return latestError.current(CROP_UNREADABLE);
        source.current = src;
        setView({ x: src.width / 2, y: src.height / 2, zoom: 1 });
      },
      () => {
        if (live) latestError.current(CROP_UNREADABLE);
      },
    );
    return () => {
      live = false;
    };
  }, [file]);

  useEffect(() => {
    if (view && source.current && canvas.current) {
      paint(canvas.current, source.current, view, CROP_VIEW);
    }
  }, [view]);

  const move = (dx: number, dy: number) => {
    const src = source.current;
    if (!src) return;
    setView((v) => {
      if (!v) return v;
      // Screen pixels to source pixels at the current scale.
      const k = sideOf(src, v.zoom) / CROP_VIEW;
      return clampView(src, { ...v, x: v.x - dx * k, y: v.y - dy * k });
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    drag.current = { x: event.clientX, y: event.clientY };
    move(event.clientX - from.x, event.clientY - from.y);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = dir[event.key];
    if (!step) return;
    event.preventDefault();
    move(step[0], step[1]);
  };

  const zoom = (value: number) => {
    const src = source.current;
    if (src) setView((v) => v && clampView(src, { ...v, zoom: value }));
  };

  const confirm = () => {
    const src = source.current;
    if (!src || !view) return;
    const out = document.createElement('canvas');
    out.width = out.height = CROP_OUTPUT;
    if (!paint(out, src, view, CROP_OUTPUT)) return onError(CROP_UNREADABLE);
    out.toBlob((blob) => (blob ? onConfirm(blob) : onError(CROP_UNREADABLE)), 'image/jpeg', 0.9);
  };

  return (
    <Sheet labelledBy={titleId} onClose={onCancel}>
      <h2 id={titleId} className="sheet__title">
        Crop your photo
      </h2>
      <div className="avatar-cropper">
        <div
          className="avatar-cropper__stage"
          tabIndex={0}
          role="group"
          aria-label="Photo position. Drag, or use the arrow keys, to move the photo."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
        >
          <canvas
            ref={canvas}
            className="avatar-cropper__canvas"
            width={CROP_VIEW}
            height={CROP_VIEW}
          />
        </div>
        <label className="field avatar-cropper__zoom">
          <span className="field__label">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view?.zoom ?? 1}
            disabled={!view}
            onChange={(event) => zoom(Number(event.currentTarget.value))}
          />
        </label>
      </div>
      <div className="sheet__actions">
        <Button icon="check" label="Use photo" onClick={confirm} disabled={!view} />
        <Button icon="close" label="Cancel" variant="ghost" onClick={onCancel} />
      </div>
    </Sheet>
  );
}
