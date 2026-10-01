import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PRODUCT_IMAGE_VIEW,
  PRODUCT_IMAGE_EDGE_PX,
  renderProductImage,
  type ProductImageView,
} from '../utils/productImagePrepare';

const FRAME_PX = 340;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

interface ProductImageCropModalProps {
  file: File;
  /** Called with the framed square photo, ready to upload. */
  onConfirm: (prepared: File) => void;
  onCancel: () => void;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom / drag the photo inside the square frame before it is uploaded. */
export function ProductImageCropModal({ file, onConfirm, onCancel }: ProductImageCropModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<ProductImageView>(DEFAULT_PRODUCT_IMAGE_VIEW);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setSize(null);
    setView(DEFAULT_PRODUCT_IMAGE_VIEW);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: clampZoom(v.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const longSide = size ? Math.max(size.w, size.h) : 1;
  const k = (FRAME_PX / longSide) * view.zoom;
  const imgW = size ? size.w * k : 0;
  const imgH = size ? size.h * k : 0;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      offsetX: d.ox + (e.clientX - d.x) / FRAME_PX,
      offsetY: d.oy + (e.clientY - d.y) / FRAME_PX,
    }));
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function handleUse() {
    setBusy(true);
    setError(null);
    try {
      onConfirm(await renderProductImage(file, view));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare this photo.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Adjust photo" style={{ maxWidth: 420 }}>
        <div className="modal__header">
          <h2 className="modal__title">Adjust photo</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="form-hint" style={{ marginBottom: 12 }}>
          Drag to move, use the slider or mouse wheel to zoom. The saved photo is
          {' '}{PRODUCT_IMAGE_EDGE_PX}×{PRODUCT_IMAGE_EDGE_PX} px.
        </p>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'relative',
            width: FRAME_PX,
            height: FRAME_PX,
            maxWidth: '100%',
            margin: '0 auto',
            overflow: 'hidden',
            cursor: 'grab',
            touchAction: 'none',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.15)',
            background:
              'repeating-conic-gradient(#e9e9e9 0% 25%, #ffffff 0% 50%) 50% / 20px 20px',
          }}
        >
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              style={{
                position: 'absolute',
                userSelect: 'none',
                pointerEvents: 'none',
                maxWidth: 'none',
                width: imgW || undefined,
                height: imgH || undefined,
                left: FRAME_PX / 2 + view.offsetX * FRAME_PX - imgW / 2,
                top: FRAME_PX / 2 + view.offsetY * FRAME_PX - imgH / 2,
                opacity: size ? 1 : 0,
              }}
            />
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px auto 0', maxWidth: FRAME_PX }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setView((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.15) }))}
            aria-label="Zoom out"
          >
            −
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={(e) => setView((v) => ({ ...v, zoom: clampZoom(Number(e.target.value)) }))}
            aria-label="Zoom"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setView((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.15) }))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setView(DEFAULT_PRODUCT_IMAGE_VIEW)}
          >
            Reset
          </button>
        </div>

        {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void handleUse()} disabled={busy || !size}>
            {busy ? 'Preparing…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
