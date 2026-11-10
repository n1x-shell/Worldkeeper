import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export interface SourceFile {
  path: string;
  content: string;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_FILES = 20000;

/** Reject absolute paths, traversal and odd characters; returns a normalised forward-slash path. */
export function safeRelativePath(p: string): string | null {
  const norm = p.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!norm || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null;
  const parts = norm.split('/');
  if (parts.some((s) => s === '..' || s === '')) return null;
  if (parts.some((s) => s.startsWith('__MACOSX') || s === '.DS_Store')) return null;
  return parts.join('/');
}

/** Remove a single shared top-level folder (e.g. `Unified_World_Amsel/`) so paths are library-relative. */
export function stripCommonRoot(files: SourceFile[]): SourceFile[] {
  if (!files.length) return files;
  const firsts = new Set(files.map((f) => f.path.split('/')[0]));
  if (firsts.size === 1 && files.every((f) => f.path.includes('/'))) {
    const root = [...firsts][0] + '/';
    return files.map((f) => ({ ...f, path: f.path.slice(root.length) }));
  }
  return files;
}

export function readZip(buffer: Buffer): SourceFile[] {
  const zip = new AdmZip(buffer);
  const out: SourceFile[] = [];
  let total = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const rel = safeRelativePath(entry.entryName);
    if (!rel || !rel.toLowerCase().endsWith('.md')) continue;
    const size = entry.header.size;
    if (size > MAX_FILE_BYTES) throw new Error(`File too large in archive: ${rel}`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error('Archive is larger than the 300 MB import limit');
    if (out.length >= MAX_FILES) throw new Error('Archive contains too many files');
    out.push({ path: rel, content: entry.getData().toString('utf8') });
  }
  return stripCommonRoot(out).sort((a, b) => a.path.localeCompare(b.path));
}

export function readDirectory(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(d, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        const st = fs.statSync(full);
        if (st.size > MAX_FILE_BYTES) throw new Error(`File too large: ${full}`);
        out.push({ path: path.relative(dir, full).split(path.sep).join('/'), content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir);
  return stripCommonRoot(out).sort((a, b) => a.path.localeCompare(b.path));
}

export function readSource(p: string): SourceFile[] {
  const st = fs.statSync(p);
  if (st.isDirectory()) return readDirectory(p);
  return readZip(fs.readFileSync(p));
}
