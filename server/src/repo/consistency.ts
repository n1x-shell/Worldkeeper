/**
 * The consistency checker: a report of things in the library that don't agree with each other. It changes nothing;
 * each problem links to the records involved, to fix by hand.
 */
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';

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

  return { checked: all.length, problems: out.sort((a, b) => (a.severity === b.severity ? a.check.localeCompare(b.check) : a.severity === 'error' ? -1 : 1)) };
}

function isInside(id: string, ancestor: string, parentOf: Map<string, string | null>) {
  for (let p = parentOf.get(id), guard = 0; p && guard < 12; p = parentOf.get(p), guard++) if (p === ancestor) return true;
  return false;
}
