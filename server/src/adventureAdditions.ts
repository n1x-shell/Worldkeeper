/**
 * Ready-to-run adventures shipped with the Worldkeeper additions (assets/adventures/*.md), applied into the GM's
 * Adventures with their scenes. An adventure the library already has (by title) is left alone, so the GM's own edits
 * are never overwritten.
 *
 * File format:
 *
 *   Title: …            Arc: …            Hook: HOOK-001      Linked: SET-001, NPC-010, …
 *   ## Premise / Hook / Stakes / Opposition / Clues (a list) / Obstacles / Encounters / Rewards / Approaches /
 *      Consequences / If ignored / Scaling
 *   # Scene: Title
 *   Kind: scene | location | encounter | clue | social | travel | climax | branch
 *   Linked: …
 *   > read-aloud lines
 *   The GM's notes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/connection.js';
import { adventures, sceneLinks, scenes } from './repo/campaigns.js';

const FIELDS: Record<string, string> = {
  premise: 'premise',
  hook: 'hook',
  stakes: 'stakes',
  opposition: 'opposition',
  obstacles: 'obstacles',
  encounters: 'encounters',
  rewards: 'rewards',
  approaches: 'approaches',
  consequences: 'consequences',
  'if ignored': 'ifIgnored',
  scaling: 'scaling',
};
const KINDS = ['scene', 'location', 'encounter', 'clue', 'social', 'travel', 'climax', 'branch'] as const;
type Kind = (typeof KINDS)[number];

export interface AdventureSpec {
  title: string;
  arc: string;
  hook: string | null;
  linked: string[];
  data: Record<string, unknown> & { clues: { text: string; found: boolean }[] };
  scenes: { title: string; kind: Kind; linked: string[]; readAloud: string; body: string }[];
}

const ids = (s: string | undefined) => (s ?? '').split(/[,\s]+/).filter((x) => /^[A-Z]{2,5}-\d{3,4}$/.test(x));

/** Read one adventure file. */
export function parseAdventure(text: string): AdventureSpec {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const head: Record<string, string> = {};
  const data: AdventureSpec['data'] = { clues: [] };
  const out: AdventureSpec = { title: '', arc: '', hook: null, linked: [], data, scenes: [] };
  let section: string | null = null;
  let buf: string[] = [];
  let scene: AdventureSpec['scenes'][number] | null = null;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (scene) {
      // Read-aloud is the block of "> " lines; everything else is the GM's notes.
      scene.readAloud = buf
        .filter((l) => l.startsWith('>'))
        .map((l) => l.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      scene.body = buf
        .filter((l) => !l.startsWith('>'))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } else if (section === 'clues')
      data.clues = text
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .map((l) => ({ text: l.slice(2).trim(), found: false }));
    else if (section && FIELDS[section]) data[FIELDS[section]] = text;
    buf = [];
  };
  for (const line of lines) {
    const sm = line.match(/^# Scene:\s*(.+)$/);
    if (sm) {
      flush();
      section = null;
      scene = { title: sm[1].trim(), kind: 'scene', linked: [], readAloud: '', body: '' };
      out.scenes.push(scene);
      continue;
    }
    const hm = !scene && line.match(/^## (.+)$/);
    if (hm) {
      flush();
      section = hm[1].trim().toLowerCase();
      continue;
    }
    const km = line.match(/^(Title|Arc|Hook|Levels|Linked|Kind):\s*(.*)$/);
    if (km && (scene ? km[1] === 'Kind' || km[1] === 'Linked' : !section)) {
      if (scene) {
        if (km[1] === 'Kind' && (KINDS as readonly string[]).includes(km[2].trim())) scene.kind = km[2].trim() as Kind;
        if (km[1] === 'Linked') scene.linked = ids(km[2]);
      } else head[km[1]] = km[2].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  out.title = head.Title ?? '';
  out.arc = head.Arc ?? '';
  out.hook = ids(head.Hook)[0] ?? null;
  out.linked = ids(head.Linked);
  if (head.Levels) data.levels = head.Levels;
  return out;
}

export function adventureFiles(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Add the shipped adventures the library doesn't have yet. Returns the titles added. */
export function applyAdventures(db: DB, dir: string): string[] {
  const added: string[] = [];
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  const have = db.prepare('SELECT 1 FROM adventures WHERE title = ?');
  const known = (list: string[]) => list.filter((id) => exists.get(id));
  for (const file of adventureFiles(dir)) {
    const a = parseAdventure(fs.readFileSync(file, 'utf8'));
    if (!a.title || have.get(a.title)) continue;
    db.transaction(() => {
      const adv = adventures.create(db, {
        title: a.title,
        status: 'ready',
        arc: a.arc,
        source_hook_id: a.hook && exists.get(a.hook) ? a.hook : null,
        linked_ids: known(a.linked),
        data: a.data,
      }) as { id: number };
      let prev: number | null = null;
      a.scenes.forEach((s, i) => {
        const row = scenes.create(db, {
          adventure_id: adv.id,
          title: s.title,
          kind: s.kind,
          body: s.body,
          read_aloud: s.readAloud,
          linked_ids: known(s.linked),
          sort_order: i,
          x: 40 + (i % 4) * 240,
          y: 40 + Math.floor(i / 4) * 160,
        }) as { id: number };
        if (prev != null) sceneLinks.create(db, { adventure_id: adv.id, from_scene: prev, to_scene: row.id, label: '' });
        prev = row.id;
      });
    })();
    added.push(a.title);
  }
  return added;
}
