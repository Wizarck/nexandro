import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { cn } from '../../lib/cn';
import {
  ACCEPTED_BRAND_MIME_TYPES,
  MAX_BRAND_BYTES,
  type BrandMarkPickerProps,
} from './BrandMarkPicker.types';

/**
 * Combined drag-and-drop / click-to-pick / external-URL fallback for an
 * organisation's brand mark. Presentational — the parent owns the upload
 * mutation and threads progress + errors via props.
 *
 * UX layout:
 *   ┌───────────────────────────────────────────┐
 *   │  [preview]   Arrastra una imagen aquí     │  ← dropzone
 *   │              o haz clic para elegirla      │
 *   │              PNG, JPG, WEBP, SVG · 2 MB    │
 *   ├───────────────────────────────────────────┤
 *   │  o pega una URL externa:                   │
 *   │  [ https://… ]                             │
 *   └───────────────────────────────────────────┘
 */
export function BrandMarkPicker({
  value,
  onFilePicked,
  onUrlChanged,
  onClear,
  uploading = false,
  error,
  successInfo,
  disabled = false,
}: BrandMarkPickerProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const acceptAttr = ACCEPTED_BRAND_MIME_TYPES.join(',');

  const validateAndPick = (file: File): void => {
    setClientError(null);
    if (file.size > MAX_BRAND_BYTES) {
      setClientError(
        `Archivo demasiado grande (${formatBytes(file.size)}). Máximo 2 MB.`,
      );
      return;
    }
    if (!ACCEPTED_BRAND_MIME_TYPES.includes(file.type as never)) {
      setClientError(
        `Formato no permitido (${file.type || 'desconocido'}). Permitidos: PNG, JPG, WEBP, SVG.`,
      );
      return;
    }
    onFilePicked(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) validateAndPick(file);
    // Reset so picking the same file twice in a row still fires `change`.
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndPick(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (disabled || uploading) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (): void => setIsDragOver(false);

  const surfaceError = clientError ?? error;
  const dropzoneInteractive = !disabled && !uploading;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={dropzoneInteractive ? 0 : -1}
        onClick={() => dropzoneInteractive && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && dropzoneInteractive) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex items-center gap-4 rounded-lg border-2 border-dashed p-4',
          'cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
          isDragOver
            ? 'border-(--color-primary) bg-(--color-bg)'
            : 'border-border-strong bg-surface hover:border-(--color-primary)',
          (disabled || uploading) && 'cursor-not-allowed opacity-60 hover:border-border-strong',
        )}
        aria-disabled={disabled || uploading}
        aria-label="Subir logotipo"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-(--color-bg) overflow-hidden">
          {value ? (
            <img
              src={value}
              alt="Logotipo actual"
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span aria-hidden="true" className="text-2xl text-mute">🏷️</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {uploading ? (
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin rounded-full border-2 border-(--color-primary) border-t-transparent"
              />
              Subiendo logotipo…
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                Arrastra una imagen aquí o <span className="underline">haz clic para elegirla</span>
              </p>
              <p className="mt-0.5 text-xs text-mute">
                PNG, JPG, WEBP, SVG · máx 2 MB · se redimensiona a 1024 px
              </p>
            </>
          )}
        </div>
        {value && !uploading && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-xs text-(--color-danger-fg) hover:underline"
            aria-label="Quitar logotipo"
          >
            Quitar
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="sr-only"
          onChange={handleInputChange}
          disabled={!dropzoneInteractive}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {surfaceError && (
        <p role="alert" className="text-xs text-(--color-danger-fg)">{surfaceError}</p>
      )}
      {successInfo && !surfaceError && (
        <p role="status" className="text-xs text-(--color-success-fg)">{successInfo}</p>
      )}

      {!disabled && (
        <div>
          <label className="mb-1 block text-sm font-medium text-mute" htmlFor="bmp-url">
            …o pega una URL externa
          </label>
          <input
            id="bmp-url"
            type="url"
            value={value ?? ''}
            onChange={(e) => onUrlChanged(e.target.value || undefined)}
            placeholder="https://…"
            className={cn(
              'block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink',
              'focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
              uploading && 'cursor-wait opacity-60',
            )}
            disabled={uploading}
          />
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
