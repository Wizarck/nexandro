import { randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service';

const ENV_VAR = 'LLM_CREDENTIALS_ENCRYPTION_KEY';

function withKey<T>(fn: () => T): T {
  const original = process.env[ENV_VAR];
  process.env[ENV_VAR] = randomBytes(32).toString('hex');
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  }
}

describe('EncryptionService — construction', () => {
  it('throws when LLM_CREDENTIALS_ENCRYPTION_KEY is missing', () => {
    const original = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
    try {
      expect(() => new EncryptionService()).toThrow(/LLM_CREDENTIALS_ENCRYPTION_KEY is not set/);
    } finally {
      if (original !== undefined) {
        process.env[ENV_VAR] = original;
      }
    }
  });

  it('throws when the env var is empty / whitespace', () => {
    const original = process.env[ENV_VAR];
    process.env[ENV_VAR] = '   ';
    try {
      expect(() => new EncryptionService()).toThrow(/is not set/);
    } finally {
      if (original === undefined) {
        delete process.env[ENV_VAR];
      } else {
        process.env[ENV_VAR] = original;
      }
    }
  });

  it('throws when the env var decodes to the wrong length', () => {
    const original = process.env[ENV_VAR];
    // 16 bytes instead of 32
    process.env[ENV_VAR] = randomBytes(16).toString('hex');
    try {
      expect(() => new EncryptionService()).toThrow(/must decode to 32 bytes/);
    } finally {
      if (original === undefined) {
        delete process.env[ENV_VAR];
      } else {
        process.env[ENV_VAR] = original;
      }
    }
  });

  it('loads cleanly with a valid 32-byte hex key', () => {
    withKey(() => {
      const svc = new EncryptionService();
      expect(svc).toBeDefined();
    });
  });
});

describe('EncryptionService — encrypt / decrypt round-trip', () => {
  it('round-trips an arbitrary plaintext', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const plain = 'sk-test-1234567890ABCDEFghijklmn';
      const encoded = svc.encrypt(plain);
      expect(encoded).not.toContain(plain); // sanity: not just base64 of plain
      const decoded = svc.decrypt(encoded);
      expect(decoded).toBe(plain);
    });
  });

  it('produces a different ciphertext every call (fresh nonce)', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const plain = 'same-input';
      const a = svc.encrypt(plain);
      const b = svc.encrypt(plain);
      expect(a).not.toBe(b);
      expect(svc.decrypt(a)).toBe(plain);
      expect(svc.decrypt(b)).toBe(plain);
    });
  });

  it('round-trips an empty string', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const encoded = svc.encrypt('');
      expect(svc.decrypt(encoded)).toBe('');
    });
  });

  it('round-trips multibyte unicode', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const plain = '日本語キー🔑';
      expect(svc.decrypt(svc.encrypt(plain))).toBe(plain);
    });
  });

  it('throws on non-string input to encrypt', () => {
    withKey(() => {
      const svc = new EncryptionService();
      expect(() => svc.encrypt(undefined as unknown as string)).toThrow();
      expect(() => svc.encrypt(null as unknown as string)).toThrow();
      expect(() => svc.encrypt(42 as unknown as string)).toThrow();
    });
  });
});

describe('EncryptionService — tamper detection', () => {
  it('throws when the ciphertext byte is mutated', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const encoded = svc.encrypt('sk-tamper-test');
      const buf = Buffer.from(encoded, 'base64');
      // Flip a bit in the middle of the ciphertext (after nonce, before tag)
      const middle = Math.floor(buf.length / 2);
      buf[middle] = buf[middle] ^ 0x01;
      const tampered = buf.toString('base64');
      expect(() => svc.decrypt(tampered)).toThrow();
    });
  });

  it('throws when the auth tag is mutated', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const encoded = svc.encrypt('sk-tag-test');
      const buf = Buffer.from(encoded, 'base64');
      // Flip a bit in the last byte (inside the GCM tag)
      buf[buf.length - 1] = buf[buf.length - 1] ^ 0x01;
      const tampered = buf.toString('base64');
      expect(() => svc.decrypt(tampered)).toThrow();
    });
  });

  it('throws when ciphertext is shorter than nonce + tag', () => {
    withKey(() => {
      const svc = new EncryptionService();
      const tooShort = Buffer.alloc(8).toString('base64');
      expect(() => svc.decrypt(tooShort)).toThrow(/too short/);
    });
  });

  it('throws on empty / missing decrypt input', () => {
    withKey(() => {
      const svc = new EncryptionService();
      expect(() => svc.decrypt('')).toThrow();
      expect(() => svc.decrypt(undefined as unknown as string)).toThrow();
    });
  });

  it('decrypt with a different key produces an error (not silent mismatch)', () => {
    let encoded = '';
    withKey(() => {
      const svc = new EncryptionService();
      encoded = svc.encrypt('sk-key-rotation-test');
    });
    // New key, same ciphertext
    withKey(() => {
      const svc = new EncryptionService();
      expect(() => svc.decrypt(encoded)).toThrow();
    });
  });
});
