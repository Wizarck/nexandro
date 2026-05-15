import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import type { BoundingBox, PhotoViewerProps } from './PhotoViewer.types';

/**
 * j12 PhotoViewer (slice #17b m3-photo-ingest-review-ui).
 *
 * Per ADR-J12-CANVAS-OVERLAY: bounding boxes are drawn on a `<canvas>`
 * overlaid on the photo `<img>`. Canvas is `aria-hidden="true"`; a
 * sibling `<ul>` with `role="region"` per box exposes the accessible
 * names. Re-positioning N positioned `<div>` overlays per zoom level
 * would be more code than a canvas redraw and j12 §Implementation Notes
 * explicitly calls for canvas.
 *
 * The viewer supports a small toolbar (+/-/rotate/download). Zoom +
 * rotate are local state; download is a callback so the screen can
 * fetch the original from object storage.
 *
 * If `photoUrl` is null or empty, the component renders the fallback
 * `Imagen no se pudo cargar · re-subir →` per j12 §Edge cases.
 */
const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function hitTest(
  boxes: ReadonlyArray<BoundingBox>,
  cx: number,
  cy: number,
): string | null {
  for (const b of boxes) {
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      return b.fieldName;
    }
  }
  return null;
}

export function PhotoViewer({
  photoUrl,
  boundingBoxes,
  highlightedField,
  onBoxHover,
  onReupload,
  onDownload,
  className,
}: PhotoViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || naturalSize == null) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = naturalSize.w * dpr;
    canvas.height = naturalSize.h * dpr;
    canvas.style.width = `${naturalSize.w}px`;
    canvas.style.height = `${naturalSize.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    for (const b of boundingBoxes) {
      const isHighlighted = b.fieldName === highlightedField;
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.strokeStyle = isHighlighted
        ? 'rgba(0, 122, 255, 1)'
        : 'rgba(0, 122, 255, 0.6)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(b.x, Math.max(0, b.y - 16), Math.min(160, b.label.length * 7), 14);
      ctx.fillStyle = 'white';
      ctx.fillText(b.label, b.x + 2, Math.max(10, b.y - 4));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [boundingBoxes, highlightedField, naturalSize]);

  if (photoUrl == null || photoUrl === '') {
    return (
      <div
        role="status"
        aria-label="Imagen no disponible"
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-sm',
          className,
        )}
        style={{
          color: 'var(--color-mute)',
          borderColor: 'var(--color-border-strong)',
          minHeight: '240px',
        }}
      >
        <p>Imagen no se pudo cargar</p>
        {onReupload && (
          <button
            type="button"
            onClick={onReupload}
            className="mt-3 rounded-md border bg-transparent px-3 py-2 text-sm"
            style={{
              color: 'var(--color-accent-press)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            re-subir →
          </button>
        )}
      </div>
    );
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onBoxHover || naturalSize == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = naturalSize.w / rect.width;
    const sy = naturalSize.h / rect.height;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;
    const fieldName = hitTest(boundingBoxes, cx, cy);
    onBoxHover(fieldName);
  };

  const handlePointerLeave = () => {
    onBoxHover?.(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col gap-3', className)}
      data-component="photo-viewer"
    >
      <div
        className="flex items-center gap-2 rounded-md border p-2"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        role="toolbar"
        aria-label="Visor de foto"
      >
        <ToolbarButton
          ariaLabel="Acercar"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
        >
          +
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Alejar"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
        >
          −
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Rotar"
          onClick={() => setRotation((r) => (r + 90) % 360)}
        >
          ↻
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Descargar original"
          onClick={onDownload}
          disabled={!onDownload}
        >
          ↓
        </ToolbarButton>
        <span
          className="ml-auto text-xs tabular-nums"
          style={{ color: 'var(--color-mute)' }}
        >
          {Math.round(zoom * 100)} %
        </span>
      </div>

      <div
        className="relative overflow-auto rounded-md border"
        style={{
          backgroundColor: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          maxHeight: '520px',
        }}
      >
        <div
          style={{
            position: 'relative',
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'top left',
            display: 'inline-block',
          }}
        >
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Foto a revisar"
            onLoad={(e) => {
              const t = e.currentTarget;
              setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
            }}
            style={{ display: 'block' }}
          />
          {naturalSize && (
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                pointerEvents: 'auto',
              }}
            />
          )}
        </div>
      </div>

      <ul
        aria-label="Cuadros detectados"
        className="sr-only"
        data-component="photo-viewer-regions"
      >
        {boundingBoxes.map((b) => (
          <li
            key={b.fieldName}
            role="region"
            aria-label={`Campo ${b.label}`}
            data-field-name={b.fieldName}
            data-highlighted={
              b.fieldName === highlightedField ? 'true' : 'false'
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="rounded-md border px-2 py-1 text-sm"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        color: disabled ? 'var(--color-mute)' : 'var(--color-ink)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minWidth: '32px',
      }}
    >
      {children}
    </button>
  );
}
