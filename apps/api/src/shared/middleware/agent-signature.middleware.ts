import { createPublicKey, verify } from 'node:crypto';
import {
  Injectable,
  Logger,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AgentCredentialRepository } from '../../agent-credentials/infrastructure/agent-credential.repository';
import type { AuthenticatedUserPayload } from '../guards/roles.guard';

const HEADER_VIA_AGENT = 'x-via-agent';
const HEADER_AGENT_ID = 'x-agent-id';
const HEADER_AGENT_SIGNATURE = 'x-agent-signature';
const HEADER_AGENT_TIMESTAMP = 'x-agent-timestamp';
const HEADER_AGENT_NONCE = 'x-agent-nonce';

/**
 * 5-minute clock skew window. Matches the AWS SigV4 standard. Tighter
 * windows risk legitimate clock drift on integrators' machines; wider
 * windows enlarge the replay-attack surface.
 */
const TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/** LRU cap for nonce tracking. Each entry is ~50 bytes; 10k = ~500 KB. */
const NONCE_LRU_CAP = 10_000;

const FLAG_ENV = 'NEXANDRO_AGENT_SIGNATURE_REQUIRED';

function readHeader(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (raw === undefined) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Returns whether signing is required for the calling user's organization.
 * Flag value "true" → required for all orgs.
 * Flag value "false" / unset → required for none.
 * Flag value "uuid1,uuid2,..." → required for the listed orgs only.
 */
function isSignatureRequired(orgId: string | undefined): boolean {
  const raw = process.env[FLAG_ENV];
  if (!raw) return false;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return true;
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no' || trimmed === '') {
    return false;
  }
  if (!orgId) return false;
  // Comma list of org ids — case-insensitive UUID match.
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(orgId.toLowerCase());
}

/**
 * Tiny FIFO nonce cache. Sufficient for single-replica M2 deployments;
 * horizontal scale-out swaps to a Redis-backed store (filed follow-up).
 */
class NonceLRU {
  private readonly seen = new Map<string, number>();

  has(nonce: string, nowMs: number): boolean {
    const ts = this.seen.get(nonce);
    if (ts === undefined) return false;
    if (nowMs - ts > TIMESTAMP_SKEW_MS) {
      this.seen.delete(nonce);
      return false;
    }
    return true;
  }

  add(nonce: string, nowMs: number): void {
    this.seen.set(nonce, nowMs);
    if (this.seen.size > NONCE_LRU_CAP) {
      // Drop the oldest entry — Map iterates in insertion order.
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
  }
}

/**
 * Wave 1.13 [3c] — AgentSignatureMiddleware.
 *
 * Verifies Ed25519 signatures on agent-flagged requests. Rejects with 401
 * when the flag is required for the calling org but the signature is
 * missing/invalid. When verification succeeds, stamps `req.agentContext`
 * with the verified credential's `agentName` + a `signatureVerified=true`
 * marker — downstream code can trust this, including
 * `BeforeAfterAuditInterceptor`'s before-handler phase.
 *
 * Default-OFF posture: when `NEXANDRO_AGENT_SIGNATURE_REQUIRED` is unset
 * or "false", this middleware is a no-op for missing-signature requests
 * (legacy 3a unsigned path stays). When the flag includes the calling org
 * id (or is "true" globally), missing signature on an agent-flagged
 * request is a 401.
 */
@Injectable()
export class AgentSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AgentSignatureMiddleware.name);
  private readonly nonces = new NonceLRU();

  constructor(private readonly credentials: AgentCredentialRepository) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const sig = readHeader(req, HEADER_AGENT_SIGNATURE);
    const id = readHeader(req, HEADER_AGENT_ID);
    const ts = readHeader(req, HEADER_AGENT_TIMESTAMP);
    const nonce = readHeader(req, HEADER_AGENT_NONCE);
    const viaAgentClaim = readHeader(req, HEADER_VIA_AGENT);
    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;

    const allHeadersPresent = !!(sig && id && ts && nonce);
    const flagOn = isSignatureRequired(user?.organizationId);

    if (!allHeadersPresent) {
      // Missing headers + flag-on for this org + caller claims viaAgent → 401.
      if (
        flagOn &&
        viaAgentClaim &&
        ['true', '1', 'yes'].includes(viaAgentClaim.trim().toLowerCase())
      ) {
        throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_REQUIRED' });
      }
      // Otherwise pass through — legacy 3a unsigned path stays.
      next();
      return;
    }

    // Headers present — verify regardless of flag state. A request that
    // CAN prove its identity SHOULD: this is defence in depth and
    // populates req.agentContext.signatureVerified=true so downstream
    // code can trust the attribution.
    const credential = await this.credentials.findById(id!);
    if (!credential) {
      this.logger.warn(`agent-signature.unknown_credential id=${id}`);
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_INVALID' });
    }
    if (credential.revokedAt) {
      this.logger.warn(`agent-signature.revoked_credential id=${id} agentName=${credential.agentName}`);
      throw new UnauthorizedException({ code: 'AGENT_CREDENTIAL_REVOKED' });
    }
    if (user?.organizationId && credential.organizationId !== user.organizationId) {
      // Cross-org signature attempt — never permitted.
      this.logger.warn(
        `agent-signature.cross_org_rejected id=${id} cred_org=${credential.organizationId} req_org=${user.organizationId}`,
      );
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_INVALID' });
    }

    // Timestamp + skew window
    const tsMs = Date.parse(ts!);
    if (!Number.isFinite(tsMs)) {
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_INVALID' });
    }
    const nowMs = Date.now();
    if (Math.abs(nowMs - tsMs) > TIMESTAMP_SKEW_MS) {
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_EXPIRED' });
    }

    // Replay protection
    if (this.nonces.has(nonce!, nowMs)) {
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_NONCE_REPLAYED' });
    }

    // Verify signature
    const envelope = buildEnvelope(req.method, req.originalUrl, ts!, nonce!, req.body);
    const ok = verifySignature(credential.publicKey, envelope, sig!);
    if (!ok) {
      throw new UnauthorizedException({ code: 'AGENT_SIGNATURE_INVALID' });
    }

    // Record nonce only after a fully-valid request — avoids storing nonces
    // for failed verifications (which an attacker could spam to fill the
    // LRU and evict legitimate nonces).
    this.nonces.add(nonce!, nowMs);

    // Stamp req.agentContext from the credential, NOT from headers.
    (req as Request).agentContext = {
      viaAgent: true,
      agentName: credential.agentName,
      capabilityName: readHeader(req, 'x-agent-capability'),
      signatureVerified: true,
    };
    next();
  }
}

/**
 * Canonical envelope: `method + '\n' + path + '\n' + timestamp + '\n' +
 * nonce + '\n' + body`. Body is the JSON-stringified parsed request body
 * (or empty string for GET/DELETE without body). Per ADR-AGENT-SIG-2.
 */
export function buildEnvelope(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: unknown,
): Buffer {
  const bodyText = body === undefined || body === null ? '' : JSON.stringify(body);
  const text = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyText}`;
  return Buffer.from(text, 'utf8');
}

/**
 * Verify Ed25519 signature using the SPKI/DER-encoded base64 public key.
 * Returns false on any parse / verify error rather than throwing — the
 * middleware translates the boolean into a 401 with the appropriate code.
 */
export function verifySignature(
  publicKeyB64: string,
  envelope: Buffer,
  signatureB64: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const sig = Buffer.from(signatureB64, 'base64');
    return verify(null, envelope, key, sig);
  } catch {
    return false;
  }
}
