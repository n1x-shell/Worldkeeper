/**
 * Rules packs: game rules for the character sheet and builder (spells, species, classes, subclasses, backgrounds,
 * feats), kept in the GM's own library and never in the app's repository or releases.
 *
 * The SRD 5.2.1 ships with the app as a built-in pack the GM can turn off. Anything else (material from the GM's own
 * books, or homebrew) comes in as a pack the GM imports: a zip of Markdown files, one entry per file, in the format
 * described in docs/RULES_PACKS.md. Packs are used by the GM app and the table server, and are never part of the
 * published handbook, the player export or a campaign export. Where packs disagree, the most recently imported
 * enabled pack wins, and any imported pack wins over the SRD.
 */
import { removeRulesPack, saveRulesPack, setPackSwitch, sharedPackExists } from './sharedRules.js';
import AdmZip from 'adm-zip';
import type Database from 'better-sqlite3';
import { badRequest, notFound } from '../lib/errors.js';
import SRD_SPELLS from '../../../shared/srd/spells.json' with { type: 'json' };
import SRD_TEXT from '../../../shared/srd/text.json' with { type: 'json' };
import { srdCounts } from './bookData.js';
import { SETTING_PACK, setSettingPack, settingPackCounts, settingPackOn } from './settingPack.js';
import fs from 'node:fs';
import path from 'node:path';
import { worldkeeperPath } from '../packs/paths.js';
import { addRule, emptyRulesView, srdRulesView, type RulesView } from '../../../shared/rulesView.js';
import { isOpenSource, openRulesFor } from './booksOnly.js';
import { standIns, standInSource } from './standIns.js';
import { byName } from '../../../shared/rulesView.js';

type DB = Database.Database;
export const RULE_KINDS = ['spell', 'species', 'class', 'subclass', 'background', 'feat'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export interface PackSummary {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  builtin: boolean;
  imported_at: string | null;
  counts: Record<string, number>;
  /** Under an open licence (CC BY, OGL, CC0, ORC), so it may be published to players. */
  open?: boolean;
  /** Published: its rules go into the players' handbook. */
  publish?: boolean;
}


/** One Markdown entry: "Key: value" lines, a blank line, then the text (with "## " headings for features or traits). */
export function parseEntry(md: string, fallbackKind?: string) {
  const lines = md.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  const fields: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$/.exec(lines[i]);
    if (!m) break;
    fields[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const body = lines.slice(i).join('\n').trim();
  const kind = (fields.kind ?? fallbackKind ?? '').toLowerCase();
  return { kind, fields, body };
}

/** The "## Heading" sections of a body, after any opening text. */
export function sections(body: string) {
  const parts = body.split(/^## +/m);
  const intro = parts[0].trim();
  return { intro, list: parts.slice(1).map((p) => ({ heading: p.split('\n')[0].trim(), text: p.split('\n').slice(1).join('\n').trim() })) };
}

const list = (s?: string) =>
  (s ?? '')
    .split(/,| and /)
    .map((x) => x.trim())
    .filter(Boolean);
const FOLDER_KIND: Record<string, RuleKind> = { spells: 'spell', species: 'species', classes: 'class', subclasses: 'subclass', backgrounds: 'background', feats: 'feat' };

/** Turn a parsed entry into what the sheet uses. Throws on a missing name or an unknown kind. */
export function entryData(kind: string, fields: Record<string, string>, body: string): { kind: RuleKind; name: string; cls: string; data: Record<string, unknown> } {
  const name = fields.name;
  if (!name) throw new Error('has no Name');
  if (!(RULE_KINDS as readonly string[]).includes(kind)) throw new Error(`has an unknown Kind "${kind}"`);
  const k = kind as RuleKind;
  const features = (b: string) =>
    sections(b).list.map((s) => {
      const m = /^Level (\d+):\s*(.+)$/i.exec(s.heading);
      return { level: m ? Number(m[1]) : 1, name: m ? m[2] : s.heading, text: s.text };
    });
  if (k === 'spell') {
    const level = /cantrip/i.test(fields.level ?? '') ? 0 : Number(fields.level ?? 0);
    if (!Number.isInteger(level) || level < 0 || level > 9) throw new Error('has a Level that is not 0 to 9');
    const time = fields['casting time'] ?? '';
    const comp = fields.components ?? '';
    const dur = fields.duration ?? '';
    return {
      kind: k,
      name,
      cls: '',
      data: {
        name,
        level,
        school: fields.school ?? '',
        classes: list(fields.classes),
        time,
        range: fields.range ?? '',
        components: comp,
        duration: dur,
        concentration: /^concentration/i.test(dur),
        ritual: /ritual/i.test(time) || /^yes/i.test(fields.ritual ?? ''),
        material: /\bM\b/.test(comp),
        text: body,
      },
    };
  }
  if (k === 'species') {
    const sizeText = fields.size ?? 'Medium';
    return {
      kind: k,
      name,
      cls: '',
      data: {
        type: fields['creature type'] ?? 'Humanoid',
        size: ['Tiny', 'Small', 'Medium', 'Large'].filter((x) => sizeText.includes(x)),
        sizeText,
        speed: Number(/\d+/.exec(fields.speed ?? '30')?.[0] ?? 30),
        traits: sections(body).list.map((s) => ({ name: s.heading, text: s.text })),
      },
    };
  }
  if (k === 'class') return { kind: k, name, cls: name, data: { features: features(body) } };
  if (k === 'subclass') {
    if (!fields.class) throw new Error('has no Class');
    return { kind: k, name, cls: fields.class, data: { name, about: sections(body).intro, features: features(body) } };
  }
  if (k === 'background')
    return {
      kind: k,
      name,
      cls: '',
      data: { abilities: list(fields['ability scores']), feat: fields.feat ?? '', skills: list(fields.skills), tool: fields.tool ?? fields.tools ?? '', equipment: fields.equipment ?? '', text: body },
    };
  return { kind: k, name, cls: '', data: { category: fields.category ?? '', prerequisite: fields.prerequisite ?? '', text: body } };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Read a pack zip. Entries that can't be read are reported, not imported. */
export function readPack(buf: Buffer) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw badRequest('That file is not a zip.');
  }
  const files = zip.getEntries().filter((e) => !e.isDirectory && /\.md$/i.test(e.entryName) && !/(^|\/)(__MACOSX|\.)/.test(e.entryName));
  const head = files.find((f) => /(^|\/)pack\.md$/i.test(f.entryName));
  if (!head) throw badRequest('A rules pack needs a pack.md file naming it.');
  const meta = parseEntry(head.getData().toString('utf8')).fields;
  const name = meta.pack ?? meta.name;
  if (!name) throw badRequest('pack.md needs a "Pack:" line with the pack\'s name.');
  const entries: ReturnType<typeof entryData>[] = [];
  const problems: string[] = [];
  for (const f of files) {
    if (f === head) continue;
    const folder = f.entryName.split('/').slice(-2, -1)[0]?.toLowerCase() ?? '';
    try {
      const e = parseEntry(f.getData().toString('utf8'), FOLDER_KIND[folder]);
      entries.push(entryData(e.kind, e.fields, e.body));
    } catch (x) {
      problems.push(`${f.entryName} ${(x as Error).message}`);
    }
  }
  if (!entries.length) throw badRequest(`No rules found in the pack.${problems.length ? ` ${problems.slice(0, 5).join('; ')}` : ''}`);
  return { id: slug(meta.id ?? name), name, source: meta.source ?? meta.book ?? '', entries, problems };
}

/** Import (or replace) a pack. */
export function importPack(db: DB, buf: Buffer) {
  const p = readPack(buf);
  if (p.id === 'srd') throw badRequest('That name is taken by the built-in SRD.');
  saveRulesPack(db, p, p.entries);
  return { pack: listPacks(db).find((x) => x.id === p.id)!, problems: p.problems };
}

/**
 * The Worldkeeper world's own species (v0.9.0, packs/worldkeeper/rules/species): open (CC BY 4.0) rules for its peoples
 * that play as a book species, named after the world's own names. They come with the world's rules pack, as open rules
 * (Books only sets them aside); a GM who has the book gets the book's species, since each people names it first.
 */
const WORLD_SPECIES_CREDIT = "The Worldkeeper worldbook's rules (CC BY 4.0)";
let speciesCache: ReturnType<typeof entryData>[] | null = null;
export function worldSpecies(): ReturnType<typeof entryData>[] {
  if (speciesCache) return speciesCache;
  const dir = worldkeeperPath('rules', 'species');
  speciesCache = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => {
          const e = parseEntry(fs.readFileSync(path.join(dir, f), 'utf8'), 'species');
          return entryData(e.kind, e.fields, e.body);
        })
    : [];
  return speciesCache;
}

const srdEnabled = (db: DB) => (db.prepare(`SELECT value FROM settings WHERE key = 'rules_srd'`).get() as { value: string } | undefined)?.value !== 'off';

export function listPacks(db: DB): PackSummary[] {
  const t = SRD_TEXT as unknown as { classes: Record<string, { features: unknown[] }>; species: object; feats: object; backgrounds: object };
  const srd: PackSummary = {
    id: 'srd',
    name: 'System Reference Document 5.2.1',
    source: 'Wizards of the Coast, CC-BY-4.0 (built in)',
    enabled: srdEnabled(db),
    builtin: true,
    imported_at: null,
    counts: {
      spell: SRD_SPELLS.length,
      species: Object.keys(t.species).length,
      class: Object.keys(t.classes).length,
      subclass: Object.keys(t.classes).length,
      background: Object.keys(t.backgrounds).length,
      feat: Object.keys(t.feats).length,
      ...srdCounts(),
    },
  };
  const wk: PackSummary = { ...SETTING_PACK, enabled: settingPackOn(db), builtin: true, imported_at: null, counts: { species: worldSpecies().length, ...settingPackCounts() } };
  const rows = db.prepare('SELECT * FROM rules_packs ORDER BY imported_at').all() as { id: string; name: string; source: string; enabled: number; imported_at: string; publish?: number }[];
  const counts = db.prepare('SELECT kind, COUNT(*) n FROM rules_entries WHERE pack_id = ? GROUP BY kind');
  return [
    srd,
    wk,
    ...rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source,
      enabled: !!r.enabled,
      builtin: false,
      imported_at: r.imported_at,
      counts: Object.fromEntries((counts.all(r.id) as { kind: string; n: number }[]).map((c) => [c.kind, c.n])),
      open: isOpenSource(r.source),
      publish: !!r.publish,
    })),
  ];
}

export function setPackEnabled(db: DB, id: string, enabled: boolean) {
  if (id === 'srd') db.prepare(`INSERT INTO settings (key, value) VALUES ('rules_srd', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(enabled ? 'on' : 'off');
  else if (id === SETTING_PACK.id) setSettingPack(db, enabled);
  else if (!sharedPackExists(db, id)) throw notFound('Rules pack');
  else setPackSwitch(db, id, { enabled });
  return listPacks(db);
}

/** Publish an openly licensed pack's rules to the players' handbook (or stop). Only open packs can be published. */
export function setPackPublished(db: DB, id: string, publish: boolean) {
  const r = db.prepare('SELECT source FROM rules_packs WHERE id = ?').get(id) as { source: string } | undefined;
  if (!r) throw notFound('Rules pack');
  if (publish && !isOpenSource(r.source)) throw badRequest('Only openly licensed rules (CC BY, OGL, CC0, ORC) can be published to players.');
  setPackSwitch(db, id, { publish });
  return listPacks(db);
}

/** The rules of the packs the GM publishes (in use, and openly licensed), for the players' handbook. */
export function publishedRuleEntries(db: DB): { kind: RuleKind; name: string; cls: string; data: Record<string, unknown>; source: string }[] {
  // The world's own species are open (CC BY 4.0): they go with its rules pack, so players can build with them.
  const world = settingPackOn(db) && openRulesFor(db, 'species') ? worldSpecies().map((s) => ({ ...s, source: WORLD_SPECIES_CREDIT })) : [];
  try {
    const packs = (db.prepare('SELECT id, name, source FROM rules_packs WHERE enabled = 1 AND publish = 1 ORDER BY imported_at').all() as { id: string; name: string; source: string }[]).filter((p) =>
      isOpenSource(p.source),
    );
    const rows = db.prepare('SELECT kind, name, cls, data FROM rules_entries WHERE pack_id = ?');
    return [...world, ...packs.flatMap((p) =>
      (rows.all(p.id) as { kind: RuleKind; name: string; cls: string; data: string }[])
        .filter((r) => ['spell', 'species', 'class', 'subclass', 'background', 'feat'].includes(r.kind))
        .map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, unknown>, source: p.source || p.name })),
    )];
  } catch {
    return world;
  }
}

export function deletePack(db: DB, id: string) {
  if (id === 'srd' || id === SETTING_PACK.id) throw badRequest('This pack is built in: turn it off instead.');
  // The pack's rules are shared: removing it removes it from every library.
  if (!removeRulesPack(db, id)) throw notFound('Rules pack');
  return listPacks(db);
}

/**
 * Everything the enabled packs hold, merged: imported packs (most recently imported last, so they win) over the SRD.
 * With Books only on, the open rules (the SRD, open packs) count only for the kinds the library keeps them for.
 */
export function rulesView(db: DB): RulesView {
  const open = (kind: string) => openRulesFor(db, kind);
  const view = srdEnabled(db) ? srdRulesView(SRD_TEXT, SRD_SPELLS) : emptyRulesView(false);
  if (view.srd) {
    if (!open('spell')) view.spells = [];
    if (!open('species')) view.species = {};
    if (!open('feat')) view.feats = {};
    if (!open('background')) view.backgrounds = {};
    if (!open('class')) view.classes = {};
    else if (!open('subclass')) for (const c of Object.values(view.classes)) c.subclasses = {};
  }
  // The world's own species, with its rules pack (open rules, so Books only sets them aside).
  if (settingPackOn(db) && open('species')) for (const s of worldSpecies()) addRule(view, s.kind, s.name, s.cls, s.data, WORLD_SPECIES_CREDIT);
  const packs = db.prepare('SELECT id, name, source FROM rules_packs WHERE enabled = 1 ORDER BY imported_at').all() as { id: string; name: string; source: string }[];
  const rows = db.prepare('SELECT kind, name, cls, data FROM rules_entries WHERE pack_id = ?');
  for (const p of packs) {
    const openPack = isOpenSource(p.source);
    view.packs.push(p);
    for (const r of rows.all(p.id) as { kind: RuleKind; name: string; cls: string; data: string }[])
      if (!openPack || open(r.kind)) addRule(view, r.kind, r.name, r.cls, JSON.parse(r.data), p.source || p.name);
  }
  // Safe mode's stand-ins: where the original isn't in this library's rules, its open stand-in takes its name.
  for (const s of standIns(db)) {
    if (s.kind === 'species' && !byName(view.species, s.name)) {
      const sub = byName(view.species, s.standIn);
      if (sub) view.species[s.name] = { ...sub, source: standInSource(s, sub.source ?? s.standIn) };
    } else if (s.kind === 'class' && !byName(view.classes, s.name)) {
      const sub = byName(view.classes, s.standIn);
      if (sub) view.classes[s.name] = { features: sub.features, subclasses: sub.subclasses };
    }
  }
  view.spells.sort((a, b) => a.name.localeCompare(b.name));
  return view;
}
