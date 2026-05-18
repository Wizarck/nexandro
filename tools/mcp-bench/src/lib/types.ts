/**
 * Wave 1.13 [3c] — MCP-client benchmark types.
 *
 * The harness drives a fixed read-only capability matrix against any
 * transport that implements `Transport`. Three implementations ship:
 * Hermes (HTTP+SSE), Claude Desktop (stdio JSON-RPC), OpenCode (stdio
 * JSON-RPC). Each adapter is a thin shim — the harness owns timing,
 * stats collection, and reporting.
 */

export type CapabilityName =
  | 'recipes.read'
  | 'recipes.list'
  | 'ingredients.search'
  | 'menu-items.read';

export interface CapabilityCall {
  capability: CapabilityName;
  args: Record<string, unknown>;
}

export interface Transport {
  /** Human-readable name surfaced in the report metadata. */
  readonly name: string;
  /** Reported as "<name>@<version>" in the markdown header. */
  readonly version: string;

  /** Spawn the underlying process or open the network connection. */
  connect(): Promise<void>;

  /** Invoke one MCP capability; resolve with the response or reject on transport error. */
  invoke(call: CapabilityCall): Promise<unknown>;

  /** Tear down. Called on success path AND on error path. Must not throw. */
  disconnect(): Promise<void>;
}

export interface RunSample {
  capability: CapabilityName;
  /** ms */
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
}

export interface CapabilityStats {
  capability: CapabilityName;
  calls: number;
  ok: number;
  errors: number;
  /** ms */
  p50: number;
  p95: number;
  /** calls/sec — sustained rate over the run window */
  throughput: number;
  errorRate: number;
}

export interface BenchRunMeta {
  client: string;
  transport: string;
  version: string;
  /** ISO8601 UTC */
  startedAt: string;
  /** ISO8601 UTC */
  endedAt: string;
  /** seconds */
  durationSec: number;
  /** SHA — captured by the harness; may be empty when run outside a git checkout. */
  nexandroGitSha: string;
  /** Free-form environment notes — ${user}@${host}, OS, Node version. */
  env: string;
  capabilities: CapabilityName[];
  /** "INCOMPLETE — <reason>" when the adapter could not spawn / handshake. */
  status: 'OK' | string;
}

export interface BenchReport {
  meta: BenchRunMeta;
  rows: CapabilityStats[];
}
