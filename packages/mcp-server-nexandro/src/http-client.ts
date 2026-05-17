/**
 * Minimal fetch-based HTTP client used by every capability descriptor.
 *
 * Design notes (m2-mcp-server, design.md; extended by m2-mcp-write-capabilities):
 * - Uses the global `fetch` implementation. On Node 20+ this is undici, which
 *   keeps a per-origin keep-alive pool by default — connection pooling for
 *   the typical single-API deployment is therefore zero-config.
 * - Forwards `X-Via-Agent: true` and `X-Agent-Name: <agent>` on every
 *   request. The `apps/api/` `AgentAuditMiddleware` reads those headers,
 *   populates `req.agentContext`, and emits `AGENT_ACTION_EXECUTED`.
 * - Optional `X-Agent-Capability` header carries the MCP capability name
 *   (e.g. `recipes.read`) so the audit-log listener can attribute the
 *   exact descriptor that fired.
 * - Optional `Idempotency-Key` header is forwarded for write capabilities
 *   when the agent supplies one. The apps/api IdempotencyMiddleware
 *   deduplicates `(orgId, key)` and replays a cached response on retries.
 * - Non-2xx responses surface as a typed `RestApiError` (status + body).
 *   Capability descriptors decide whether to translate to MCP error codes.
 */

export type RestHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RestClientConfig {
  /** Base URL of `apps/api/` (e.g. `http://localhost:3000`). No trailing slash. */
  baseUrl: string;
  /** Forwarded as `X-Agent-Name`. */
  agentName: string;
  /** Optional bearer token forwarded as `Authorization: Bearer …`. */
  authToken?: string;
  /**
   * Override `fetch` — used by tests to inject a mock. Falls back to the
   * global `fetch` when not provided.
   */
  fetchImpl?: typeof fetch;
}

export interface RestRequestOptions {
  method?: RestHttpMethod;
  /** MCP capability descriptor name (e.g. `recipes.read`). Forwarded as `X-Agent-Capability`. */
  capabilityName: string;
  /** Path under `baseUrl` — MUST start with `/`. */
  path: string;
  /** Optional query params. Values are coerced to string; undefined entries are skipped. */
  query?: Record<string, string | number | undefined>;
  /**
   * Optional JSON body. Serialised as `application/json` for non-GET methods.
   * GET requests with a body are silently dropped — matches REST conventions.
   */
  body?: unknown;
  /**
   * Optional Idempotency-Key forwarded as the `Idempotency-Key` HTTP header.
   * Apps/api's IdempotencyMiddleware deduplicates `(organizationId, key)` and
   * replays cached responses. Only meaningful for write methods.
   */
  idempotencyKey?: string;
}

export class RestApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'RestApiError';
    this.status = status;
    this.body = body;
  }
}

function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function buildQueryString(query: RestRequestOptions['query']): string {
  if (!query) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    usp.append(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export class OpenTrattosRestClient {
  private readonly baseUrl: string;
  private readonly agentName: string;
  private readonly authToken: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RestClientConfig) {
    if (!config.baseUrl) {
      throw new Error('OpenTrattosRestClient: baseUrl is required');
    }
    if (!config.agentName) {
      throw new Error('OpenTrattosRestClient: agentName is required');
    }
    this.baseUrl = normaliseBaseUrl(config.baseUrl);
    this.agentName = config.agentName;
    this.authToken = config.authToken;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(opts: RestRequestOptions): Promise<T> {
    const method: RestHttpMethod = opts.method ?? 'GET';
    const url =
      this.baseUrl + opts.path + buildQueryString(opts.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Via-Agent': 'true',
      'X-Agent-Name': this.agentName,
      'X-Agent-Capability': opts.capabilityName,
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const init: RequestInit = { method, headers };
    if (method !== 'GET' && opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    const response = await this.fetchImpl(url, init);

    let parsedBody: unknown = undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        parsedBody = await response.json();
      } catch {
        parsedBody = undefined;
      }
    } else {
      try {
        parsedBody = await response.text();
      } catch {
        parsedBody = undefined;
      }
    }

    if (!response.ok) {
      throw new RestApiError(
        response.status,
        parsedBody,
        `OpenTrattos REST ${method} ${opts.path} failed: ${response.status}`,
      );
    }

    return parsedBody as T;
  }
}
