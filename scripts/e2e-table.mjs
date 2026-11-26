/**
 * A session at the table, in real browsers (v0.9.20, docs/BETA_PLAN.md A4): the GM's app and two players' phones
 * together. Until now only the first-run wizard was driven automatically; the table, which is where a mistake would
 * show a secret to players, was only ever tried by hand.
 *
 * Start the app on an empty data folder first (with WORLDKEEPER_TABLE_PORT if 4320 is taken), then:
 *   node scripts/e2e-table.mjs <the GM app's address> [screenshot folder]
 *
 * It checks that:
 *   - the table is closed until the GM opens it, and unreachable again once closed;
 *   - players see what has been revealed and nothing else: not an unrevealed record, not an unrevealed section, not
 *     the GM's notes even when revealed by mistake; not in the page and not in anything the table's server answers;
 *     and the table's server refuses the GM's own API;
 *   - a character's page follows the GM's changes at once, and the GM's follows the player's;
 *   - a roll made on one phone shows on the GM's screen and on the other phone; a roll the GM keeps hidden does not.
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';

const [base = 'http://127.0.0.1:4310', shots = null] = process.argv.slice(2);
const step = (m) => console.log('✓', m);
const fail = (m) => {
  throw new Error(m);
};
const shot = async (page, name) => shots && (fs.mkdirSync(shots, { recursive: true }), await page.screenshot({ path: path.join(shots, `${name}.png`) }));
const call = async (url, method = 'GET', body) => {
  const r = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) fail(`${method} ${url} answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

const SECRET_NPC = 'Mirelle the Unseen';
const SECRET_LINE = 'The mill is a front for the Ashen Hand';
const GM_NOTE = 'Mirelle answers to the duke';
const PUBLIC_LINE = 'Mills line the river';

// ---- A small world: a town with something for players and something for the GM only, and a secret person -----------
await call('/api/setup/skip', 'POST', {});
const town = await call('/api/entities', 'POST', {
  type: 'settlement',
  realm: 'world',
  name: 'Harrowgate',
  // Three sections: one the GM will reveal, one left unrevealed, and one under a heading that says it is the GM's.
  body: `## A first look\n\n${PUBLIC_LINE}, and the bridge is older than the town.\n\n## Under the mill\n\n${SECRET_LINE}.\n\n## GM notes\n\n${GM_NOTE}.`,
});
await call('/api/entities', 'POST', { type: 'npc', realm: 'world', name: SECRET_NPC, summary: 'She runs the Ashen Hand from the mill.' });
const campaign = await call('/api/campaigns', 'POST', { title: 'The Iron Crown' });
await call('/api/campaigns/active', 'PUT', { id: campaign.id });
const hero = await call('/api/characters', 'POST', { campaign_id: campaign.id, name: 'Brakka' });
await call(`/api/characters/${hero.id}`, 'PATCH', {
  class_name: 'Fighter',
  level: 2,
  sheet: { abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 }, skills: ['Stealth'], maxHp: 20, hp: 20, ac: 15, hitDie: 'd10' },
});
const heroPage = await call(`/api/characters/${hero.id}/page`);
const handbook = await call(`/api/campaigns/${campaign.id}/handbook`);
const table = `http://127.0.0.1:${handbook.port}`;
const reachable = (url) =>
  fetch(url).then(
    (r) => r.status,
    () => null,
  );

const browser = await chromium.launch();
const errors = [];
const open = async (name, viewport) => {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${String(e).slice(0, 300)}`));
  return page;
};
const gm = await open('GM', { width: 1440, height: 1000 });
const phone = await open('player', { width: 420, height: 900 });
const other = await open('second player', { width: 420, height: 900 });
/** Everything the table's server answered to a phone, to look through for what must never be there. */
const heard = [];
for (const p of [phone, other])
  p.on('response', async (r) => {
    if (!r.url().startsWith(table) || !/json|text|javascript/.test(r.headers()['content-type'] ?? '')) return;
    // The app's own scripts are the same for everyone; what matters is what the server says about this world.
    if (!r.url().includes('/api/')) return;
    try {
      heard.push({ url: r.url(), text: await r.text() });
    } catch {
      /* a stream that stays open (the live view) has no end to read */
    }
  });

try {
  // ---- The table is closed until the GM opens it --------------------------------------------------------------------
  if ((await reachable(`${table}/api/health`)) !== null) fail('The table answers before the GM has opened it');
  await gm.goto(`${base}/campaign`);
  await gm.getByTestId('table-status').waitFor();
  await gm.getByRole('button', { name: 'Open the table' }).click();
  await gm.getByTestId('table-status').getByText('The table is open').waitFor();
  await shot(gm, '1-table-open');
  step('the table is closed until the GM opens it');

  // ---- Players see only what is revealed ----------------------------------------------------------------------------
  const browse = `${table}/player/c/${handbook.code}/browse/all`;
  await phone.goto(browse);
  await phone.locator('main').waitFor();
  await phone.waitForLoadState('networkidle');
  if ((await phone.locator('body').innerText()).includes('Harrowgate')) fail('A phone shows a record nobody revealed');
  // The GM's own API is not on the table's server at all.
  for (const url of ['/api/entities', `/api/entities/${town.id}`, '/api/diagnostics', '/api/backups', '/api/export/json']) {
    const status = await reachable(`${table}${url}`);
    if (status === 200) fail(`The table's server answers the GM's ${url}`);
  }
  step('nothing is shown before it is revealed, and the table refuses the GM’s own API');

  // The GM reveals the town and its first section (as the Reveal buttons do), and by mistake the GM's notes too:
  // a section whose heading says it is the GM's is never shown, whatever is ticked.
  await call(`/api/entities/${town.id}`, 'PATCH', { revealed: true, revealed_sections: ['A first look', 'GM notes'] });
  await phone.goto(browse);
  await phone.getByText('Harrowgate').first().waitFor();
  await phone.getByText('Harrowgate').first().click();
  await phone.getByText(PUBLIC_LINE).first().waitFor();
  await shot(phone, '2-player-town');
  const seen = await phone.locator('body').innerText();
  if (seen.includes(SECRET_LINE) || seen.includes('Under the mill')) fail('A phone shows a section that was not revealed');
  if (seen.includes(GM_NOTE)) fail('A phone shows the GM’s notes (revealed by mistake, but a section headed as the GM’s must never be shown)');
  if (seen.includes(SECRET_NPC)) fail('A phone shows a record nobody revealed');
  step('a revealed record reaches the phone with its revealed section; the unrevealed one and the GM’s notes stay hidden');

  // ---- A character's page: the GM and the player see each other's changes at once -------------------------------------
  const hpIs = (page, n) => page.waitForFunction((v) => document.querySelector('[aria-label="Current hit points"]')?.value === String(v), n, { timeout: 8000 });
  await gm.goto(`${base}/campaign/party?character=${hero.id}`);
  await gm.locator('.ledger').first().waitFor();
  await phone.goto(`${table}/player/me/${heroPage.code}`);
  await phone.locator('.ledger').first().waitFor();
  await hpIs(phone, 20);
  await call(`/api/characters/${hero.id}`, 'PATCH', { sheet_patch: { set: { hp: 13 } } });
  await hpIs(phone, 13);
  await hpIs(gm, 13);
  await phone.getByLabel('Current hit points').first().fill('17');
  await hpIs(gm, 17);
  await shot(phone, '3-player-sheet');
  step('hit points changed by the GM reach the phone at once, and the player’s reach the GM');

  // ---- Rolls the whole table sees -------------------------------------------------------------------------------------
  await gm.goto(`${base}/dice`);
  const log = gm.getByTestId('table-rolls');
  await log.waitFor();
  await other.goto(`${table}/player/c/${handbook.code}`);
  await other.locator('main').waitFor();
  await phone.getByTestId('roll-bar').waitFor();
  await phone.getByRole('button', { name: 'Roll Stealth' }).click();
  await phone.waitForFunction(() => /Stealth/.test(document.querySelector('[data-testid="last-roll"]')?.textContent || ''));
  await log.getByText('Stealth').first().waitFor({ timeout: 8000 });
  const card = other.getByTestId('table-rolls-card');
  await card.waitFor({ timeout: 8000 });
  if (!/Brakka/.test(await card.innerText())) fail(`The second phone doesn't show whose roll it was: ${await card.innerText()}`);
  // A roll the GM keeps behind the screen stays there.
  await gm.getByLabel('What the roll is for').fill('Does the guard notice');
  await gm.getByRole('button', { name: 'Roll', exact: true }).click();
  await log.getByText('Does the guard notice').waitFor();
  await other.waitForTimeout(2500);
  if ((await other.locator('body').innerText()).includes('Does the guard notice')) fail('A roll the GM kept hidden shows on a phone');
  await shot(gm, '4-gm-rolls');
  await shot(other, '5-second-phone');
  step('a roll on one phone shows on the GM’s screen and on the other phone; the GM’s hidden roll does not');

  // ---- Nothing secret was ever said to a phone --------------------------------------------------------------------------
  for (const h of heard) for (const secret of [SECRET_LINE, GM_NOTE, SECRET_NPC, 'Ashen Hand']) if (h.text.includes(secret)) fail(`The table's server said something secret to a phone ("${secret}" in ${h.url})`);
  // (And what was looked through is the real thing: the revealed section came the same way.)
  if (!heard.some((h) => h.text.includes(PUBLIC_LINE))) fail('The answers looked through never held the revealed text either: the check is looking in the wrong place');
  step(`none of the ${heard.length} answers the table gave a phone held anything secret`);

  // ---- Closing the table ------------------------------------------------------------------------------------------------
  await gm.goto(`${base}/campaign`);
  await gm.getByRole('button', { name: 'Close the table' }).click();
  await gm.getByTestId('table-status').getByText('The table is closed').waitFor();
  if ((await reachable(`${table}/api/health`)) !== null) fail('The table still answers after the GM closed it');
  step('closing the table cuts the phones off');

  if (errors.length) fail(`Errors in the pages:\n${errors.join('\n')}`);
  step('no errors in any of the three pages');
} catch (e) {
  for (const [name, page] of [
    ['gm', gm],
    ['player', phone],
    ['second-player', other],
  ])
    await shot(page, `failed-${name}`).catch(() => undefined);
  await browser.close();
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
await browser.close();
console.log('E2E at the table passed');
