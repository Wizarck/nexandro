import sharp = require('sharp');
import { BrandAssetProcessor } from './brand-asset-processor';
import {
  BrandFileCorruptError,
  BrandFileTooLargeError,
  BrandMimeNotAllowedError,
  MAX_BRAND_BYTES,
} from '../domain/errors';

describe('BrandAssetProcessor', () => {
  const processor = new BrandAssetProcessor();

  async function makePng(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
    })
      .png()
      .toBuffer();
  }

  it('rejects oversize input with BrandFileTooLargeError', async () => {
    const tooBig = Buffer.alloc(MAX_BRAND_BYTES + 1);
    await expect(processor.process(tooBig, 'image/png')).rejects.toBeInstanceOf(BrandFileTooLargeError);
  });

  it('rejects disallowed MIME with BrandMimeNotAllowedError', async () => {
    const png = await makePng(100, 100);
    await expect(processor.process(png, 'image/gif')).rejects.toBeInstanceOf(BrandMimeNotAllowedError);
  });

  it('rejects corrupt bytes with BrandFileCorruptError', async () => {
    const junk = Buffer.from('not an image, just some random text');
    await expect(processor.process(junk, 'image/png')).rejects.toBeInstanceOf(BrandFileCorruptError);
  });

  it('passes through a small PNG unchanged in format + dimensions', async () => {
    const input = await makePng(300, 200);
    const out = await processor.process(input, 'image/png');
    expect(out.contentType).toBe('image/png');
    expect(out.extension).toBe('png');
    expect(out.width).toBe(300);
    expect(out.height).toBe(200);
  });

  it('resizes a too-tall PNG down to fit 1024 longest side, preserving aspect', async () => {
    const input = await makePng(2000, 4000); // 1:2 portrait
    const out = await processor.process(input, 'image/png');
    expect(out.contentType).toBe('image/png');
    expect(Math.max(out.width, out.height)).toBe(1024);
    // aspect ratio preserved → 512×1024
    expect(out.width).toBe(512);
    expect(out.height).toBe(1024);
  });

  it('preserves JPEG format on JPEG input', async () => {
    const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } })
      .jpeg()
      .toBuffer();
    const out = await processor.process(input, 'image/jpeg');
    expect(out.contentType).toBe('image/jpeg');
    expect(out.extension).toBe('jpg');
  });

  it('rasterises SVG input into PNG (eliminates script attack surface)', async () => {
    const malicious = Buffer.from(
      `<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <script type="text/javascript">alert(1)</script>
        <rect width="200" height="200" fill="red" onclick="alert(2)" />
      </svg>`,
    );
    const out = await processor.process(malicious, 'image/svg+xml');
    expect(out.contentType).toBe('image/png');
    expect(out.extension).toBe('png');
    // PNG magic bytes must lead the buffer — guarantees the script-bearing
    // SVG content is gone from the stored representation.
    expect(out.bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    // Belt-and-braces: literal script tag MUST NOT appear in the stored bytes.
    expect(out.bytes.toString('binary').includes('<script')).toBe(false);
    expect(out.bytes.toString('binary').includes('onclick')).toBe(false);
  });
});
