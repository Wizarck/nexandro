// Playwright walk → screenshots for v2 UX roundtable audit.
// Run: node scripts/audit-screenshots-v2.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.AUDIT_BASE_URL ?? 'https://nexandro.palafitofood.com';
const OUT = join(process.cwd(), 'docs', 'audit-2026-05-18-v2-screenshots');
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { slug: '01-dashboard', path: '/owner-dashboard' },
  { slug: '02-recall-search', path: '/recall/investigate' },
  { slug: '03-haccp', path: '/haccp/record' },
  { slug: '04-ai-obs', path: '/ai-obs/dashboard' },
  { slug: '05-foto-ingestion', path: '/photo-ingest/review' },
  { slug: '06-compliance-export', path: '/compliance/export' },
  { slug: '07-auditoria', path: '/audit-log' },
  { slug: '08-cola-revision', path: '/m3/review-queue' },
  { slug: '09-settings-negocio', path: '/owner-settings/negocio' },
  { slug: '10-settings-etiquetas', path: '/owner-settings/etiquetas' },
  { slug: '11-settings-privacidad', path: '/owner-settings/privacidad' },
  { slug: '12-onboarding-negocio', path: '/onboarding/negocio' },
  { slug: '13-onboarding-listo', path: '/onboarding/listo' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    locale: 'es-ES',
  });
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    const url = BASE + r.path;
    const file = join(OUT, `${r.slug}-${vp.name}.png`);
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: file, fullPage: true });
      results.push({ slug: r.slug, vp: vp.name, status: resp?.status() ?? 'no-resp', ok: true, file });
      console.log(`OK   ${vp.name} ${r.slug} ${resp?.status()}`);
    } catch (e) {
      results.push({ slug: r.slug, vp: vp.name, status: 'error', ok: false, error: String(e) });
      console.error(`FAIL ${vp.name} ${r.slug}: ${e.message}`);
    }
  }
  await ctx.close();
}

await browser.close();

console.log('\n--- Summary ---');
console.log(`Total: ${results.length}, OK: ${results.filter(r => r.ok).length}, FAIL: ${results.filter(r => !r.ok).length}`);
console.log(`Screenshots saved to: ${OUT}`);
