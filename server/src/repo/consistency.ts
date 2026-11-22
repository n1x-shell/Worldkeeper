/**
 * The consistency checker: a report of things in the library that don't agree with each other. It changes nothing;
 * each problem links to the records involved, to fix by hand.
 */
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { treasureData } from './treasure.js';
import { types } from './recordTypes.js';

export interface Problem {
  check: string;
  severity: 'error' | 'warning';
  message: string;
  ids: string[];
}

const REF = /\[([A-Z]{2,5}-\d{3,4}(?:-[A-Z]+)?)\]/g;

export function consistencyReport(db: DB): { checked: number; problems: Problem[] } {
  const out: Problem[] = [];
  const all = db.prepare('SELECT id, name, type, body, player_summary, parent_raw, parent_id, archived, redirect_to FROM entities').all() as {
    id: string;
    name: string;
    type: string;
    body: string;
    player_summary: string;
    parent_raw: string | null;
    parent_id: string | null;
    archived: number;
    redirect_to: string | null;
  }[];
  const ids = new Set(all.map((e) => e.id));
  const archived = new Set(all.filter((e) => e.archived).map((e) => e.id));
  const name = new Map(all.map((e) => [e.id, e.name]));
  const add = (check: string, severity: Problem['severity'], message: string, list: string[]) => out.push({ check, severity, message, ids: list });

  // 1. Records that cite a record that doesn't exist.
  for (const e of all) {
    if (e.archived) continue;
    const missing = new Set<string>();
    for (const m of `${e.body}\n${e.player_summary}`.matchAll(REF)) if (!ids.has(m[1])) missing.add(m[1]);
    if (missing.size) add('Missing records cited', 'error', `${e.name} cites ${[...missing].join(', ')}, which ${missing.size === 1 ? "doesn't" : "don't"} exist.`, [e.id]);
  }

  // 2. Links to records that don't exist, or that are archived.
  const rels = db.prepare('SELECT source_id, target_id, type FROM relationships').all() as { source_id: string; target_id: string; type: string }[];
  for (const r of rels) {
    const gone = [r.source_id, r.target_id].filter((x) => !ids.has(x));
    if (gone.length)
      add(
        'Broken links',
        'error',
        `A "${r.type}" link points at ${gone.join(' and ')}, which ${gone.length === 1 ? "doesn't" : "don't"} exist.`,
        [r.source_id, r.target_id].filter((x) => ids.has(x)),
      );
    else if (archived.has(r.target_id) && !archived.has(r.source_id))
      add('Links to archived records', 'warning', `${name.get(r.source_id)} is linked (${r.type}) to ${name.get(r.target_id)}, which is archived.`, [r.source_id, r.target_id]);
  }

  // 3. People with more than one home.
  const homes = new Map<string, Set<string>>();
  for (const r of rels) if (r.type === 'lives_in' && ids.has(r.source_id) && ids.has(r.target_id)) homes.set(r.source_id, (homes.get(r.source_id) ?? new Set()).add(r.target_id));
  const typeOf = new Map(all.map((e) => [e.id, e.type]));
  const parentOf = new Map(all.map((e) => [e.id, e.parent_id]));
  for (const [who, set] of homes) {
    if (typeOf.get(who) !== 'npc' || set.size < 2) continue;
    // A home inside another of their homes (a tavern in a town) isn't a contradiction.
    const list = [...set].filter((h) => ![...set].some((o) => o !== h && isInside(o, h, parentOf)));
    if (list.length > 1) add('Two homes', 'warning', `${name.get(who)} lives in ${list.map((h) => name.get(h)).join(' and ')}.`, [who, ...list]);
  }

  // 4. Parents that didn't resolve.
  for (const e of all)
    if (!e.archived && e.parent_raw && /\[[A-Z]{2,5}-\d{3,4}\]/.test(e.parent_raw) && !e.parent_id)
      add('Unresolved parents', 'warning', `${e.name}'s parent "${e.parent_raw}" isn't a record in the library.`, [e.id]);

  // 5. The same name on two records of the same kind.
  const byName = new Map<string, string[]>();
  for (const e of all)
    if (!e.archived && !e.redirect_to && e.type !== 'redirect' && e.type !== 'index')
      byName.set(`${e.type}|${e.name.toLowerCase()}`, [...(byName.get(`${e.type}|${e.name.toLowerCase()}`) ?? []), e.id]);
  for (const [k, list] of byName) if (list.length > 1) add('Same name twice', 'warning', `Two ${k.split('|')[0]} records are called ${name.get(list[0])}.`, list);

  // 6. Campaign tools pointing at records that are gone.
  const gone = (id: string | null | undefined) => !!id && !ids.has(id);
  for (const r of db.prepare('SELECT entity_id, label FROM map_markers WHERE entity_id IS NOT NULL').all() as { entity_id: string; label: string }[])
    if (gone(r.entity_id)) add('Map pins for missing records', 'error', `The pin "${r.label}" is for ${r.entity_id}, which doesn't exist.`, []);
  for (const a of db.prepare('SELECT title, linked_ids, source_hook_id FROM adventures').all() as { title: string; linked_ids: string; source_hook_id: string | null }[]) {
    const miss = [...parseJson<string[]>(a.linked_ids, []), a.source_hook_id].filter((x): x is string => gone(x));
    if (miss.length) add('Adventures citing missing records', 'warning', `The adventure "${a.title}" links ${miss.join(', ')}, which don't exist.`, []);
  }
  for (const q of db.prepare('SELECT title, giver_id, location_id FROM quests').all() as { title: string; giver_id: string | null; location_id: string | null }[]) {
    const miss = [q.giver_id, q.location_id].filter(gone);
    if (miss.length) add('Quests citing missing records', 'warning', `The quest "${q.title}" cites ${miss.join(', ')}, which don't exist.`, []);
  }
  for (const r of db.prepare('SELECT key, text, source_id, about FROM rumours WHERE stale = 0').all() as { key: string; text: string; source_id: string | null; about: string }[]) {
    const miss = [r.source_id, ...parseJson<string[]>(r.about, [])].filter(gone);
    if (miss.length) add('Rumours about missing records', 'warning', `The rumour "${r.text.slice(0, 80)}" is about ${miss.join(', ')}, which don't exist.`, []);
  }
  for (const s of db.prepare('SELECT title, source_id, about FROM secrets').all() as { title: string; source_id: string | null; about: string }[]) {
    const miss = [s.source_id, ...parseJson<string[]>(s.about, [])].filter(gone);
    if (miss.length) add('Secrets about missing records', 'warning', `The secret "${s.title}" is about ${miss.join(', ')}, which don't exist.`, []);
  }

  // 7. Revealed records whose page shows nothing.
  for (const e of db.prepare(`SELECT id, name, player_summary, revealed_sections FROM entities WHERE revealed = 1 AND archived = 0`).all() as {
    id: string;
    name: string;
    player_summary: string;
    revealed_sections: string;
  }[])
    if (!e.player_summary.trim() && !parseJson<string[]>(e.revealed_sections, []).length)
      add('Revealed but empty', 'warning', `${e.name} is revealed to players, but they'd see nothing on its page.`, [e.id]);

  peopleChecks(db, add);
  lootChecks(add, ids, new Map(all.map((e) => [e.id, e.type])), new Set(types(db).with('holdable')));
  leakChecks(db, add);

  return { checked: all.length, problems: out.sort((a, b) => (a.severity === b.severity ? a.check.localeCompare(b.check) : a.severity === 'error' ? -1 : 1)) };
}

type Add = (check: string, severity: Problem['severity'], message: string, list: string[]) => void;

export const CLASS_NAMES = ['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const TITLE_WORDS = new Set(
  'the of old sister brother captain elder lady lord master keeper magistrate grand archivist reeve warden chief mother father little major high goodwife headwoman thane deputy sergeant herd speaker miller healer scribe harbourmaster justicar archon general mistress magister inquisitor grandmaster king queen prophet first last one who forge drum duel gate griffon storm ice door hold vault bone ember choir courier crew herd-leader herd-mother sister-captain duel-marshal griffon-master drum-sergeant forge-mother rootwarden mask-warden archive-warden gate-warden storm-watcher courier-captain bone-singer vault-seeker ice-watcher hold-warden door-reader lightkeeper gravedigger deacon ember-broker choir-sister knight-commander scout-captain chief-wright well-warden anchor-master sanctuary-keeper siege-engineer archivist-elder'.split(
    ' ',
  ),
);

/** The table at the top of a person's handbook page: People, Class, Known as, Pronouns, From. */
function personRow(summary: string) {
  const m = /\| People \| Class \| Known as \| Pronouns \| From \|\n\|[- |]+\|\n\| (.*?) \| (.*?) \| (.*?) \| (.*?) \|/.exec(summary);
  return m ? { people: m[1].trim(), cls: m[2].trim(), known: m[3].trim(), pronouns: m[4].trim() } : null;
}

/** 8-9. People: the page agrees with the record, the class is a class, and nobody shares a surname by accident. */
function peopleChecks(db: DB, add: Add) {
  const npcs = db.prepare(`SELECT id, name, body, fields, player_summary, revealed FROM entities WHERE type = 'npc' AND archived = 0`).all() as {
    id: string;
    name: string;
    body: string;
    fields: string;
    player_summary: string;
    revealed: number;
  }[];
  for (const n of npcs) {
    const row = personRow(n.player_summary ?? '');
    if (!row) {
      if (n.revealed && /\| People \| Calling \|/.test(n.player_summary)) add('People pages without a class', 'warning', `${n.name}'s page still has the old People / Calling table.`, [n.id]);
      continue;
    }
    if (row.cls !== 'Unknown' && !CLASS_NAMES.includes(row.cls)) add('People pages with a class that isn’t a class', 'warning', `${n.name}'s page gives the class as "${row.cls}".`, [n.id]);
    const field = (k: string) =>
      parseJson<[string, string][]>(n.fields, [])
        .find(([key]) => key.toLowerCase() === k)?.[1]
        ?.trim();
    const species = field('species');
    if (species && species.toLowerCase() !== row.people.toLowerCase())
      add('People pages that disagree with the record', 'warning', `${n.name}'s record says ${species}, but the page says ${row.people}.`, [n.id]);
    const pronouns = field('pronouns');
    if (pronouns && pronouns.toLowerCase() !== row.pronouns.toLowerCase())
      add('People pages that disagree with the record', 'warning', `${n.name}'s record has ${pronouns}, but the page has ${row.pronouns}.`, [n.id]);
  }
  // Surnames shared by two people, unless a family record names them both (families share names on purpose).
  const families = (db.prepare(`SELECT body, player_summary FROM entities WHERE type = 'family' AND archived = 0`).all() as { body: string; player_summary: string }[]).map(
    (f) => `${f.body}\n${f.player_summary}`,
  );
  const bySurname = new Map<string, { id: string; name: string }[]>();
  for (const n of npcs) {
    const words = n.name
      .replace(/"[^"]*"/g, '')
      .replace(/\bthe \S+$/i, '')
      .split(/\s+/)
      .filter((w) => /^[A-Z][a-z'-]{2,}$/.test(w) && !TITLE_WORDS.has(w.toLowerCase()));
    if (words.length < 2) continue;
    const surname = words[words.length - 1];
    bySurname.set(surname, [...(bySurname.get(surname) ?? []), { id: n.id, name: n.name }]);
  }
  for (const [surname, list] of bySurname) {
    if (list.length < 2) continue;
    if (families.some((f) => list.every((p) => f.includes(p.name) || f.includes(p.name.split(' ').slice(-2).join(' '))))) continue;
    if (families.some((f) => new RegExp(`\\b${surname}s\\b|\\bThe ${surname}s\\b`).test(f))) continue;
    add(
      'Shared surnames',
      'warning',
      `${list.map((p) => p.name).join(' and ')} share the surname ${surname}, and no family record ties them together.`,
      list.map((p) => p.id),
    );
  }
}

/** 10. Treasure: the catalogue and pools point at real records, pools and rarities. */
function lootChecks(add: Add, ids: Set<string>, typeOf: Map<string, string>, holdable: Set<string>) {
  const data = treasureData();
  const rarities = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
  const tierRarities: Record<number, string[]> = { 1: ['common', 'uncommon'], 2: ['uncommon', 'rare'], 3: ['rare', 'very rare'], 4: ['very rare', 'legendary'] };
  for (const [id, it] of Object.entries(data.catalogue.items)) {
    if (!ids.has(id)) add('Treasure that points at missing records', 'error', `The treasure catalogue lists ${id}, which doesn't exist.`, []);
    else if (!holdable.has(typeOf.get(id) ?? ''))
      add('Treasure that points at missing records', 'warning', `The treasure catalogue lists ${id}, which isn't an item.`, [id]);
    if (!rarities.includes(it.rarity)) add('Treasure with a bad rarity', 'error', `${id} has the rarity "${it.rarity}".`, [id]);
    else if (tierRarities[it.tier] && !tierRarities[it.tier].includes(it.rarity)) add('Treasure with a bad rarity', 'warning', `${id} is ${it.rarity}, which is unusual at tier ${it.tier}.`, [id]);
    for (const p of it.pools) if (!data.pools[p]) add('Treasure that points at missing records', 'error', `${id} is in the pool "${p}", which doesn't exist.`, [id]);
    for (const m of `${it.where ?? ''} ${it.wants ?? ''}`.matchAll(REF))
      if (!ids.has(m[1])) add('Treasure that points at missing records', 'error', `${id}'s notes cite ${m[1]}, which doesn't exist.`, [id]);
  }
  for (const [id, a] of Object.entries(data.catalogue.artifacts)) {
    if (!ids.has(id)) add('Treasure that points at missing records', 'error', `The artifact list has ${id}, which doesn't exist.`, []);
    if (a.place && !ids.has(a.place)) add('Treasure that points at missing records', 'error', `${id} rests at ${a.place}, which doesn't exist.`, [id]);
    if (!a.leads?.length) add('Artifacts without leads', 'warning', `${id} has no leads pointing to it.`, [id]);
  }
  for (const [key, r] of Object.entries(data.regions)) {
    for (const x of r.ids) if (!ids.has(x)) add('Treasure that points at missing records', 'error', `The treasure region "${key}" cites ${x}, which doesn't exist.`, []);
    for (const p of r.pools) if (!data.pools[p]) add('Treasure that points at missing records', 'error', `The treasure region "${key}" uses the pool "${p}", which doesn't exist.`, []);
  }
  const seen = new Map<string, Set<string>>();
  for (const [pool, byRarity] of Object.entries(data.pools))
    for (const [rarity, list] of Object.entries(byRarity ?? {})) {
      if (!rarities.includes(rarity)) add('Treasure with a bad rarity', 'error', `The pool "${pool}" has a "${rarity}" list.`, []);
      for (const name of list ?? []) seen.set(name, (seen.get(name) ?? new Set()).add(rarity));
    }
  for (const [name, set] of seen) if (set.size > 1) add('Treasure with a bad rarity', 'warning', `"${name}" is listed as ${[...set].join(' and ')} in different pools.`, []);
}

/** 11. GM secrets that show up in what players can read. */
function leakChecks(db: DB, add: Add) {
  const secretHeading = /^##\s+(Pressure and secrets|Secrets? \(GM only\)|Secret|Secrets)\s*$/im;
  const secrets: { id: string; name: string; sentence: string }[] = [];
  for (const e of db.prepare(`SELECT id, name, body FROM entities WHERE archived = 0`).all() as { id: string; name: string; body: string }[]) {
    const m = secretHeading.exec(e.body);
    if (!m) continue;
    const section = e.body.slice(m.index + m[0].length).split(/\n## /)[0];
    for (const s of section.split(/(?<=[.!?])\s+/)) {
      const t = s
        .replace(/\[[A-Z]{2,5}-\d{3,4}(?:-[A-Z]+)?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t.length >= 40) secrets.push({ id: e.id, name: e.name, sentence: t });
    }
  }
  if (!secrets.length) return;
  const visible = (
    db.prepare(`SELECT id, name, body, player_summary, revealed_sections FROM entities WHERE revealed = 1 AND archived = 0`).all() as {
      id: string;
      name: string;
      body: string;
      player_summary: string;
      revealed_sections: string;
    }[]
  ).map((e) => {
    const wanted = new Set(parseJson<string[]>(e.revealed_sections, []));
    const sections = e.body.split(/\n(?=## )/).filter((s) => wanted.has(/^## (.+)$/m.exec(s)?.[1]?.trim() ?? ''));
    const text = `${e.player_summary}\n${sections.join('\n')}`
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/@\[([^\]|]+)(\|[^\]]*)?\]/g, '$1')
      .replace(/\[[A-Z]{2,5}-\d{3,4}(?:-[A-Z]+)?\]/g, '')
      .replace(/\s+/g, ' ');
    return { id: e.id, name: e.name, text };
  });
  for (const s of secrets)
    for (const v of visible)
      if (v.text.includes(s.sentence)) add('Secrets players can read', 'error', `Part of ${s.name}'s secret is on ${v.name}'s page: "${s.sentence.slice(0, 90)}…"`, [s.id, v.id]);
}

function isInside(id: string, ancestor: string, parentOf: Map<string, string | null>) {
  for (let p = parentOf.get(id), guard = 0; p && guard < 12; p = parentOf.get(p), guard++) if (p === ancestor) return true;
  return false;
}
