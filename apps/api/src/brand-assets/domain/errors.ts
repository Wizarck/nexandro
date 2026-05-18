/**
 * Domain errors for the brand-assets bounded context.
 * Mapped to HTTP responses by Nest's exception filters (default behaviour).
 */

import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';

export const ALLOWED_BRAND_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

export type AllowedBrandMimeType = (typeof ALLOWED_BRAND_MIME_TYPES)[number];

export const MAX_BRAND_BYTES = 2 * 1024 * 1024; // 2 MB

export class BrandMimeNotAllowedError extends UnsupportedMediaTypeException {
  constructor(received: string) {
    super({
      error: 'BRAND_MIME_NOT_ALLOWED',
      message: `Tipo MIME no permitido: "${received}". Permitidos: ${ALLOWED_BRAND_MIME_TYPES.join(', ')}.`,
      receivedMimeType: received,
      allowedMimeTypes: ALLOWED_BRAND_MIME_TYPES,
    });
  }
}

export class BrandFileTooLargeError extends PayloadTooLargeException {
  constructor(byteSize: number) {
    super({
      error: 'BRAND_FILE_TOO_LARGE',
      message: `Archivo demasiado grande (${byteSize} bytes). Máximo permitido: ${MAX_BRAND_BYTES} bytes (2 MB).`,
      byteSize,
      maxBytes: MAX_BRAND_BYTES,
    });
  }
}

export class BrandFileCorruptError extends BadRequestException {
  constructor(reason: string) {
    super({
      error: 'BRAND_FILE_CORRUPT',
      message: `No se pudo procesar el archivo de marca: ${reason}`,
      reason,
    });
  }
}
