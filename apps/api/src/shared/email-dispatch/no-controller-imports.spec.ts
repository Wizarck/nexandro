import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Static-analysis smoke per Requirement 9 of the email-dispatch spec.
 *
 * Walks `apps/api/src/**` for `*.controller.ts` files and asserts NONE
 * of them imports `EmailDispatchService`, `EMAIL_DISPATCH_SERVICE`, or
 * any module from `shared/email-dispatch/`.
 *
 * Rationale: `dispatch()` may take up to 21s in worst case (3 retries
 * × 16s); calling from a request handler would block beyond the p99
 * SLO. Subscribers + background jobs are the canonical caller pattern.
 *
 * The test lives next to the email-dispatch module so it is exercised
 * by the same `jest` command as the rest of the BC.
 */

const FORBIDDEN_PATTERNS = [
  /from\s+['"]\.\.\/.*email-dispatch/,
  /from\s+['"]\.\.\/.*shared\/email-dispatch/,
  /EMAIL_DISPATCH_SERVICE/,
  /EmailDispatchService/,
];

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      await walk(full, acc);
    } else if (e.isFile() && e.name.endsWith('.controller.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('no controller imports EmailDispatchService', () => {
  it('zero controllers reference EmailDispatchService', async () => {
    // src directory is two levels up from this spec
    // (apps/api/src/shared/email-dispatch/<spec> → apps/api/src)
    const srcRoot = path.resolve(__dirname, '..', '..');
    const controllers = await walk(srcRoot);
    const offenders: Array<{ file: string; line: string }> = [];
    for (const file of controllers) {
      const text = await fs.readFile(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (FORBIDDEN_PATTERNS.some((re) => re.test(line))) {
          offenders.push({ file, line: line.trim() });
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `${path.relative(srcRoot, o.file)}: ${o.line}`)
        .join('\n');
      throw new Error(
        `EmailDispatchService must be called from @OnEvent subscribers ` +
          `or background jobs, never from controllers. Offending imports:\n${msg}`,
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
