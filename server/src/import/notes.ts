/**
 * Bring your notes (v0.9.11, docs/BETA_PLAN.md B6): an Obsidian vault, or any folder of plain Markdown, turned into
 * records. Each note becomes one record: its name from the front matter's title, its first heading or its file name;
 * its type from the folder it is in (the GM chooses, with a guess to start from) or its front matter; `[[wiki-links]]`
 * become links between the records; tags and aliases are kept; pictures embedded in a note become the record's
 * pictures. The result is written in the library's own file convention and goes through the same preview, checks and
 * confirmation as any other import (importer.ts), so nothing is written until the GM has seen it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import AdmZip from 'adm-zip';
import type { DB } from '../db/connection.js';
import type { TypeRegistry } from '../../../shared/recordTypes.js';
import { safeRelativePath, stripCommonRoot, type SourceFile } from './scan.js';
import { sniffImage } from '../lib/images.js';
import { addImage } from '../repo/entityImages.js';

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const MAX_NOTE_BYTES = 8 * 1024 * 1024;
const MAX_PICTURE_BYTES = 25 * 1024 * 1024;
const MAX_PICTURES_BYTES = 400 * 1024 * 1024;

export interface NotesArchive {
  notes: SourceFile[];
  /** Pictures by their path in the archive (and looked up by file name, as Obsidian does). */
  pictures: Map<string, Buffer>;
}

/** Read a ZIP of notes: its Markdown files and its pictures. Obsidian's own folders (.obsidian, .trash) are left out. */
export function readNotesZip(buffer: Buffer): NotesArchive {
  const zip = new AdmZip(buffer);
  const notes: SourceFile[] = [];
  const raw: { path: string; data: Buffer }[] = [];
  let pictureBytes = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const rel = safeRelativePath(entry.entryName);
    if (!rel || rel.split('/').some((seg) => seg.startsWith('.') || seg === '__MACOSX')) continue;
    if (rel.toLowerCase().endsWith('.md')) {
      if (entry.header.size > MAX_NOTE_BYTES) throw new Error(`A note is too large to import: ${rel}`);
      if (notes.length >= 20000) throw new Error('The archive holds more than 20,000 notes');
      notes.push({ path: rel, content: entry.getData().toString('utf8') });
    } else if (IMAGE.test(rel) && entry.header.size <= MAX_PICTURE_BYTES && pictureBytes + entry.header.size <= MAX_PICTURES_BYTES) {
      pictureBytes += entry.header.size;
      raw.push({ path: rel, data: entry.getData() });
    }
  }
  // The notes and pictures share one root folder (the vault's own name), which is dropped from both.
  const all = stripCommonRoot([...notes, ...raw.map((r) => ({ path: r.path, content: '' }))]);
  const pictures = new Map<string, Buffer>();
  raw.forEach((r, i) => pictures.set(all[notes.length + i].path, r.data));
  return { notes: all.slice(0, notes.length).sort((a, b) => a.path.localeCompare(b.path)), pictures };
}

/** Whether the files are someone's notes, not this app's own archives: hardly any carry the library's `ID:` header. */
export function looksLikeNotes(notes: SourceFile[]): boolean {
  if (!notes.length) return false;
  const own = notes.filter((n) => /^ID:\s*[A-Z]{2,5}-[A-Z0-9]/m.test(n.content.slice(0, 2000))).length;
  return own / notes.length < 0.2;
}

// ---- Front matter ---------------------------------------------------------------------------------------------------

type Front = Record<string, string | string[]>;

const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
/** `[[Note]]` or `[[Note|shown]]` as its plain name (front matter can hold links too). */
const plainLink = (s: string) => s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, shown?: string) => shown ?? path.posix.basename(target));

/**
 * The YAML at the top of a note, as far as notes use it: `key: value`, `key: [a, b]` and `key:` followed by `- item`
 * lines. Anything deeper is left as text. Returns the front matter and the note without it.
 */
export function splitFrontMatter(content: string): { front: Front; body: string } {
  const text = content.replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { front: {}, body: text };
  const front: Front = {};
  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      const cur = front[key];
      front[key] = [...(Array.isArray(cur) ? cur : cur ? [cur] : []), unquote(item[1])];
      continue;
    }
    const kv = /^([A-Za-z0-9_][\w .-]*?)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1].trim().toLowerCase();
    const value = kv[2].trim();
    if (!value) front[key] = [];
    else if (/^\[.*\]$/.test(value))
      front[key] = value
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter(Boolean);
    else front[key] = unquote(value);
  }
  return { front, body: text.slice(m[0].length) };
}

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? v.split(',') : [])
    .map((x) => plainLink(x).trim())
    .filter(Boolean);
const one = (v: string | string[] | undefined): string => plainLink(Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();

// ---- What is in the archive -----------------------------------------------------------------------------------------

/** Folder names GMs use, and the record type each most likely holds. */
const FOLDER_GUESSES: [RegExp, string][] = [
  [/^(npcs?|people|persons?|characters?|cast|allies|villains|pcs)$/, 'npc'],
  [/^(towns?|cities|city|villages?|settlements?)$/, 'settlement'],
  [/^(places?|locations?|landmarks?|sites?|points? of interest|pois?)$/, 'landmark'],
  [/^(regions?|areas?|lands?|provinces?)$/, 'region'],
  [/^(nations?|countries|country|kingdoms?|empires?|realms?)$/, 'nation'],
  [/^(dungeons?|lairs?|ruins?)$/, 'dungeon'],
  [/^(buildings?|shops?|taverns?|inns?)$/, 'building'],
  [/^(factions?|organi[sz]ations?|orgs?|groups?|guilds?)$/, 'faction'],
  [/^(cults?)$/, 'cult'],
  [/^(families|family|houses?|dynast(y|ies))$/, 'family'],
  [/^(gods?|deit(y|ies)|pantheons?|religions?)$/, 'deity'],
  [/^(history|events?|timeline)$/, 'event'],
  [/^(items?|loot|treasures?|equipment|magic items?)$/, 'item'],
  [/^(artifacts?|relics?)$/, 'artifact'],
  [/^(monsters?|creatures?|bestiary|beasts?)$/, 'creature'],
  [/^(species|races?|ancestr(y|ies))$/, 'species'],
  [/^(cultures?|peoples?)$/, 'culture'],
  [/^(magic|magic systems?)$/, 'magic_system'],
  [/^(rules?|house ?rules?|homebrew)$/, 'rule'],
  [/^(hooks?|plot hooks?|adventure hooks?|rumou?rs?)$/, 'adventure_hook'],
];
/** Folders that hold a campaign's doings or a vault's own workings, not the world: left out unless the GM says. */
const SKIP_GUESS = /^(sessions?|session notes?|journals?|daily( notes?)?|templates?|attachments?|assets?|images?|files?|inbox|archive|meta|\d{4}.*)$/;

const folderOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').replace(/^\d+[.\s]*/, '').trim();

/** The type a folder (by its own name, then its parents') most likely holds: a type key, 'skip', or null for no guess. */
export function guessFolder(folder: string, reg: TypeRegistry): string | null {
  for (const seg of folder.split('/').reverse()) {
    const n = norm(seg);
    if (!n) continue;
    if (SKIP_GUESS.test(n)) return 'skip';
    const known = reg.fromCategory(n);
    if (known && reg.get(known)) return known;
    const hit = FOLDER_GUESSES.find(([re]) => re.test(n));
    if (hit && reg.get(hit[1])) return hit[1];
  }
  return null;
}

export interface NotesScan {
  notes: number;
  pictures: number;
  /** Every folder with notes directly in it ('' is the top), with a first guess at what it holds. */
  folders: { path: string; notes: number; guess: string | null; sample: string[] }[];
}

export function scanNotes(a: NotesArchive, reg: TypeRegistry): NotesScan {
  const by = new Map<string, string[]>();
  for (const n of a.notes) by.set(folderOf(n.path), [...(by.get(folderOf(n.path)) ?? []), path.posix.basename(n.path, '.md')]);
  return {
    notes: a.notes.length,
    pictures: a.pictures.size,
    folders: [...by].sort(([x], [y]) => x.localeCompare(y)).map(([p, names]) => ({ path: p, notes: names.length, guess: guessFolder(p, reg), sample: names.slice(0, 3) })),
  };
}

// ---- Turning notes into records -------------------------------------------------------------------------------------

export interface NotesOptions {
  /** What each folder holds: a record type's key, or 'skip'. A folder not named takes `fallback`. */
  folders: Record<string, string>;
  /** The type for notes whose folder has none, and whose front matter names none. */
  fallback: string;
  /** The realm the records are in (a realm's name), written to each record. */
  realm: string;
  /** New records' canon status. */
  canon: 'CANON' | 'PROPOSED';
}

export interface ConvertedNotes {
  /** The notes as the library's own record files, ready for the importer. */
  files: SourceFile[];
  /** Pictures embedded in notes, to attach to their records once they exist. */
  pictures: { entity_id: string; path: string }[];
  /** Notes left out, and why. */
  skipped: { path: string; reason: string }[];
  /** Links to notes that aren't in the archive (left as plain text). */
  unresolved: number;
}

interface Planned {
  note: SourceFile;
  front: Front;
  body: string;
  name: string;
  type: string;
  id: string;
}

/** A front matter key as the library writes a field's name: "home town" → "Home town". */
const fieldName = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').replace(/[^A-Za-z0-9 ,/()'’-]/g, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
};
const USED_KEYS = new Set(['title', 'name', 'aliases', 'alias', 'tags', 'tag', 'type', 'category', 'kind', 'cssclass', 'cssclasses', 'publish', 'created', 'updated', 'modified', 'date', 'id', 'parent', 'canon status', 'source', 'alternate names', 'continent or realm']);

export function convertNotes(db: DB, a: NotesArchive, opts: NotesOptions, reg: TypeRegistry): ConvertedNotes {
  const skipped: ConvertedNotes['skipped'] = [];
  const planned: Planned[] = [];
  // IDs: a record this library already has under the same name and type keeps its ID (bringing the notes in again
  // updates it); a new one takes the next free ID of its type.
  const existing = db.prepare('SELECT id, name, type FROM entities').all() as { id: string; name: string; type: string }[];
  const byNameType = new Map(existing.map((e) => [`${e.type}:${e.name.toLowerCase()}`, e.id]));
  const taken = new Set(existing.map((e) => e.id));
  const counters = new Map<string, number>();
  const nextId = (prefix: string) => {
    let n = counters.get(prefix);
    if (n === undefined) {
      n = 0;
      for (const id of taken) {
        const m = new RegExp(`^${prefix}-(\\d{4})$`).exec(id);
        if (m && Number(m[1]) > n) n = Number(m[1]);
      }
    }
    let id: string;
    do id = `${prefix}-${String(++n).padStart(4, '0')}`;
    while (taken.has(id));
    counters.set(prefix, n);
    taken.add(id);
    return id;
  };

  const seen = new Set<string>();
  for (const note of a.notes) {
    const folder = folderOf(note.path);
    const { front, body } = splitFrontMatter(note.content);
    // The folder's choice: its own, or the nearest parent's that has one.
    let choice: string | undefined;
    for (let f = folder; ; f = folderOf(f)) {
      if (opts.folders[f] !== undefined) {
        choice = opts.folders[f];
        break;
      }
      if (!f) break;
    }
    if (choice === 'skip') {
      skipped.push({ path: note.path, reason: 'Its folder is left out' });
      continue;
    }
    const named = reg.fromCategory(one(front.type) || one(front.category) || one(front.kind));
    const type = [named, choice, opts.fallback, 'custom'].find((t): t is string => !!t && !!reg.get(t))!;
    const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1];
    const name = (one(front.title) || one(front.name) || heading || path.posix.basename(note.path, '.md')).replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!name) {
      skipped.push({ path: note.path, reason: 'It has no name' });
      continue;
    }
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      skipped.push({ path: note.path, reason: `Another note is already the ${reg.label(type)} called ${name}` });
      continue;
    }
    seen.add(key);
    planned.push({ note, front, body, name, type, id: byNameType.get(key) ?? nextId(reg.get(type)!.prefix) });
  }

  // What a link can point at: a note by its file name, its path, its name or an alias; then a record already here.
  const targets = new Map<string, Planned | { id: string; name: string }>();
  const put = (k: string, v: Planned | { id: string; name: string }) => {
    const n = k.toLowerCase().trim();
    if (n && !targets.has(n)) targets.set(n, v);
  };
  for (const p of planned) {
    put(p.note.path.replace(/\.md$/i, ''), p);
    put(path.posix.basename(p.note.path, '.md'), p);
    put(p.name, p);
    for (const al of [...list(p.front.aliases), ...list(p.front.alias)]) put(al, p);
  }
  for (const e of existing) put(e.name, e);

  const pictureByName = new Map<string, string>();
  for (const p of a.pictures.keys()) {
    pictureByName.set(p.toLowerCase(), p);
    if (!pictureByName.has(path.posix.basename(p).toLowerCase())) pictureByName.set(path.posix.basename(p).toLowerCase(), p);
  }

  const pictures: ConvertedNotes['pictures'] = [];
  let unresolved = 0;
  const files: SourceFile[] = [];
  for (const p of planned) {
    const findPicture = (ref: string) => {
      const clean = decodeURIComponent(ref.split('|')[0].split('#')[0].trim()).replace(/^\.\//, '');
      const beside = path.posix.normalize(path.posix.join(folderOf(p.note.path), clean)).toLowerCase();
      return pictureByName.get(beside) ?? pictureByName.get(clean.toLowerCase()) ?? pictureByName.get(path.posix.basename(clean).toLowerCase());
    };
    const attach = (ref: string): boolean => {
      const found = findPicture(ref);
      if (found && !pictures.some((x) => x.entity_id === p.id && x.path === found)) pictures.push({ entity_id: p.id, path: found });
      return !!found;
    };
    const link = (target: string, shown?: string) => {
      const t = targets.get(target.split('#')[0].toLowerCase().trim()) ?? targets.get(path.posix.basename(target.split('#')[0]).toLowerCase().trim());
      if (!t) {
        unresolved++;
        return shown ?? path.posix.basename(target);
      }
      if (t.id === p.id) return shown ?? t.name;
      // A link shown in other words keeps them: "the Guild [FAC-0002]" reads as written, with a small link after it.
      const words = shown?.trim();
      return words && words.toLowerCase() !== t.name.toLowerCase() ? `${words} [${t.id}]` : `${t.name} [${t.id}]`;
    };
    let body = p.body
      // Obsidian's comments are the writer's own.
      .replace(/%%[\s\S]*?%%/g, '')
      // Embedded pictures become the record's pictures; an embedded note becomes a link to it.
      .replace(/!\[\[([^\]]+)\]\]/g, (m, ref: string) => (IMAGE.test(ref.split('|')[0]) ? (attach(ref) ? '' : m) : link(ref.split('|')[0], ref.split('|')[1])))
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, _alt: string, ref: string) => (/^[a-z]+:\/\//i.test(ref) ? m : attach(ref) ? '' : m))
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, shown?: string) => link(target, shown));
    // The note's own title heading says what the record's name already does.
    const first = /^\s*#\s+(.+?)\s*#*\s*(\r?\n|$)/.exec(body);
    if (first && first[1].replace(/\s+/g, ' ').trim().toLowerCase() === p.name.toLowerCase()) body = body.slice(first[0].length);
    body = body.replace(/\n{3,}/g, '\n\n').trim();

    const tags = [...new Set([...list(p.front.tags), ...list(p.front.tag), ...[...body.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)].map((m) => m[1])].map((t) => t.replace(/^#/, '').toLowerCase()))].slice(0, 40);
    const aliases = [...new Set([...list(p.front.aliases), ...list(p.front.alias)])].filter((x) => x.toLowerCase() !== p.name.toLowerCase());
    const parent = one(p.front.parent);
    const parentTarget = parent ? targets.get(parent.toLowerCase()) : undefined;
    const fields: [string, string][] = [];
    for (const [k, v] of Object.entries(p.front)) {
      if (USED_KEYS.has(k)) continue;
      const label = fieldName(k);
      const value = (Array.isArray(v) ? v.map(plainLink).join(', ') : plainLink(v)).replace(/\s+/g, ' ').trim();
      if (/^[A-Z]/.test(label) && label.length <= 60 && value && !fields.some(([x]) => x === label)) fields.push([label, value.slice(0, 2000)]);
    }
    const header = [
      `ID: ${p.id}`,
      `Name: ${p.name}`,
      `Alternate names: ${aliases.length ? aliases.join(', ') : 'None'}`,
      `Category: ${reg.label(p.type)}`,
      `Parent: ${parentTarget && parentTarget.id !== p.id ? `${parentTarget.name} [${parentTarget.id}]` : 'None'}`,
      `Continent or realm: ${opts.realm}`,
      `Canon status: ${opts.canon}`,
      `Source: Your notes (${p.note.path})`,
      `Tags: ${tags.join(', ')}`,
      ...fields.map(([k, v]) => `${k}: ${v}`),
    ];
    files.push({ path: p.note.path, content: `${header.join('\n')}\n\n${body}\n` });
  }
  return { files, pictures, skipped, unresolved };
}

/**
 * After the records exist: the pictures their notes embedded become the records' pictures (GM only, as any new
 * picture is). Each is added once: bringing the notes in again doesn't add it twice.
 */
export function attachNotePictures(db: DB, uploadsDir: string, pictures: { entity_id: string; path: string; data: Buffer }[]): number {
  const have = db.prepare('SELECT 1 FROM entity_images WHERE entity_id = ? AND origin = ?');
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  let added = 0;
  for (const p of pictures) {
    const origin = `notes:${p.path}`.slice(0, 300);
    const ext = sniffImage(p.data);
    if (!ext || !exists.get(p.entity_id) || have.get(p.entity_id, origin)) continue;
    const name = `record-${p.entity_id.replace(/[^\w-]/g, '')}-${randomBytes(6).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, name), p.data);
    addImage(db, p.entity_id, name, { caption: '', origin });
    added++;
  }
  return added;
}

