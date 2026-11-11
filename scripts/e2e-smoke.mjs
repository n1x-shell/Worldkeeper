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
  await page.getByRole('button', { name: /Mara Venn/ }).first().waitFor();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/e\/NPC-010/);
  await expectText('GM only');
  await shot(page, '03-record');
  // Technical details are hidden unless debug mode is on.
  const recordText = await page.locator('main').innerText();
  for (const dev of ['NPC-010', 'Aetheris_Setting_Bible', 'cat/npc', 'Unspecified fields']) if (recordText.includes(dev)) throw new Error(`technical detail visible without debug: ${dev}`);
  await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debug: 'true' }) });
  await page.reload();
  await expectText('Aetheris_Setting_Bible.md');
  await expectText('Unspecified fields');
  await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debug: 'false' }) });
  await page.reload();
  await expectText('GM only');
  step('search → open NPC record, GM section flagged; technical details only in debug mode');

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
  await expectText('Deep domain');
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
  await expectText('The handbook is empty');
  await shot(page, '08-player');
  step('player view empty until reveal');

  // ---- v0.2: record-link suggestions while typing ----
  await page.goto(`${base}/e/NPC-010`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const notesBox = page.locator('textarea').last();
  await notesBox.fill('');
  await notesBox.pressSequentially('Owes a favour to @blind se');
  await page.getByRole('listbox', { name: 'Link a record' }).waitFor();
  await shot(page, '13-link-suggest');
  await page.keyboard.press('Enter');
  await notesBox.pressSequentially(' and drinks at @[Hollow Refuge].');
  const linked = await notesBox.inputValue();
  if (linked !== 'Owes a favour to @[The Blind Seer] and drinks at @[Hollow Refuge].') throw new Error(`link insert failed: ${linked}`);
  await expectText('All changes saved', 10000);
  await page.getByRole('button', { name: 'Done' }).click();
  const seer = page.locator('main a.wk-ref', { hasText: 'The Blind Seer' });
  await seer.first().waitFor();
  if ((await seer.first().getAttribute('href')) !== '/e/NPC-001') throw new Error('mention did not link to the record');
  if ((await page.locator('main a.wk-ref', { hasText: 'Hollow Refuge' }).first().getAttribute('href')) !== '/e/SET-001') throw new Error('typed @[Name] did not link');
  await shot(page, '13b-mentions-rendered');
  const rel = await (await fetch(`${base}/api/entities/NPC-010`)).json();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('textarea').last().fill('');
  await expectText('All changes saved', 10000);
  void rel;
  step('@ suggestions insert @[Name]; @[Name] renders as a link to the record');

  // ---- v0.2: NPC profile ----
  await page.getByRole('tab', { name: 'NPC profile' }).click();
  await expectText("The Refuge's neutrality."); // source text shown beside the DM's notes
  await expectText('UNDEFINED');
  if (await page.getByText('Section: Wants').count()) throw new Error('source caption visible without debug');
  const pronouns = page.getByLabel('Pronouns');
  await pronouns.fill('she/her (DM)');
  await expectText('All changes saved', 10000);
  await page.getByLabel('Attitude toward the party').fill('Cautiously friendly');
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole('tab', { name: 'NPC profile' }).click();
  if ((await page.getByLabel('Pronouns').inputValue()) !== 'she/her (DM)') throw new Error('profile value did not persist');
  await shot(page, '14-npc-profile');
  await page.getByLabel('Pronouns').fill('');
  await expectText('All changes saved', 10000);
  step('NPC profile: source values shown, DM values persist');

  // ---- v0.2: reveal during live session ----
  await page.goto(`${base}/campaign/live`);
  await page.getByText(/No live session|Reveal to players/).first().waitFor({ timeout: 15000 });
  const startBtn = page.getByRole('button', { name: /Start session/ });
  if (await startBtn.isVisible()) await startBtn.click();
  await expectText('Reveal to players');
  const revealPicker = page.getByPlaceholder('What did they learn about?');
  await revealPicker.fill('Mara Venn');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Reveal that it exists' }).click();
  await expectText('is now known to players');
  await page.getByRole('button', { name: 'Wants', exact: true }).click();
  await expectText('Revealed “Wants”');
  const secretChip = page.getByRole('button', { name: /Secrets \(GM only\)/ });
  if (!(await secretChip.isDisabled())) throw new Error('GM-only section chip must be disabled');
  await page.getByPlaceholder('A fact they learned, in your words').fill('She keeps one room of the inn locked.');
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expectText('Fact revealed.');
  await expectText('Revealed to players: section “Wants”');
  await shot(page, '15-live-reveal');
  const pe = await (await fetch(`${base}/api/player/entities/NPC-010`)).json();
  if (!pe.sections.some((x) => x.heading === 'Wants') || !pe.facts.includes('She keeps one room of the inn locked.')) throw new Error('player view missing reveal');
  if (JSON.stringify(pe).includes('belongings from people she no longer remembers')) throw new Error('secret leaked to player view');
  // Undo the reveal so the suite can be rerun.
  await fetch(`${base}/api/entities/NPC-010`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revealed: false, revealed_sections: [], revealed_facts: [] }) });
  step('live reveal: record, section and fact reach players; secrets do not');

  // ---- v0.2: timeline era filter ----
  await page.goto(`${base}/timeline?era=after-bloom`);
  await expectText('22 AB');
  if (await page.getByText('Before any Aetherfall').count()) throw new Error('era filter not applied');
  await page.goto(`${base}/timeline?era=__none`);
  const sel = page.getByLabel('Era for Before any Aetherfall');
  await sel.selectOption('before-the-cycle');
  await page.waitForTimeout(800);
  await page.goto(`${base}/timeline?era=before-the-cycle&group=1`);
  await expectText('Before any Aetherfall');
  await shot(page, '16-timeline-eras');
  await page.getByLabel('Era for Before any Aetherfall').selectOption('');
  step('timeline era filter + manual era assignment');

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
