import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './report.js';
import type { BenchReport } from './types.js';

const sampleReport: BenchReport = {
  meta: {
    client: 'hermes',
    transport: 'hermes',
    version: '1.2.3',
    startedAt: '2026-05-07T00:00:00.000Z',
    endedAt: '2026-05-07T00:01:00.000Z',
    durationSec: 60,
    nexandroGitSha: 'abc1234',
    env: 'arturo@host (win32 node v22.0.0)',
    capabilities: ['recipes.read', 'recipes.list'],
    status: 'OK',
  },
  rows: [
    {
      capability: 'recipes.read',
      calls: 100,
      ok: 99,
      errors: 1,
      p50: 45.32,
      p95: 88.5,
      throughput: 1.65,
      errorRate: 0.01,
    },
  ],
};

describe('renderMarkdown', () => {
  it('emits a header, run-metadata block, results table, and footer', () => {
    const md = renderMarkdown(sampleReport);
    expect(md).toContain('# MCP-client bench — hermes');
    expect(md).toContain('Status: **OK**');
    expect(md).toContain('| `recipes.read` | 100 | 99 | 1 | 45.32 | 88.5 | 1.65 | 1.00% |');
    expect(md).toContain('Wave 1.13 [3c]');
    expect(md).not.toContain('NaN');
  });

  it('renders an empty-results placeholder cleanly', () => {
    const md = renderMarkdown({
      ...sampleReport,
      rows: [],
      meta: { ...sampleReport.meta, status: 'INCOMPLETE — spawn failed' },
    });
    expect(md).toContain('Status: **INCOMPLETE — spawn failed**');
    expect(md).toContain('_No samples collected._');
  });

  it('escapes nothing — capability strings use backticks for monospace', () => {
    const md = renderMarkdown(sampleReport);
    expect(md).toContain('| `recipes.read` |');
    // Future-proofing: if a capability name ever contained `|` we'd need
    // escaping. The CapabilityName union forbids it today.
  });
});
