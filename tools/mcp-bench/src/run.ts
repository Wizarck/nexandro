#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { hostname, userInfo, platform } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { writeMarkdownReport } from './lib/report.js';
import { summarise } from './lib/stats.js';
import type {
  BenchReport,
  CapabilityCall,
  CapabilityName,
  RunSample,
  Transport,
} from './lib/types.js';
import { HermesTransport } from './transports/hermes.js';
import { claudeDesktopTransport, opencodeTransport } from './transports/stdio-jsonrpc.js';

const ALL_CAPABILITIES: CapabilityName[] = [
  'recipes.read',
  'recipes.list',
  'ingredients.search',
  'menu-items.read',
];

interface CliArgs {
  client: string;
  capabilities: CapabilityName[];
  durationSec: number;
  warmupSec: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.+)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  const client = args.client ?? '';
  if (!client) {
    throw new Error('--client=<hermes|claude-desktop|opencode> is required');
  }
  const caps = (args.capabilities ?? 'read,list,search')
    .split(',')
    .flatMap((slug) => {
      switch (slug.trim().toLowerCase()) {
        case 'read':
          return ['recipes.read', 'menu-items.read'] as CapabilityName[];
        case 'list':
          return ['recipes.list'] as CapabilityName[];
        case 'search':
          return ['ingredients.search'] as CapabilityName[];
        default:
          if ((ALL_CAPABILITIES as string[]).includes(slug)) {
            return [slug as CapabilityName];
          }
          return [];
      }
    });
  return {
    client,
    capabilities: caps.length > 0 ? caps : ALL_CAPABILITIES,
    durationSec: parseDuration(args.duration ?? '60s'),
    warmupSec: parseDuration(args.warmup ?? '5s'),
  };
}

function parseDuration(s: string): number {
  const m = /^(\d+)(s|m)?$/.exec(s.trim());
  if (!m) throw new Error(`bad duration: ${s}`);
  const n = Number(m[1]);
  return m[2] === 'm' ? n * 60 : n;
}

function readGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function makeTransport(client: string): Transport {
  switch (client) {
    case 'hermes':
      return new HermesTransport({
        baseUrl: process.env.NEXANDRO_HERMES_BASE_URL ?? 'http://127.0.0.1:8644',
        authSecret: process.env.NEXANDRO_HERMES_AUTH_SECRET ?? '',
        bankId: process.env.MCP_BENCH_BANK_ID ?? 'nexandro-bench',
        userId: process.env.MCP_BENCH_USER_ID ?? '00000000-0000-4000-8000-00000000bench',
      });
    case 'claude-desktop':
      return claudeDesktopTransport();
    case 'opencode':
      return opencodeTransport();
    default:
      throw new Error(`unknown client: ${client}`);
  }
}

function sampleArgsFor(cap: CapabilityName): Record<string, unknown> {
  switch (cap) {
    case 'recipes.read':
      return { id: process.env.MCP_BENCH_RECIPE_ID ?? 'sample-recipe' };
    case 'recipes.list':
      return { limit: 25 };
    case 'ingredients.search':
      return { query: process.env.MCP_BENCH_SEARCH_TERM ?? 'tomate' };
    case 'menu-items.read':
      return { id: process.env.MCP_BENCH_MENU_ITEM_ID ?? 'sample-menu-item' };
  }
}

async function runBench(args: CliArgs): Promise<BenchReport> {
  const transport = makeTransport(args.client);
  const startedAt = new Date();
  const samples: RunSample[] = [];
  let status: BenchReport['meta']['status'] = 'OK';

  try {
    await transport.connect();
  } catch (err) {
    status = `INCOMPLETE — ${(err as Error).message}`;
    const endedAt = new Date();
    return buildReport(args, transport, startedAt, endedAt, samples, status);
  }

  try {
    // Warmup — discarded.
    await driveCapabilities(transport, args.capabilities, args.warmupSec * 1000, () => {});
    // Measured window.
    await driveCapabilities(transport, args.capabilities, args.durationSec * 1000, (s) => samples.push(s));
  } catch (err) {
    status = `INCOMPLETE — ${(err as Error).message}`;
  } finally {
    try {
      await transport.disconnect();
    } catch {
      // ignore
    }
  }

  return buildReport(args, transport, startedAt, new Date(), samples, status);
}

async function driveCapabilities(
  transport: Transport,
  caps: CapabilityName[],
  windowMs: number,
  emit: (s: RunSample) => void,
): Promise<void> {
  const deadline = Date.now() + windowMs;
  let i = 0;
  while (Date.now() < deadline) {
    const cap = caps[i % caps.length];
    i++;
    const call: CapabilityCall = { capability: cap, args: sampleArgsFor(cap) };
    const t0 = performance.now();
    try {
      await transport.invoke(call);
      emit({ capability: cap, durationMs: +(performance.now() - t0).toFixed(2), ok: true });
    } catch (err) {
      emit({
        capability: cap,
        durationMs: +(performance.now() - t0).toFixed(2),
        ok: false,
        errorMessage: (err as Error).message,
      });
    }
  }
}

function buildReport(
  args: CliArgs,
  transport: Transport,
  startedAt: Date,
  endedAt: Date,
  samples: RunSample[],
  status: BenchReport['meta']['status'],
): BenchReport {
  const durationSec = +((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  return {
    meta: {
      client: args.client,
      transport: transport.name,
      version: transport.version,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSec,
      nexandroGitSha: readGitSha(),
      env: `${userInfo().username}@${hostname()} (${platform()} node ${process.version})`,
      capabilities: args.capabilities,
      status,
    },
    rows: summarise(samples, args.durationSec),
  };
}

function repoRoot(): string {
  // Resolve relative to the source file: tools/mcp-bench/src/run.ts → repo root is two levels up.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  const report = await runBench(args);
  const path = writeMarkdownReport(report, repoRoot());
  // eslint-disable-next-line no-console
  console.log(`bench: ${report.meta.status} — wrote ${path}`);
  return report.meta.status === 'OK' ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
