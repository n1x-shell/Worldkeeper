/**
 * The first run in a real browser (docs/OWN_WORLD_PLAN.md §2.6): a fresh install, one way or the other, Next, Next, Finish.
 * Start the app on an empty data folder first, then:
 *   node scripts/e2e-first-run.mjs <baseUrl> own [screenshotDir]
 *   node scripts/e2e-first-run.mjs <baseUrl> setting [screenshotDir]
 * "own" builds a world of one's own (shape, calendar, a campaign with a town and party, a map, the records that teach,
 * then removes them); "setting" adds the Worldkeeper worldbook (the whole world, with no file to choose) and starts a campaign in it.
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const [base = 'http://127.0.0.1:4310', mode = 'own', shots = null] = process.argv.slice(2);
const errors = [];
const step = (m) => console.log('✓', m);
const shot = async (page, name) => shots && (fs.mkdirSync(shots, { recursive: true }), await page.screenshot({ path: path.join(shots, `${name}.png`) }));
const api = (url, init) => fetch(`${base}${url}`, init).then((r) => r.json());

/** A small PNG to upload as the world's map. */
function mapPng() {
  const w = 400;
  const h = 250;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) row.set([60 + Math.floor((x * 120) / w), 110 + Math.floor((y * 80) / h), 70], 1 + x * 3);
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const file = path.join(os.tmpdir(), `wk-e2e-map-${process.pid}.png`);
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]),
  );
  return file;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
const next = () => page.getByRole('button', { name: /^Next/ }).click();

try {
  if (!(await api('/api/setup')).needed) throw new Error('This library is not fresh: start the app on an empty data folder');
  await page.goto(base);
  await page.waitForURL(/\/start$/);
  await page.getByText('How would you like to start?').waitFor();
  await shot(page, '01-welcome');
  step('a fresh library opens on Start your world');

  if (mode === 'own') {
    await page.getByRole('button', { name: /Build my own world/ }).click();
    await page.getByLabel('World name').fill('Ostmark');
    await page.getByLabel('Pitch').fill('A cold world of iron kings and drowned gods.');
    await page.getByRole('radio', { name: 'Set it now' }).click();
    await page.getByLabel('Starting year').fill('1247');
    await page.getByLabel('Year name').fill('AR');
    await page.getByText('First Month 1, 1247 AR').waitFor();
    await shot(page, '02-world');
    await next();
    await page.getByRole('radio', { name: /A world and another plane/ }).click();
    await page.getByLabel('Continent 1').fill('Vael');
    await page.getByLabel('Plane 2').fill('The Drowned Court');
    await shot(page, '03-shape');
    await next();
    await page.getByText('SRD 5.2.1').waitFor();
    await next();
    await page.getByLabel('Campaign name').fill('The Iron Crown');
    await page.getByLabel('Town name').fill('Harrowgate');
    await page.getByLabel('Party').fill('Ash\nBree\nCorvin');
    await next();
    await page.getByLabel('Map image').setInputFiles(mapPng());
    await next();
    await shot(page, '04-finish');
    await page.getByRole('button', { name: /Create my world/ }).click();
    await page.waitForURL(`${base}/`);
    await page.getByText('Getting started').waitFor();
    await shot(page, '05-dashboard');
    const realms = (await api('/api/realms')).map((r) => r.name);
    if (!['Ostmark', 'Vael', 'The Drowned Court'].every((n) => realms.includes(n))) throw new Error(`realms: ${realms}`);
    const camp = await api(`/api/campaigns/${(await api('/api/campaigns/active')).id}`);
    if (camp.title !== 'The Iron Crown' || !camp.starting_location_id) throw new Error('campaign');
    const chars = await api(`/api/characters?campaign_id=${camp.id}`);
    if (chars.length !== 3) throw new Error(`party: ${chars.length}`);
    const maps = await api('/api/maps');
    const pins = await api(`/api/markers?map_id=${maps[0]?.id}`);
    if (maps.length !== 1 || pins.length !== 1) throw new Error('map and its pin');
    if ((await api('/api/meta')).canonReview !== false) throw new Error('own world should be Canon at once');
    step('own world: Next, Next, Finish made the world, its shape and calendar, a campaign with a town and party, a map with a pin');
    await page.getByRole('link', { name: 'Read Start Here' }).click();
    await page.getByRole('link', { name: 'The Lantern Inn' }).first().waitFor();
    await shot(page, '06-start-here');
    await page.getByRole('link', { name: 'World Dashboard' }).first().click();
    await page.getByRole('button', { name: /Remove the tutorial records/ }).click();
    await page.getByRole('button', { name: 'Remove them' }).click();
    await page.getByText(/Removed 5 tutorial records/).waitFor();
    const left = (await api('/api/entities')).map((e) => e.name);
    if (left.join() !== 'Harrowgate') throw new Error(`after removing the tutorial records: ${left}`);
    step('the records that teach: Start Here links to them, and they go in one click; the town stays');
  } else {
    await page.getByRole('button', { name: /Play in the Worldkeeper world/ }).click();
    await page.getByRole('button', { name: /Add the Worldkeeper worldbook/ }).click();
    await page.getByText('Added', { exact: true }).waitFor({ timeout: 180000 });
    await shot(page, '02-installed');
    await next();
    await page.getByText('Thinning, true names and memories').waitFor();
    await page.getByText('The Return (a clock)').click();
    await shot(page, '03-rules');
    await next();
    await page.getByLabel('Campaign name').fill('The Loose Thread');
    await page.getByLabel('Party').fill('Kit');
    await next();
    await next();
    await shot(page, '04-finish');
    await page.getByRole('button', { name: /Start playing/ }).click();
    await page.waitForURL(`${base}/`);
    const meta = await api('/api/meta');
    // The whole world came with the app: the archive's records and the new ones, the maps and the adventures.
    if (meta.entities < 878) throw new Error(`setting: ${meta.entities} records`);
    if ((await api('/api/maps')).length < 2) throw new Error('setting: the maps');
    const mods = (await api('/api/modules')).modules.filter((m) => m.on).map((m) => m.key);
    if (!meta.canonReview || !mods.includes('thinning') || mods.includes('the-return')) throw new Error(`setting: canonReview ${meta.canonReview}, modules ${mods}`);
    if ((await api(`/api/campaigns/${(await api('/api/campaigns/active')).id}`)).title !== 'The Loose Thread') throw new Error('campaign');
    await shot(page, '05-dashboard');
    step(`the Worldkeeper world: added whole (${meta.entities} records, its maps), a module unticked, a campaign started, Canon Review on`);
  }
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
console.log('First run E2E passed');
