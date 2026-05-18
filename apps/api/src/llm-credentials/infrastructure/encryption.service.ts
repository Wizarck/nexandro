import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // 256 bits
const NONCE_BYTES = 12; // 96 bits — GCM standard
const TAG_BYTES = 16; // 128 bits — GCM auth tag
const ENV_VAR = 'LLM_CREDENTIALS_ENCRYPTION_KEY';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. AES-256-GCM wrapper around
 * Node's built-in `crypto`. The 32-byte master key is sourced from the
 * `LLM_CREDENTIALS_ENCRYPTION_KEY` env var (hex-encoded) and validated at
 * construction time — booting the API without it is a hard failure so
 * misconfiguration surfaces in `docker compose up` rather than at the
 * first key upsert.
 *
 * Encoded ciphertext layout: base64(`nonce || ciphertext || tag`).
 *  - `nonce` (12 bytes) — fresh random per encryption (NEVER reused).
 *  - `ciphertext` (variable) — AES-256-GCM output.
 *  - `tag` (16 bytes) — GCM authentication tag; tamper detection.
 *
 * The `decrypt()` path throws on any tag mismatch (Node raises an Error
 * with `code: 'ERR_OSSL_BAD_DECRYPT'` or similar from `final()`), so a
 * mutated ciphertext or wrong key is non-recoverable by design.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor() {
    const hex = process.env[ENV_VAR];
    if (!hex || hex.trim().length === 0) {
      throw new Error(
        `${ENV_VAR} is not set. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    const buf = Buffer.from(hex.trim(), 'hex');
    if (buf.length !== KEY_BYTES) {
      throw new Error(
        `${ENV_VAR} must decode to ${KEY_BYTES} bytes (got ${buf.length}). Expected ${KEY_BYTES * 2} hex chars.`,
      );
    }
    this.key = buf;
    // NOTE: do NOT log the key. The constructor only logs that the key
    // *loaded* — for forensics if the service starts complaining about
    // tag mismatches after a rotation.
    this.logger.log(`${ENV_VAR} loaded (${KEY_BYTES} bytes).`);
  }

  /**
   * Encrypts `plain` and returns base64 of `nonce || ciphertext || tag`.
   * Each call generates a fresh 12-byte nonce — the same `plain` produces
   * different ciphertexts on every call, which is the intended GCM
   * semantics (and what makes side-channel comparison attacks moot).
   */
  encrypt(plain: string): string {
    if (typeof plain !== 'string') {
      throw new Error('EncryptionService.encrypt: input must be a string');
    }
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, ciphertext, tag]).toString('base64');
  }

  /**
   * Decrypts a base64-encoded `nonce || ciphertext || tag` blob produced by
   * `encrypt()`. Throws on tag mismatch (tamper) or wrong key. The caller
   * MUST NOT log the cleartext — `LlmCredentialsService.test()` is the
   * only consumer and it passes the result directly to the provider HTTP
   * client.
   */
  decrypt(encoded: string): string {
    if (typeof encoded !== 'string' || encoded.length === 0) {
      throw new Error('EncryptionService.decrypt: input must be a non-empty string');
    }
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error('EncryptionService.decrypt: ciphertext too short');
    }
    const nonce = buf.subarray(0, NONCE_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ciphertext = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, nonce);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }
}
