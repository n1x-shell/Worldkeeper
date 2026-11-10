import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import type { DB } from '../db/connection.js';
import type { Paths } from '../config.js';
import { MIGRATIONS, schemaVersion } from '../db/migrations.js';

export interface BackupInfo {
  file: string;
  size: number;
  created_at: string;
  reason: string;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * Versioned backup: a consistent SQLite snapshot (VACUUM INTO) plus uploaded map images,
 * packed into one .wkbackup.zip with a small manifest.
 */
export function createBackup(db: DB, paths: Paths, reason = 'manual'): BackupInfo {
  const safeReason = reason.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40) || 'manual';
  const base = `worldkeeper-${stamp()}-${safeReason}`;
  const tmpDb = path.join(paths.stagingDir, `${base}.db`);
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  db.prepare('VACUUM INTO ?').run(tmpDb);
  const zip = new AdmZip();
  zip.addLocalFile(tmpDb, '', 'worldkeeper.db');
  if (fs.existsSync(paths.uploadsDir)) {
    for (const f of fs.readdirSync(paths.uploadsDir)) {
      const full = path.join(paths.uploadsDir, f);
      if (fs.statSync(full).isFile()) zip.addLocalFile(full, 'uploads');
    }
  }
  const counts = {
    entities: (db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n,
    relationships: (db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n,
    campaigns: (db.prepare('SELECT COUNT(*) n FROM campaigns').get() as { n: number }).n,
  };
  zip.addFile(
    'manifest.json',
    Buffer.from(JSON.stringify({ app: 'worldkeeper', format: 1, schemaVersion: schemaVersion(db), created_at: new Date().toISOString(), reason, counts }, null, 2)),
  );
  const out = path.join(paths.backupsDir, `${base}.wkbackup.zip`);
  zip.writeZip(out);
  fs.unlinkSync(tmpDb);
  pruneBackups(paths, 40);
  return { file: path.basename(out), size: fs.statSync(out).size, created_at: new Date().toISOString(), reason };
}

export function listBackups(paths: Paths): BackupInfo[] {
  if (!fs.existsSync(paths.backupsDir)) return [];
  return fs
    .readdirSync(paths.backupsDir)
    .filter((f) => f.endsWith('.wkbackup.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(paths.backupsDir, f));
      const reason = f.replace(/^worldkeeper-[0-9TZ-]+?-(\d{3}Z-)?/, '').replace('.wkbackup.zip', '');
      return { file: f, size: st.size, created_at: st.mtime.toISOString(), reason };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

/** Keep the newest `keep` automatic backups; manual and pre-restore backups are never pruned. */
function pruneBackups(paths: Paths, keep: number) {
  const auto = listBackups(paths).filter((b) => /-(auto|pre-import|daily)/.test(b.file));
  for (const b of auto.slice(keep)) fs.unlinkSync(path.join(paths.backupsDir, b.file));
}

export function backupPath(paths: Paths, file: string): string {
  if (!/^[\w.-]+\.wkbackup\.zip$/.test(file)) throw new Error('Invalid backup name');
  const full = path.join(paths.backupsDir, file);
  if (!fs.existsSync(full)) throw new Error('Backup not found');
  return full;
}

/**
 * Validate a backup archive and stage its database. Returns the path of a verified database file
 * that can replace the live one. Throws if the archive is not a Worldkeeper backup.
 */
export function stageRestore(paths: Paths, zipBuffer: Buffer): { dbFile: string; uploads: { name: string; data: Buffer }[]; manifest: Record<string, unknown> } {
  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('manifest.json');
  const dbEntry = zip.getEntry('worldkeeper.db');
  if (!manifestEntry || !dbEntry) throw new Error('Not a Worldkeeper backup (manifest.json or worldkeeper.db missing)');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as Record<string, unknown>;
  if (manifest.app !== 'worldkeeper') throw new Error('Not a Worldkeeper backup');
  if (Number(manifest.schemaVersion) > MIGRATIONS[MIGRATIONS.length - 1].version)
    throw new Error('This backup was made by a newer version of The Worldkeeper');
  const staged = path.join(paths.stagingDir, `restore-${stamp()}.db`);
  fs.writeFileSync(staged, dbEntry.getData());
  // Integrity check before anything is replaced.
  const test = new Database(staged, { readonly: true });
  try {
    const ok = test.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw new Error(`Backup database failed integrity check: ${ok}`);
    test.prepare('SELECT COUNT(*) FROM entities').get();
  } finally {
    test.close();
  }
  const uploads = zip
    .getEntries()
    .filter((e) => e.entryName.startsWith('uploads/') && !e.isDirectory)
    .map((e) => ({ name: path.basename(e.entryName), data: e.getData() }))
    .filter((u) => /^[\w.-]+$/.test(u.name));
  return { dbFile: staged, uploads, manifest };
}
