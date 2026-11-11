/**
 * End-to-end smoke test in a real browser (Playwright/Chromium).
 * Start the app first (npm start), then:
 *   WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip node scripts/e2e-smoke.mjs [baseUrl] [screenshotDir]
 * Covers: import via UI, search, open record, edit + persist, relationships, campaign, encounter, player view safety.
 */
import { createRequire } from 'node:module';
// Uses a locally or globally installed Playwright (npm i -D playwright if missing).
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4310';
const shots = process.argv[3] ?? null;
const archive = process.env.WORLDKEEPER_TEST_ARCHIVE;
const errors = [];
const step = (m) => console.log('✓', m);
const shot = async (page, name) => shots && (fs.mkdirSync(shots, { recursive: true }), await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
const expectText = async (t, timeout = 15000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });

try {
  await page.goto(base);
  const entities = await (await fetch(`${base}/api/meta`)).json();
  if (entities.entities === 0) {
    if (!archive) throw new Error('Library is empty; set WORLDKEEPER_TEST_ARCHIVE');
    await expectText('Your world is waiting');
    await page.goto(`${base}/import`);
    await page.setInputFiles('input[type=file]', archive);
    await page.getByRole('button', { name: 'Preview import' }).click();
    await expectText('Broken references', 60000);
    await shot(page, '01-import-preview');
    await page.getByRole('button', { name: 'Confirm import' }).click();
    await expectText('Import complete', 120000);
    step('imported archive through the UI');
  }
  await page.goto(base);
  await expectText('World Dashboard');
  await expectText('Kaelmar');
  await shot(page, '02-dashboard');
  step('dashboard shows real branches');

  await page.keyboard.press('Control+k');
  await page.getByLabel('Search query').fill('Mara Venn');
  await expectText('NPC-010');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/e\/NPC-010/);
  await expectText('GM only');
  await shot(page, '03-record');
  step('search → open NPC record, GM section flagged');

  // Edit and persist
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const notes = page.locator('textarea').last();
  const marker = `E2E note ${Date.now()}`;
  await notes.fill(marker);
  await expectText('All changes saved', 10000);
  await page.reload();
  await expectText(marker);
  step('edit autosaves and survives reload');

  // Relationships tab
  await page.getByRole('tab', { name: /Relationships/ }).click();
  await page.getByRole('button', { name: 'Add relationship' }).waitFor();
  step('relationships tab');

  await page.goto(`${base}/graph?focus=FAC-302`);
  await page.locator('.react-flow__node').first().waitFor({ timeout: 15000 });
  await shot(page, '04-graph');
  step('relationship graph renders');

  await page.goto(`${base}/kaelmar/vaults`);
  await expectText('The Thirteen Vaults');
  const sealed = await page.getByText('Sealed', { exact: true }).count();
  if (sealed < 13) throw new Error(`expected 13 sealed vaults, saw ${sealed}`);
  await shot(page, '05-vaults');
  step('13 vaults sealed by default');

  await page.goto(`${base}/ethereal/explorer`);
  await expectText('Deep domains');
  await page.getByRole('button', { name: /The Black Horizon/ }).click();
  await expectText('ETH-507');
  await shot(page, '06-ethereal');
  step('ethereal explorer');

  // Campaign
  await page.goto(`${base}/campaigns`);
  await page.locator('input').nth(1).fill('E2E Campaign');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/campaign$/);
  await page.goto(`${base}/campaign/live`);
  await page.getByRole('button', { name: /Start session/ }).click();
  await expectText('Live · Session 1');
  await page.getByPlaceholder('What happened? (Ctrl+Enter to save)').fill('The party arrived at the Crooked Nail.');
  await page.getByRole('button', { name: 'Save to log' }).click();
  await expectText('The party arrived at the Crooked Nail.');
  page.once('dialog', (d) => d.accept('Ambush'));
  await page.getByRole('button', { name: 'New encounter' }).click();
  await page.getByPlaceholder('Bandit, wolf…').fill('Bandit');
  await page.locator('input').filter({ hasText: '' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Roll missing' }).click();
  await page.getByRole('button', { name: 'Start combat' }).click();
  await expectText('Round 1');
  await shot(page, '07-live');
  step('live session: log + encounter with initiative');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForURL(/\/session\//);
  await page.getByRole('tab', { name: 'Recap' }).click();
  await page.getByRole('button', { name: /Generate draft/ }).click();
  await expectText('Crooked Nail');
  step('recap draft generated from recorded log');

  // Player view safety
  const playerList = await (await fetch(`${base}/api/player/entities`)).json();
  if (playerList.length !== 0) throw new Error('player view should be empty before any reveal');
  await page.goto(`${base}/player`);
  await expectText('has not revealed any lore');
  await shot(page, '08-player');
  step('player view empty until reveal');

  // Atlas page loads
  await page.goto(`${base}/atlas`);
  await expectText('World Atlas');
  step('atlas page');
} catch (e) {
  errors.push(`FAILED: ${e.message}`);
  if (shots) await page.screenshot({ path: path.join(shots, 'failure.png') });
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('E2E smoke passed');
