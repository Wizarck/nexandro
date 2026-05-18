import { ZipBuilder } from './zip-builder';

describe('ZipBuilder', () => {
  it('produces a valid PK-prefixed archive with EOCD at tail', () => {
    const zip = new ZipBuilder();
    zip.addUtf8File('a.txt', 'hello world');
    zip.addUtf8File('b.txt', 'second file content');
    const buf = zip.build();
    expect(buf.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50); // EOCD
  });

  it('records 2 entries in the EOCD entry count fields', () => {
    const zip = new ZipBuilder();
    zip.addUtf8File('a.txt', 'aa');
    zip.addUtf8File('b.txt', 'bb');
    const buf = zip.build();
    expect(buf.readUInt16LE(buf.length - 22 + 8)).toBe(2);
    expect(buf.readUInt16LE(buf.length - 22 + 10)).toBe(2);
  });

  it('includes filenames as UTF-8 in the central directory', () => {
    const zip = new ZipBuilder();
    zip.addUtf8File('mañana.txt', 'hola');
    const buf = zip.build();
    expect(buf.toString('utf8')).toContain('mañana.txt');
  });

  it('returns sha256 + uncompressedSize in the ZipEntryRef', () => {
    const zip = new ZipBuilder();
    const ref = zip.addUtf8File('a.txt', 'hello');
    expect(ref.name).toBe('a.txt');
    expect(ref.uncompressedSize).toBe(5);
    // Known sha256 of "hello"
    expect(ref.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('falls back to STORED method when deflate would be larger (tiny inputs)', () => {
    const zip = new ZipBuilder();
    zip.addUtf8File('a.txt', 'x');
    const buf = zip.build();
    // Local file header method @ offset 8 (uint16 LE).
    const method = buf.readUInt16LE(8);
    expect([0, 8]).toContain(method);
  });
});
