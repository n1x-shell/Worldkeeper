/**
 * Can everyone use it? (v0.9.22, docs/BETA_PLAN.md A6.) The main screens of the GM's app and the players' handbook,
 * in both themes, checked by machine for what a machine can find:
 *
 *   - the accessibility rules of WCAG 2.1 and 2.2, levels A and AA, as axe-core tests them: text that is too faint to
 *     read, controls with no name for a screen reader, pictures with no description, form fields with no label, and
 *     the like;
 *   - on a tablet held either way, nothing runs off the side of the screen;
 *   - with the keyboard alone: the first Tab offers "Skip to the page", every stop on the way has a name and can be
 *     seen to have the focus, and a dialog keeps the focus inside it and gives it back when closed;
 *   - going from one screen to another changes the window's title and tells a screen reader which screen it is.
 *
 * A machine finds perhaps a third of what gets in a person's way; this does not replace trying the app with a screen
 * reader. Start the app on an empty data folder first, then:
 *   node scripts/e2e-a11y.mjs <the GM app's address> [folder for screenshots] [--report]
 * With --report it lists everything it finds and always exits 0; without, anything found fails it.
 */
import { createRequire } from 'node:module';
// Playwright is installed where the tests run, not with the project (as in the other browser tests); axe-core is the
// project's own.
const { chromium } = createRequire(import.meta.url)('playwright');
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const report = args.includes('--report');
const [base = 'http://127.0.0.1:4310', shots = null] = args.filter((a) => !a.startsWith('--'));
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const step = (m) => console.log('✓', m);
const call = async (url, method = 'GET', body) => {
  const r = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${url} answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

// ---- A small world with something on every screen ---------------------------------------------------------------------
await call('/api/setup/skip', 'POST', {});
const town = await call('/api/entities', 'POST', {
  type: 'settlement',
  realm: 'world',
  name: 'Harrowgate',
  summary: 'A mill town on the river.',
  body: '## A first look\n\nMills line the river, and the bridge is older than the town.\n\n## Under the mill\n\nThe mill is a front.\n\n| Ward | Known for |\n| --- | --- |\n| Millside | Flour and gossip |\n| Bridge End | The toll |',
  tags: ['place/river'],
  fields: [['Terrain', 'River valley']],
});
const npc = await call('/api/entities', 'POST', { type: 'npc', realm: 'world', name: 'Mirelle Ashdown', summary: 'Keeps the mill.', body: `## A first look\n\nShe keeps the mill at Harrowgate [${town.id}].`, parent_id: town.id });
await call('/api/entities', 'POST', { type: 'faction', realm: 'world', name: 'The Ashen Hand', summary: 'Smugglers.', body: 'They move goods by night.' });
await call(`/api/entities/${town.id}`, 'PATCH', { revealed: true, revealed_sections: ['A first look'] });
await call(`/api/entities/${npc.id}`, 'PATCH', { revealed: true, revealed_sections: ['A first look'] });
// The town's plan, kept with a key whose first place has an entry of every kind: the key's editor with all its parts.
const townPlan = (await call(`/api/entities/${town.id}/plan`)).suggested;
const entry = (kind, more = {}) => ({ id: `e-${kind}`, kind, title: `A ${kind}`, text: 'What there is to say about it.', ...more });
await call(`/api/entities/${town.id}/plan`, 'PUT', {
  ...townPlan,
  key: townPlan.names.map((name, i) => ({
    id: `r${i}`,
    name,
    drawnAs: name,
    aloud: i ? '' : 'Mills line the river.',
    items: i
      ? []
      : [
          entry('encounter', { creatures: [{ name: 'Skeleton', count: 3, id: 'srd:skeleton' }, { name: 'A thing with no stat block', count: 1 }] }),
          entry('trap', { dc: 13, damage: '2d10 piercing' }),
          entry('puzzle', { dc: 15 }),
          entry('hazard', { dc: 12, damage: '' }),
          entry('loot', { coins: '120 gp', things: [{ name: 'Potion of Healing', count: 2 }] }),
          entry('secret'),
          entry('clue'),
          entry('person', { entity: npc.id }),
          entry('note'),
        ],
  })),
});
const campaign = await call('/api/campaigns', 'POST', { title: 'The Iron Crown', premise: 'A crown, and who wears it.' });
await call('/api/campaigns/active', 'PUT', { id: campaign.id });
const hero = await call('/api/characters', 'POST', { campaign_id: campaign.id, name: 'Brakka' });
await call(`/api/characters/${hero.id}`, 'PATCH', {
  class_name: 'Fighter',
  level: 2,
  sheet: { abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 }, skills: ['Stealth'], maxHp: 20, hp: 17, ac: 15, hitDie: 'd10' },
});
const heroPage = await call(`/api/characters/${hero.id}/page`);
const handbook = await call(`/api/campaigns/${campaign.id}/handbook`);

/** The screens: an address, and what to wait for before looking. */
const GM = [
  ['the dashboard', '/'],
  ['the world', '/world'],
  ['a record', `/e/${town.id}`],
  ['a place’s plan', `/e/${town.id}/plan`],
  ['a place’s key, with a room open', `/e/${town.id}/plan?room=1`],
  ['a new record', '/new'],
  ['search results', '/search?q=harrowgate'],
  ['the campaign', '/campaign'],
  ['the party and a character sheet', `/campaign/party?character=${hero.id}`],
  ['sessions', '/campaign/sessions'],
  ['the GM screen', '/dm'],
  ['dice and rolls', '/dice'],
  ['the atlas', '/atlas'],
  ['the timeline', '/timeline'],
  ['generators', '/generators'],
  ['tags', '/tags'],
  ['backups', '/backups'],
  ['libraries', '/libraries'],
  ['settings', '/settings'],
  ['help', '/help/start'],
  ['quests', '/campaign/quests'],
  ['encounters', '/campaign/encounters'],
  ['the campaign calendar', '/campaign/calendar'],
  ['the journal', '/campaign/journal'],
  ['handouts', '/campaign/handouts'],
  ['treasure', '/campaign/treasure'],
  ['adventures', '/campaign/adventures'],
  ['the initiative tracker', '/tracker'],
  ['notes', '/notes'],
  ['worlds and realms', '/realms'],
  ['templates', '/templates'],
  ['worldbooks', '/worldbooks'],
  ['rules', '/rules'],
  ['bringing things in', '/import'],
  ['the consistency check', '/consistency'],
  ['change history', '/history'],
  ['find and replace', '/find-replace'],
  ['publishing', '/publish'],
  ['the graph', '/graph'],
  ['names', '/names'],
];
const PLAYERS = [
  ['the handbook', `/player/c/${handbook.code}`],
  ['the handbook’s records', `/player/c/${handbook.code}/browse/all`],
  ['a character’s page', `/player/me/${heroPage.code}`],
];

const browser = await chromium.launch();
const problems = [];
const note = (where, what) => {
  problems.push(`${where}: ${what}`);
};

/** A page ready to look at: loaded, its first data in, nothing still spinning. */
async function open(page, url) {
  await page.goto(`${base}${url}`);
  await page.waitForLoadState('networkidle');
  await page.locator('#main, main, [data-testid=player-app]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(250);
}

async function axe(page, where, only = null) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async (rules) => {
    const runOnly = rules ? { type: 'rule', values: rules } : { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] };
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly, resultTypes: ['violations'] });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.any[0]?.message ?? n.all[0]?.message ?? n.none[0]?.message ?? '').slice(0, 160) })),
      count: v.nodes.length,
    }));
  }, only);
  for (const v of result) {
    note(where, `${v.id} (${v.impact}, ${v.count}×): ${v.help}\n${v.nodes.map((n) => `      ${n.target}\n        ${n.html}${n.why ? `\n        ${n.why}` : ''}`).join('\n')}`);
  }
  return result.length;
}

// ---- The rules, on every screen, in both themes -------------------------------------------------------------------------
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, bypassCSP: true });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('wk.theme', t);
    } catch {
      /* no storage: the default theme */
    }
  }, theme);
  const page = await context.newPage();
  let found = 0;
  for (const [name, url] of [...GM, ...PLAYERS]) {
    await open(page, url);
    found += await axe(page, `${name} (${theme})`);
    if (shots && theme === 'light') {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `${name.replace(/[^a-z]+/gi, '-')}.png`) });
    }
  }
  // Things that open over a page.
  await open(page, '/');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search' }).waitFor();
  await page.getByLabel('Search query').fill('harrow');
  await page.waitForTimeout(500);
  found += await axe(page, `the search box open (${theme})`);
  await page.keyboard.press('Escape');
  step(`${GM.length + PLAYERS.length + 1} screens checked against the rules in the ${theme} theme${found ? `: ${found} kinds of problem` : ''}`);
  await context.close();
}

// ---- A tablet, held both ways --------------------------------------------------------------------------------------------
for (const [how, viewport] of [
  ['upright', { width: 820, height: 1180 }],
  ['on its side', { width: 1180, height: 820 }],
]) {
  const context = await browser.newContext({ viewport, hasTouch: true, bypassCSP: true });
  const page = await context.newPage();
  for (const [name, url] of [...GM, ...PLAYERS]) {
    await open(page, url);
    const over = await page.evaluate(() => {
      const wide = document.documentElement.scrollWidth - window.innerWidth;
      if (wide <= 1) return null;
      // What sticks out: the widest things that end past the right edge and aren't inside something that scrolls.
      const scrolls = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p !== document.documentElement && p !== document.body) return true;
        }
        return false;
      };
      const out = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !scrolls(el))
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
      return `${wide}px too wide (${out.join(', ') || 'something'})`;
    });
    if (over) note(`${name} (a tablet ${how})`, `the page runs off the side: ${over}`);
    // Things to press with a finger: at least 24 by 24, or far enough from their neighbours (WCAG 2.2, 2.5.8).
    await axe(page, `${name} (a tablet ${how})`, ['target-size']);
    if (shots && how === 'upright') await page.screenshot({ path: path.join(shots, `tablet-${name.replace(/[^a-z]+/gi, '-')}.png`) });
  }
  step(`${GM.length + PLAYERS.length} screens looked at on a tablet held ${how}`);
  await context.close();
}

// ---- The keyboard alone ----------------------------------------------------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.labels?.[0]?.textContent ?? '') || el.textContent || el.getAttribute('placeholder') || '';
      // Seen to have the focus: an outline or a ring (box-shadow) on it, or on the box it is the inside of (the
      // long-text editor draws its ring round the whole editor).
      const ringed = (x) => {
        const c = getComputedStyle(x);
        return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none';
      };
      let shown = ringed(el);
      for (let p = el.parentElement, n = 0; !shown && p && n < 3; p = p.parentElement, n++) shown = p.matches(':focus-within') && ringed(p) && p !== document.body;
      return { tag: el.tagName.toLowerCase(), name: name.trim().replace(/\s+/g, ' ').slice(0, 40), shown, onScreen: r.width > 0 && r.height > 0, inMain: !!el.closest('#main') };
    });

  for (const [name, url] of [
    ['the dashboard', '/'],
    ['a record', `/e/${town.id}`],
    ['the campaign', '/campaign'],
    ['settings', '/settings'],
  ]) {
    await open(page, url);
    await page.keyboard.press('Tab');
    const first = await focused();
    if (!first || !/skip/i.test(first.name)) note(`${name} (keyboard)`, `the first Tab is not "Skip to the page" but ${first ? `"${first.name}" (${first.tag})` : 'nothing'}`);
    else {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      const after = await focused();
      if (!after?.inMain) note(`${name} (keyboard)`, `after "Skip to the page", the next Tab is not in the page but on ${after ? `"${after.name}"` : 'nothing'}`);
    }
    await open(page, url);
    const unnamed = [];
    const unseen = [];
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      // The long-text editor draws its ring a moment after it takes the focus.
      await page.waitForTimeout(60);
      const f = await focused();
      if (!f) continue;
      if (!f.name) unnamed.push(f.tag);
      if (!f.shown || !f.onScreen) unseen.push(f.name || f.tag);
    }
    if (unnamed.length) note(`${name} (keyboard)`, `${unnamed.length} stops with no name: ${[...new Set(unnamed)].join(', ')}`);
    if (unseen.length) note(`${name} (keyboard)`, `${unseen.length} stops where the focus can't be seen: ${[...new Set(unseen)].slice(0, 8).join('; ')}`);
  }
  step('the keyboard alone: the way to skip to the page, and 45 stops on each of four screens');

  // Going to another screen says so: the window's title is the screen's, and a screen reader is told its heading.
  await open(page, '/settings');
  await page.getByRole('link', { name: 'Backups' }).first().click();
  const told = await page
    .waitForFunction(() => document.title.startsWith('Backups') && document.querySelector('[data-testid=page-announcer]')?.textContent === 'Backups', null, { timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  if (!told) note('going to another screen', `nothing says which screen it is (the title is "${await page.title()}", and what is said is "${await page.getByTestId('page-announcer').textContent()}")`);
  step('going to another screen changes the window’s title and tells a screen reader');

  // A dialog keeps the focus, closes on Escape, and gives the focus back.
  await open(page, '/');
  await page.getByRole('button', { name: /^Search/ }).first().focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.waitFor();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
    if (!inside) {
      note('the search box (keyboard)', 'Tab leaves the dialog while it is open');
      break;
    }
  }
  await page.keyboard.press('Escape');
  const closed = await dialog.waitFor({ state: 'hidden', timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (!closed) note('the search box (keyboard)', 'Escape does not close it once the focus has left its text box');
  else {
    const back = await focused();
    if (!back || !/search/i.test(back.name)) note('the search box (keyboard)', `closing it does not give the focus back to what opened it (it is on ${back ? `"${back.name}"` : 'nothing'})`);
  }
  step('a dialog keeps the focus and gives it back');
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} thing${problems.length === 1 ? '' : 's'} found:\n`);
  for (const p of problems) console.log(`  ✗ ${p}\n`);
  if (!report) process.exit(1);
} else console.log('E2E accessibility passed');
