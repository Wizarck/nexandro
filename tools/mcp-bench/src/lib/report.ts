import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { BenchReport } from './types.js';

/**
 * Write a markdown report to `docs/bench/<YYYY-MM-DD>-<client>.md`. The path
 * is resolved relative to the repo root (passed in as `repoRoot` so the
 * function is unit-testable without filesystem coupling). Returns the
 * absolute output path.
 */
export function writeMarkdownReport(report: BenchReport, repoRoot: string): string {
  const date = report.meta.startedAt.slice(0, 10);
  const slug = report.meta.client.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const out = resolve(repoRoot, 'docs', 'bench', `${date}-${slug}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderMarkdown(report), 'utf8');
  return out;
}

export function renderMarkdown(report: BenchReport): string {
  const lines: string[] = [];
  lines.push(`# MCP-client bench — ${report.meta.client}`);
  lines.push('');
  lines.push(`> Status: **${report.meta.status}**`);
  lines.push('');
  lines.push('## Run metadata');
  lines.push('');
  lines.push(`- **Client**: ${report.meta.client}`);
  lines.push(`- **Transport**: ${report.meta.transport}`);
  lines.push(`- **Version**: ${report.meta.version}`);
  lines.push(`- **Started**: ${report.meta.startedAt}`);
  lines.push(`- **Ended**: ${report.meta.endedAt}`);
  lines.push(`- **Duration**: ${report.meta.durationSec}s`);
  lines.push(`- **nexandro git SHA**: \`${report.meta.nexandroGitSha || '(unknown)'}\``);
  lines.push(`- **Environment**: ${report.meta.env}`);
  lines.push(`- **Capabilities**: ${report.meta.capabilities.join(', ')}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  if (report.rows.length === 0) {
    lines.push('_No samples collected._');
    lines.push('');
  } else {
    lines.push('| Capability | Calls | OK | Errors | p50 (ms) | p95 (ms) | Throughput (req/s) | Error rate |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of report.rows) {
      lines.push(
        `| \`${r.capability}\` | ${r.calls} | ${r.ok} | ${r.errors} | ${r.p50} | ${r.p95} | ${r.throughput} | ${(r.errorRate * 100).toFixed(2)}% |`,
      );
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('Wave 1.13 [3c] · `tools/mcp-bench/` · `pnpm exec tsx run.ts --client=<name>`');
  lines.push('');
  return lines.join('\n');
}
