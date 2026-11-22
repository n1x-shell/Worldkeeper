/**
 * What the published Player Handbook reveals, as rules shared by its build (scripts/build-player-tagged-handbook.ts)
 * and the app's "Match the published handbook" action:
 *
 *  - every record the archive tags for players (Tags: vis/player), with only its safe sections: never GM-only
 *    sections, editorial notes about the source, DM-facing advice, bookkeeping, or anything secret elsewhere in the lore;
 *  - the DM-written player text in packs/worldkeeper/player-text/*.md: each "## Name" section is that record's player text.
 *
 * The build starts from a fresh library ("fresh"). In the GM's own library ("match") it only ever adds: a revealed
 * section stays revealed, and existing player text is kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getEntity, updateEntity } from '../repo/entities.js';
import { splitSections } from '../import/parseMarkdown.js';
import { isSecretHeading } from './projection.js';
import { ENTITY_TYPE_LABELS, type EntityType } from '../../../shared/domain.js';
import { worldkeeperPath } from '../packs/paths.js';
import { findPack } from '../packs/registry.js';
import { compile, type HandbookRules } from '../../../shared/packs.js';

type DB = Database.Database;

/** A pack's handbook rules (pack.json "handbook"), compiled: which sections of its records are safe for players. */
export interface CompiledHandbookRules {
  editorial: RegExp | null;
  dmFacing: RegExp | null;
  bookkeeping: RegExp | null;
  spoilers: RegExp[];
  exceptions: { re: RegExp; exceptIn: string }[];
}
export function compileHandbookRules(h: HandbookRules | undefined): CompiledHandbookRules {
  return {
    editorial: compile(h?.editorialHeading),
    dmFacing: compile(h?.dmFacingHeading),
    bookkeeping: compile(h?.bookkeeping),
    spoilers: (h?.spoilers ?? []).map((p) => compile(p)!),
    exceptions: (h?.spoilerExceptions ?? []).map((p) => ({ re: compile(p)!, exceptIn: p.exceptIn })),
  };
}
/** The handbook's rules: the Worldkeeper pack's, whose published handbook this matches. */
const rules = (() => {
  let c: CompiledHandbookRules | null = null;
  return () => (c ??= compileHandbookRules(findPack('worldkeeper')?.manifest.handbook));
})();

/** Something secret elsewhere in the lore (or bookkeeping for the DM). A rule's exception names the record it doesn't apply to. */
export function isSpoiler(id: string, text: string, r = rules()) {
  const body = text.split('\n').slice(1).join('\n');
  return r.spoilers.some((re) => re.test(text)) || (!!r.bookkeeping && (body.trim() === 'UNDEFINED' || r.bookkeeping.test(body))) || r.exceptions.some((x) => x.exceptIn !== id && x.re.test(text));
}

/** The sections of a record the handbook shows. */
export function safeSections(id: string, body: string, r = rules()): string[] {
  return splitSections(body)
    .filter((s) => {
      const h = s.heading?.trim() ?? '';
      return h && s.content.trim() && !isSecretHeading(h) && !r.editorial?.test(h) && !r.dmFacing?.test(h) && !isSpoiler(id, s.heading + '\n' + s.content, r);
    })
    .map((s) => s.heading);
}

export interface HandbookRevealChange {
  id: string;
  name: string;
  /** Newly revealed record (it wasn't revealed before). */
  newRecord: boolean;
  /** Sections revealed by this change. */
  sections: string[];
  /** Player text set by this change. */
  playerText: boolean;
}

/**
 * Apply (or, with apply false, preview) the handbook's reveals. "fresh" reproduces the published build exactly;
 * "match" only adds to what the library already reveals.
 */
export function handbookReveals(db: DB, opts: { mode: 'fresh' | 'match'; apply: boolean; textDir?: string; log?: (msg: string) => void }) {
  const changes = new Map<string, HandbookRevealChange>();
  // Every record the handbook shows, changed or not (for its map pins).
  const shown = new Set<string>();
  const note = (id: string, name: string, f: (c: HandbookRevealChange) => void) => {
    const c = changes.get(id) ?? { id, name, newRecord: false, sections: [], playerText: false };
    f(c);
    changes.set(id, c);
  };
  const ids = (
    db.prepare(`SELECT id FROM entities WHERE tags LIKE '%"vis/player"%' AND type NOT IN ('index','register','redirect') AND canon_flags NOT LIKE '%SECRET%' AND archived = 0`).all() as {
      id: string;
    }[]
  ).map((r) => r.id);
  for (const id of ids) {
    const e = getEntity(db, id);
    const sections = safeSections(id, e.body);
    if (!sections.length) continue; // nothing safe to show: leave the record unrevealed
    shown.add(id);
    const had = opts.mode === 'match' && e.revealed ? (e.revealed_sections ?? []) : [];
    const added = sections.filter((s) => !had.includes(s));
    if (opts.mode === 'match' && e.revealed && !added.length) continue;
    note(id, e.name, (c) => {
      c.newRecord = !e.revealed;
      c.sections = added;
    });
    if (opts.apply) updateEntity(db, id, { revealed: true, revealed_sections: [...had, ...added], reason: 'Matches the published Player Handbook (player-tagged in the archive)' });
  }

  // DM-written player text. In a fresh build it is the record's only revealed text; when matching, it's set only
  // where the record has none, and none of its revealed sections are taken away.
  const textDir = opts.textDir ?? worldkeeperPath('player-text');
  const byName = db.prepare(`SELECT id, type FROM entities WHERE lower(name) = lower(?) AND type NOT IN ('index','register','redirect') AND archived = 0`);
  // "## Name" or, when several records share the name, "## Name (Type)", e.g. "## Kaelholm (Settlement)".
  const findRecords = (heading: string) => {
    const exact = byName.all(heading) as { id: string; type: string }[];
    const m = /^(.*?)\s*\(([^)]+)\)$/.exec(heading);
    if (exact.length || !m) return exact;
    const kind = m[2].trim().toLowerCase();
    return (byName.all(m[1]) as { id: string; type: string }[]).filter((r) => r.type === kind || (ENTITY_TYPE_LABELS[r.type as EntityType] ?? '').toLowerCase() === kind);
  };
  for (const f of fs.existsSync(textDir)
    ? fs
        .readdirSync(textDir)
        .filter((n) => n.endsWith('.md'))
        .sort()
    : []) {
    const md = fs.readFileSync(path.join(textDir, f), 'utf8');
    for (const part of md.split(/^## /m).slice(1)) {
      const nl = part.indexOf('\n');
      const name = part.slice(0, nl).trim();
      const text = part.slice(nl + 1).trim();
      const rows = findRecords(name);
      if (rows.length !== 1) {
        opts.log?.(`player text: "${name}" ${rows.length ? 'matches several records' : 'is not a record'}, skipped`);
        continue;
      }
      const id = rows[0].id;
      shown.add(id);
      if (isSpoiler(id, text)) opts.log?.(`player text: check "${name}", it mentions something secret elsewhere in the lore`);
      const e = getEntity(db, id);
      if (opts.mode === 'match' && e.revealed && (e.player_summary ?? '').trim()) continue;
      note(id, e.name, (c) => {
        c.newRecord = c.newRecord || !e.revealed;
        c.playerText = true;
      });
      if (!opts.apply) continue;
      if (opts.mode === 'fresh') updateEntity(db, id, { revealed: true, player_summary: text, revealed_sections: [], reason: `Published to the Player Handbook from ${f}` });
      else updateEntity(db, id, { revealed: true, player_summary: text, reason: `Matches the published Player Handbook (player text from ${f})` });
      opts.log?.(`player text: ${name} -> ${id}`);
    }
  }
  // Map pins: the handbook shows the pin of every place it reveals. A pin added while its place was unrevealed was
  // hidden from players; once the place is revealed here, its pin is shown too. Pins of other places are left alone.
  const hiddenPins = (db.prepare('SELECT id, entity_id FROM map_markers WHERE hidden = 1 AND entity_id IS NOT NULL').all() as { id: number; entity_id: string }[]).filter((m) =>
    shown.has(m.entity_id),
  );
  if (opts.apply && opts.mode === 'match') {
    const show = db.prepare('UPDATE map_markers SET hidden = 0 WHERE id = ?');
    db.transaction(() => hiddenPins.forEach((m) => show.run(m.id)))();
  }
  const list = [...changes.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    records: list,
    newRecords: list.filter((c) => c.newRecord).length,
    sections: list.reduce((n, c) => n + c.sections.length, 0),
    playerText: list.filter((c) => c.playerText).length,
    /** Map pins of places the handbook shows that are hidden from players (shown when matching). */
    pins: opts.mode === 'match' ? hiddenPins.length : 0,
  };
}
