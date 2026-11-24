/**
 * Back up everything (v0.6.3): one file with every library (its database and pictures) and what they share (your
 * books' rules and installed setting packs), to keep off this computer or to move to a new one. Never the publishing
 * token (secrets never go in backups) and not each library's own backups (they'd only make it balloon).
 *
 * Opening it adds, never replaces: each library in the file becomes a new library here; books' rules are merged, the
 * more recently imported copy of a pack winning; setting packs this installation lacks are added.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import type { AppContext } from '../context.js';
import { badRequest } from '../lib/errors.js';
import { createLibrary, libraryDir, readIndex, writeIndex, type LibraryEntry } from '../libraries.js';
import { saveRulesPack, setPackSwitch } from '../repo/sharedRules.js';

const FOLDER = /^[a-z0-9-]{1,40}$/;
const PICTURE = /^[\w.-]+\.(?:png|jpg|jpeg|webp|gif)$/i;
const PACK_PATH = /^shared\/packs\/([a-z0-9-]{1,60})\/((?:[\w.-]+\/)*[\w.-]+)$/;

const tmpFile = (ctx: AppContext, name: string) => path.join(ctx.paths.stagingDir, `${Date.now()}-${process.pid}-${name}`);

/** Copy a database consistently (VACUUM INTO), whether it's the open library or not. */
function copyDb(ctx: AppContext, file: string, to: string, open: boolean) {
  if (open) return ctx.db.prepare('VACUUM main INTO ?').run(to);
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    db.prepare('VACUUM INTO ?').run(to);
  } finally {
    db.close();
  }
}

export function exportInstallation(ctx: AppContext): Buffer {
  const root = ctx.paths.rootDir;
  const idx = readIndex(root)!;
  const zip = new AdmZip();
  const temps: string[] = [];
  try {
    for (const e of idx.libraries) {
      const dir = libraryDir(root, e);
      const db = path.join(dir, 'worldkeeper.db');
      if (!fs.existsSync(db)) continue;
      const t = tmpFile(ctx, `${e.folder}.db`);
      temps.push(t);
      copyDb(ctx, db, t, e.id === ctx.paths.libraryId);
      zip.addLocalFile(t, `libraries/${e.folder}`, 'worldkeeper.db');
      const uploads = path.join(dir, 'uploads');
      if (fs.existsSync(uploads))
        for (const f of fs.readdirSync(uploads)) if (PICTURE.test(f) && fs.statSync(path.join(uploads, f)).isFile()) zip.addLocalFile(path.join(uploads, f), `libraries/${e.folder}/uploads`);
    }
    const rules = tmpFile(ctx, 'rules.db');
    temps.push(rules);
    ctx.db.prepare('VACUUM shared INTO ?').run(rules);
    zip.addLocalFile(rules, 'shared', 'rules.db');
    const packs = path.join(ctx.paths.sharedDir, 'packs');
    if (fs.existsSync(packs)) zip.addLocalFolder(packs, 'shared/packs');
    const libraries = idx.libraries.map(({ id, name, folder, created_at, last_opened_at, archived }) => ({ id, name, folder, created_at, last_opened_at, archived: !!archived }));
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ app: 'worldkeeper-installation', format: 1, created_at: new Date().toISOString(), open: idx.open, libraries }, null, 2)));
    return zip.toBuffer();
  } finally {
    for (const t of temps) fs.rmSync(t, { force: true });
  }
}

export function importInstallation(ctx: AppContext, buffer: Buffer) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest('Not a ZIP file');
  }
  const manifest = zip.getEntry('manifest.json');
  const m = manifest ? (JSON.parse(manifest.getData().toString('utf8')) as { app?: string; libraries?: (Pick<LibraryEntry, 'name' | 'folder'> & { archived?: boolean })[] }) : null;
  if (m?.app !== 'worldkeeper-installation' || !Array.isArray(m.libraries)) throw badRequest('Not a "back up everything" file. A single library opens from Libraries → Open a library from a file.');
  const root = ctx.paths.rootDir;
  const names = new Set(readIndex(root)!.libraries.map((l) => l.name));
  const added: LibraryEntry[] = [];

  // Each library in the file, as a new library here.
  for (const lib of m.libraries) {
    if (!FOLDER.test(lib.folder)) continue;
    // A library never opened has no database yet: it comes over empty, as it was.
    const dbEntry = zip.getEntry(`libraries/${lib.folder}/worldkeeper.db`);
    let name = String(lib.name || 'Library').slice(0, 110);
    if (names.has(name)) name = `${name} (from file)`;
    names.add(name);
    const e = createLibrary(root, name);
    const dir = libraryDir(root, e);
    if (dbEntry) fs.writeFileSync(path.join(dir, 'worldkeeper.db'), dbEntry.getData());
    for (const z of zip.getEntries()) {
      const pic = z.entryName.startsWith(`libraries/${lib.folder}/uploads/`) ? z.entryName.slice(`libraries/${lib.folder}/uploads/`.length) : null;
      if (pic && PICTURE.test(pic) && !z.isDirectory && z.header.size <= 60 * 1024 * 1024) fs.writeFileSync(path.join(dir, 'uploads', pic), z.getData());
    }
    if (lib.archived) {
      const idx = readIndex(root)!;
      const x = idx.libraries.find((l) => l.id === e.id)!;
      x.archived = true;
      writeIndex(root, idx);
    }
    added.push(e);
  }

  // Your books' rules: packs this installation lacks, or has an older copy of.
  let rules = 0;
  const rulesEntry = zip.getEntry('shared/rules.db');
  if (rulesEntry) {
    const t = tmpFile(ctx, 'incoming-rules.db');
    fs.writeFileSync(t, rulesEntry.getData());
    const incoming = new Database(t, { readonly: true });
    try {
      const packs = incoming.prepare('SELECT id, name, source, imported_at FROM rules_packs').all() as { id: string; name: string; source: string; imported_at: string }[];
      for (const p of packs) {
        const have = ctx.db.prepare('SELECT imported_at FROM shared.rules_packs WHERE id = ?').get(p.id) as { imported_at: string } | undefined;
        if (have && have.imported_at >= p.imported_at) continue;
        // Bringing a pack in leaves the open library's own choice for it as it was.
        const before = ctx.db.prepare('SELECT enabled, publish FROM main.rules_pack_switches WHERE pack_id = ?').get(p.id) as { enabled: number; publish: number } | undefined;
        saveRulesPack(ctx.db, p, incoming.prepare('SELECT kind, name, cls, data FROM rules_entries WHERE pack_id = ?').all(p.id) as never, p.imported_at);
        if (before) setPackSwitch(ctx.db, p.id, { enabled: !!before.enabled, publish: !!before.publish });
        else ctx.db.prepare('DELETE FROM main.rules_pack_switches WHERE pack_id = ?').run(p.id);
        rules++;
      }
    } finally {
      incoming.close();
      fs.rmSync(t, { force: true });
    }
  }

  // Setting packs this installation doesn't have.
  const packsDir = path.join(ctx.paths.sharedDir, 'packs');
  const newPacks = new Set<string>();
  const existing = new Set(fs.existsSync(packsDir) ? fs.readdirSync(packsDir) : []);
  for (const z of zip.getEntries()) {
    const mm = PACK_PATH.exec(z.entryName);
    if (!mm || z.isDirectory || existing.has(mm[1]) || mm[2].split('/').includes('..')) continue;
    const to = path.join(packsDir, mm[1], mm[2]);
    if (!to.startsWith(path.join(packsDir, mm[1]) + path.sep)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, z.getData());
    newPacks.add(mm[1]);
  }
  return { libraries: added, rules, packs: [...newPacks] };
}
