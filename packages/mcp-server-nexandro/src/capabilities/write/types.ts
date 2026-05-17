import type { z } from 'zod';

/**
 * REST verb supported by MCP write capabilities. GET is excluded — reads live
 * in `../<namespace>.ts` files and use the read-side handler shape.
 */
export type WriteHttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Declarative descriptor for a single MCP write tool.
 *
 * Per ADR-MCP-W-REGISTRY (m2-mcp-write-capabilities/design.md): every write
 * capability is one entry in a typed array. `buildServer()` loops the
 * registry and registers each tool with the MCP SDK; the handler renders
 * `restPathTemplate` with `restPathParams(input)`, extracts `restBodyExtractor(input)`
 * for the JSON body, optionally lifts query params via `restQueryExtractor`, and
 * forwards the resulting request through `OpenTrattosRestClient.request()`.
 */
export interface WriteCapability<TInput = unknown> {
  /**
   * MCP capability descriptor name (e.g. `recipes.create`). Mirrors the
   * `NEXANDRO_AGENT_<NAMESPACE>_<OP>_ENABLED` env var on apps/api so the
   * AgentCapabilityGuard can match on the `X-Agent-Capability` header.
   */
  name: string;
  /** Tool description shown to MCP clients. References the underlying REST endpoint. */
  description: string;
  /** Optional MCP "title" for richer UX. Falls back to `name`. */
  title?: string;
  /** Zod input shape (record form expected by `server.registerTool().inputSchema`). */
  schema: Record<string, z.ZodTypeAny>;
  /** REST verb (POST / PUT / PATCH / DELETE). */
  restMethod: WriteHttpMethod;
  /**
   * Path template with `:param` placeholders (e.g.
   * `/recipes/:id/lines/:lineId/source`). Static for a given capability —
   * `restPathParams` produces the substitutions per-call.
   */
  restPathTemplate: string;
  /**
   * Map input → path params. Returns string values; `renderPath` URL-encodes
   * each value before substituting it into the template.
   * Skipped (and not required) when the template carries no `:` tokens.
   */
  restPathParams?: (input: TInput) => Record<string, string>;
  /**
   * Map input → JSON body. Defaults to passing `input` through unchanged.
   * Use this to strip path params + query params from the body, or to supply
   * `undefined` for body-less endpoints.
   */
  restBodyExtractor?: (input: TInput) => unknown;
  /**
   * Map input → query string. Used by writes that take `?organizationId=` etc.
   * Returned values follow the same coercion rules as `RestRequestOptions.query`.
   */
  restQueryExtractor?: (
    input: TInput,
  ) => Record<string, string | number | undefined>;
  /**
   * When true (default), forward `input.idempotencyKey` (if present) as the
   * `Idempotency-Key` HTTP header. Set `false` for endpoints where
   * idempotency makes no sense (none today; reserved for read-modify-write
   * endpoints that should never be cached).
   */
  forwardIdempotencyKey?: boolean;
}
