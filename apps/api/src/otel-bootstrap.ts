/**
 * OpenTelemetry SDK PRE-BOOTSTRAP.
 *
 * This module MUST be imported as the FIRST line of `main.ts` (before
 * `@nestjs/core`, before `AppModule`, before anything else). NestJS
 * instantiates its entire DI container during `NestFactory.create()` and
 * emits startup spans for every module-init hook; if the SDK boots inside
 * an `@Module()` provider's `onModuleInit()`, those startup spans are
 * lost.
 *
 * See ADR-VISION-OTEL-PRE-BOOTSTRAP (`design.md` §Decisions).
 *
 * Environment:
 *  - `OPENTRATTOS_OTEL_DISABLED` — `true` to disable exporter entirely
 *    (spans still emit in-process but go to a no-op processor). Default:
 *    `false`.
 *  - `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT` — OTLP/HTTP traces endpoint.
 *    Default: `http://localhost:4318/v1/traces`.
 *  - `OPENTRATTOS_OTEL_EXPORTER_HEADERS` — comma-separated `key=value`
 *    pairs for tenant auth.
 *  - `OPENTRATTOS_OTEL_SERVICE_NAME` — `service.name` resource attribute.
 *    Default: `opentrattos-api`.
 *
 * Rollback: set `OPENTRATTOS_OTEL_DISABLED=true` and redeploy. No code
 * change required.
 */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { NodeSDK } from '@opentelemetry/sdk-node';

const SERVICE_NAME_DEFAULT = 'opentrattos-api';
const ENDPOINT_DEFAULT = 'http://localhost:4318/v1/traces';

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=').trim();
    const cleanKey = key?.trim();
    if (cleanKey && value) {
      out[cleanKey] = value;
    }
  }
  return out;
}

function isDisabled(): boolean {
  return String(process.env.OPENTRATTOS_OTEL_DISABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Initialize and start the OTel Node.js SDK. Idempotent — calling twice
 * has no additional effect (NodeSDK guards against double-start).
 *
 * Returns the SDK instance for test introspection. In production this
 * runs at module-load time via the side-effect `import` below.
 */
export function startOtelSdk(): NodeSDK | null {
  if (isDisabled()) {
    return null;
  }

  const serviceName = process.env.OPENTRATTOS_OTEL_SERVICE_NAME ?? SERVICE_NAME_DEFAULT;
  const endpoint = process.env.OPENTRATTOS_OTEL_EXPORTER_ENDPOINT ?? ENDPOINT_DEFAULT;
  const headers = parseHeaders(process.env.OPENTRATTOS_OTEL_EXPORTER_HEADERS);

  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers,
  });

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: exporter,
    instrumentations: [new HttpInstrumentation(), new NestInstrumentation()],
  });

  sdk.start();

  const shutdown = async (): Promise<void> => {
    try {
      await sdk.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('OTel SDK shutdown error:', err);
    }
  };

  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  return sdk;
}

// Side-effect: start the SDK at module-load time. `main.ts` imports this
// module as its very first statement, so the SDK is live before any
// NestJS code resolves.
startOtelSdk();
