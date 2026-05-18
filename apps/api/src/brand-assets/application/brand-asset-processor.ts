import { Injectable, Logger } from '@nestjs/common';
import sharp = require('sharp');
import {
  ALLOWED_BRAND_MIME_TYPES,
  BrandFileCorruptError,
  BrandFileTooLargeError,
  BrandMimeNotAllowedError,
  MAX_BRAND_BYTES,
  type AllowedBrandMimeType,
} from '../domain/errors';

/** Max dimension (longest side, px) after server-side resize. */
const MAX_DIMENSION_PX = 1024;

export interface ProcessedBrandAsset {
  bytes: Buffer;
  /** Final stored content-type AFTER processing. SVG inputs become PNG. */
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Storage extension matching the stored format. */
  extension: 'png' | 'jpg' | 'webp';
  /** Final dimensions of the stored asset. */
  width: number;
  height: number;
}

/**
 * Validates + normalizes a brand-mark upload before persisting. Pipeline:
 *
 *   1. Reject if size > 2 MB.
 *   2. Reject if MIME type not in the allowlist.
 *   3. Raster (png/jpeg/webp): sharp resize-to-fit max 1024×1024 (preserve aspect)
 *      and re-emit in the SAME format to preserve transparency where applicable.
 *   4. SVG: sharp rasterises to PNG at max 1024×1024. The output PNG carries
 *      NO script content — the entire SVG attack surface (`<script>`, `on*=`,
 *      `xlink:href` data URIs) is eliminated by the format change. No
 *      separate SVG sanitization library needed; rasterisation IS the
 *      sanitization.
 *
 * Throws domain errors (mapped to 4xx by Nest's default exception handling).
 */
@Injectable()
export class BrandAssetProcessor {
  private readonly logger = new Logger(BrandAssetProcessor.name);

  async process(input: Buffer, declaredMimeType: string): Promise<ProcessedBrandAsset> {
    if (input.byteLength > MAX_BRAND_BYTES) {
      throw new BrandFileTooLargeError(input.byteLength);
    }
    if (!isAllowedMimeType(declaredMimeType)) {
      throw new BrandMimeNotAllowedError(declaredMimeType);
    }

    try {
      // sharp auto-detects format from magic bytes; declared MIME is a hint only.
      const pipeline = sharp(input, { failOn: 'error' }).resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: 'inside',
        withoutEnlargement: true,
      });

      const isSvgInput = declaredMimeType === 'image/svg+xml';

      if (isSvgInput) {
        // Rasterise SVG → PNG. PNG preserves transparency; flattens scripts.
        const out = await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
        return {
          bytes: out.data,
          contentType: 'image/png',
          extension: 'png',
          width: out.info.width,
          height: out.info.height,
        };
      }

      if (declaredMimeType === 'image/jpeg') {
        const out = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
        return {
          bytes: out.data,
          contentType: 'image/jpeg',
          extension: 'jpg',
          width: out.info.width,
          height: out.info.height,
        };
      }

      if (declaredMimeType === 'image/webp') {
        const out = await pipeline.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
        return {
          bytes: out.data,
          contentType: 'image/webp',
          extension: 'webp',
          width: out.info.width,
          height: out.info.height,
        };
      }

      // PNG default
      const out = await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
      return {
        bytes: out.data,
        contentType: 'image/png',
        extension: 'png',
        width: out.info.width,
        height: out.info.height,
      };
    } catch (err) {
      if (err instanceof BrandFileTooLargeError || err instanceof BrandMimeNotAllowedError) {
        throw err;
      }
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`brand-asset: sharp rejected upload — ${reason}`);
      throw new BrandFileCorruptError(reason);
    }
  }
}

function isAllowedMimeType(m: string): m is AllowedBrandMimeType {
  return (ALLOWED_BRAND_MIME_TYPES as readonly string[]).includes(m);
}
