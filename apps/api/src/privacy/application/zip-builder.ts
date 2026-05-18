import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

/**
 * Sprint 2 P4 GDPR export — minimal ZIP encoder.
 *
 * Why hand-roll? The repo carries no archiver/JSZip dep and dragging in
 * one for a single endpoint is overkill. The encoder supports the subset
 * the Art.15 + Art.20 export needs: small text files (manifest + JSONL
 * dumps), no large binaries, single pass, fully in-memory buffer (we
 * truncate audit_log to last 90 days specifically so the export size
 * stays bounded — see `PrivacyExportService`).
 *
 * Format conforms to ZIP file format (PKWARE APPNOTE 6.3.x) sections
 * 4.3.7 (local file header), 4.3.14 (central directory), 4.3.16 (EOCD).
 * DEFLATE (method=8) compression because text/JSONL compresses 5-10x;
 * the helper falls back to STORED (method=0) when compressed size would
 * be larger than the input (degenerate path; safe).
 *
 * Hash-friendly: caller can request the sha256 of each entry via
 * `addEntry` return shape — used by the manifest.
 */
export interface ZipEntryRef {
  name: string;
  uncompressedSize: number;
  sha256: string;
}

interface InternalEntry {
  name: string;
  rawSize: number;
  storedSize: number;
  crc32: number;
  method: 0 | 8;
  localOffset: number;
  body: Buffer;
  modDosTime: number;
  modDosDate: number;
}

export class ZipBuilder {
  private readonly buffers: Buffer[] = [];
  private offset = 0;
  private readonly entries: InternalEntry[] = [];

  /** Append a UTF-8 text file. Returns a ref the caller can shove into a manifest. */
  addUtf8File(name: string, contents: string): ZipEntryRef {
    return this.addBuffer(name, Buffer.from(contents, 'utf8'));
  }

  /** Append an arbitrary Buffer. */
  addBuffer(name: string, raw: Buffer): ZipEntryRef {
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const crc32 = crc32of(raw);
    const compressed = deflateRawSync(raw);
    const useDeflate = compressed.length < raw.length;
    const stored = useDeflate ? compressed : raw;
    const method: 0 | 8 = useDeflate ? 8 : 0;
    const now = new Date();
    const modDosDate =
      ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const modDosTime =
      (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >>> 1);

    const localHeader = this.writeLocalFileHeader({
      name,
      method,
      modDosDate,
      modDosTime,
      crc32,
      compressedSize: stored.length,
      uncompressedSize: raw.length,
    });

    const entry: InternalEntry = {
      name,
      rawSize: raw.length,
      storedSize: stored.length,
      crc32,
      method,
      localOffset: this.offset,
      body: stored,
      modDosDate,
      modDosTime,
    };
    this.entries.push(entry);

    this.buffers.push(localHeader, stored);
    this.offset += localHeader.length + stored.length;

    return { name, uncompressedSize: raw.length, sha256 };
  }

  /** Finalize the archive. Returns the assembled Buffer. */
  build(): Buffer {
    const centralDirStart = this.offset;
    for (const entry of this.entries) {
      const cd = this.writeCentralDirectoryHeader(entry);
      this.buffers.push(cd);
      this.offset += cd.length;
    }
    const centralDirSize = this.offset - centralDirStart;
    const eocd = this.writeEocd(this.entries.length, centralDirSize, centralDirStart);
    this.buffers.push(eocd);
    this.offset += eocd.length;
    return Buffer.concat(this.buffers);
  }

  private writeLocalFileHeader(args: {
    name: string;
    method: 0 | 8;
    modDosTime: number;
    modDosDate: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
  }): Buffer {
    const nameBuf = Buffer.from(args.name, 'utf8');
    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0); // local file header signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // general purpose bit flag — bit 11 = UTF-8 filename
    header.writeUInt16LE(args.method, 8);
    header.writeUInt16LE(args.modDosTime, 10);
    header.writeUInt16LE(args.modDosDate, 12);
    header.writeUInt32LE(args.crc32 >>> 0, 14);
    header.writeUInt32LE(args.compressedSize, 18);
    header.writeUInt32LE(args.uncompressedSize, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(header, 30);
    return header;
  }

  private writeCentralDirectoryHeader(entry: InternalEntry): Buffer {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4); // version made by (Unix, 3.0)
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8); // bit 11 utf-8
    cd.writeUInt16LE(entry.method, 10);
    cd.writeUInt16LE(entry.modDosTime, 12);
    cd.writeUInt16LE(entry.modDosDate, 14);
    cd.writeUInt32LE(entry.crc32 >>> 0, 16);
    cd.writeUInt32LE(entry.storedSize, 20);
    cd.writeUInt32LE(entry.rawSize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra field length
    cd.writeUInt16LE(0, 32); // file comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal file attrs
    // External file attrs: high 16 bits = Unix mode 0644 (rw-r--r--).
    // `0o100644 << 16` overflows int32; use unsigned shift to keep value
    // in [0, 2^32-1] before writeUInt32LE.
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cd.writeUInt32LE(entry.localOffset, 42);
    nameBuf.copy(cd, 46);
    return cd;
  }

  private writeEocd(
    entryCount: number,
    centralDirSize: number,
    centralDirOffset: number,
  ): Buffer {
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk start of CD
    eocd.writeUInt16LE(entryCount, 8);
    eocd.writeUInt16LE(entryCount, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20); // comment length
    return eocd;
  }
}

/** CRC-32 of a Buffer, IEEE 802.3 polynomial 0xEDB88320 (standard ZIP). */
function crc32of(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();
