/**
 * Large imports (v0.6.7): read a ZIP's listing without unpacking it, and build smaller ZIPs ("parts") from some of its
 * files by copying their compressed bytes as they are. In the browser the archive is read in slices (File.slice), so
 * neither the browser nor the server ever holds the whole archive.
 *
 * Reads ZIP and ZIP64 listings; files are stored or deflated. Parts are plain ZIPs (each file under 4 GB).
 */

/** Read bytes from an archive: a File in the browser, a Buffer in tests. */
export interface ZipSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  time: number;
  date: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const U32 = 0xffffffff;

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));
const utf8 = new TextDecoder();

/** Every file in the archive, from its central directory (no file is read or unpacked). */
export async function listZip(src: ZipSource): Promise<ZipEntry[]> {
  const tailLen = Math.min(src.size, 65557);
  const tail = await src.read(src.size - tailLen, tailLen);
  const tv = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (tv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Not a ZIP file');
  let count = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === U32 || cdOffset === U32) {
    // ZIP64: the locator just before the end record points to the ZIP64 end record.
    const loc = eocd - 20;
    if (loc < 0 || tv.getUint32(loc, true) !== SIG_EOCD64_LOCATOR) throw new Error('Damaged ZIP64 archive');
    const rec = view(await src.read(u64(tv, loc + 8), 56));
    if (rec.getUint32(0, true) !== SIG_EOCD64) throw new Error('Damaged ZIP64 archive');
    count = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  }
  const cd = await src.read(cdOffset, cdSize);
  const v = view(cd);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Damaged ZIP directory');
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const e: ZipEntry = {
      flags: v.getUint16(p + 8, true),
      method: v.getUint16(p + 10, true),
      time: v.getUint16(p + 12, true),
      date: v.getUint16(p + 14, true),
      crc: v.getUint32(p + 16, true),
      compressedSize: v.getUint32(p + 20, true),
      size: v.getUint32(p + 24, true),
      localOffset: v.getUint32(p + 42, true),
      name: utf8.decode(cd.subarray(p + 46, p + 46 + nameLen)),
    };
    // ZIP64 extra field: the 64-bit values, in order, for those that are 0xFFFFFFFF above.
    let x = p + 46 + nameLen;
    const end = x + extraLen;
    while (x + 4 <= end) {
      const id = v.getUint16(x, true);
      const len = v.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (e.size === U32) ((e.size = u64(v, q)), (q += 8));
        if (e.compressedSize === U32) ((e.compressedSize = u64(v, q)), (q += 8));
        if (e.localOffset === U32) e.localOffset = u64(v, q);
      }
      x += 4 + len;
    }
    out.push(e);
    p = end + commentLen;
  }
  return out;
}

const isDir = (e: ZipEntry) => e.name.endsWith('/');
export const isMarkdown = (e: ZipEntry) => !isDir(e) && /\.md$/i.test(e.name);
export const SIDECAR = '_worldkeeper/library.json';
export const isSidecar = (e: ZipEntry) => !isDir(e) && e.name.replace(/\\/g, '/').endsWith(SIDECAR);

/** What an import would read: the Markdown files, their text size, and the archive's own size. */
export function measure(entries: ZipEntry[], archiveBytes: number) {
  const md = entries.filter(isMarkdown);
  return { files: md.length, textBytes: md.reduce((n, e) => n + e.size, 0), archiveBytes, largestFile: md.reduce((n, e) => Math.max(n, e.size), 0) };
}

/**
 * The shared top folder an import strips (as the server does for a whole archive: one first folder that every
 * Markdown file sits under), so each part's paths come out as they would in one import. '' when there is none.
 */
export function commonRoot(entries: ZipEntry[]): string {
  const md = entries.filter(isMarkdown).map((e) => e.name.replace(/\\/g, '/').replace(/^\.\/+/, ''));
  if (!md.length || !md.every((n) => n.includes('/'))) return '';
  const firsts = new Set(md.map((n) => n.split('/')[0]));
  return firsts.size === 1 ? `${[...firsts][0]}/` : '';
}

/**
 * Split the Markdown files into parts, each under `textBytes` of text, `maxFiles` files and `maxCompressed` bytes as
 * stored. Files stay with their top folder (after `root`) where they fit, so files that belong together, such as a
 * compendium and its entries, are read in one part; a folder too big for a part is split by path. The sidecar (a
 * Worldkeeper export's realms, templates and reveals) and any `everyPart` files (a setting's locator) go in every part.
 */
export function planParts(entries: ZipEntry[], o: { textBytes: number; root?: string; everyPart?: string[]; maxFiles?: number; maxCompressed?: number }): ZipEntry[][] {
  const maxFiles = o.maxFiles ?? 5000;
  const maxCompressed = o.maxCompressed ?? 200 * 1024 * 1024;
  const root = o.root ?? '';
  const every = entries.filter((e) => isSidecar(e) || (o.everyPart ?? []).includes(e.name));
  const md = entries.filter((e) => isMarkdown(e) && !every.includes(e)).sort((a, b) => a.name.localeCompare(b.name));
  const folder = (e: ZipEntry) => {
    const rel = e.name.startsWith(root) ? e.name.slice(root.length) : e.name;
    return rel.includes('/') ? rel.split('/')[0] : '';
  };
  const groups: ZipEntry[][] = [];
  for (const e of md) {
    const last = groups[groups.length - 1];
    if (last && folder(last[0]) === folder(e)) last.push(e);
    else groups.push([e]);
  }
  const fits = (cur: ZipEntry[], add: ZipEntry[]) =>
    cur.length + add.length <= maxFiles && [...cur, ...add].reduce((n, e) => n + e.size, 0) <= o.textBytes && [...cur, ...add].reduce((n, e) => n + e.compressedSize, 0) <= maxCompressed;
  const parts: ZipEntry[][] = [];
  let cur: ZipEntry[] = [];
  for (const g of groups) {
    if (fits(cur, g)) {
      cur.push(...g);
      continue;
    }
    if (cur.length) parts.push(cur);
    cur = [];
    // A folder too big for one part: split it by path.
    for (const e of g) {
      if (cur.length && !fits(cur, [e])) {
        parts.push(cur);
        cur = [];
      }
      cur.push(e);
    }
  }
  if (cur.length) parts.push(cur);
  return parts.map((p) => [...p, ...every]);
}

/** A part as a ZIP: each file's local header and compressed bytes copied as they are, then a new directory. */
export async function buildPart(src: ZipSource, files: ZipEntry[]): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const e of files) {
    if (e.size >= U32 || e.compressedSize >= U32) throw new Error(`${e.name} is too large to import (4 GB or more)`);
    if (e.method !== 0 && e.method !== 8) throw new Error(`${e.name} uses a compression this app can't read`);
    const lh = view(await src.read(e.localOffset, 30));
    if (lh.getUint32(0, true) !== SIG_LOCAL) throw new Error('Damaged ZIP archive');
    const dataStart = e.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const data = await src.read(dataStart, e.compressedSize);
    const name = enc.encode(e.name);
    const flags = (e.flags & ~0x0008) | 0x0800; // sizes in the header (no data descriptor); UTF-8 names
    const local = new Uint8Array(30 + name.length);
    const l = view(local);
    l.setUint32(0, SIG_LOCAL, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, e.method, true);
    l.setUint16(10, e.time, true);
    l.setUint16(12, e.date, true);
    l.setUint32(14, e.crc, true);
    l.setUint32(18, e.compressedSize, true);
    l.setUint32(22, e.size, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);
    const c = new Uint8Array(46 + name.length);
    const cv = view(c);
    cv.setUint32(0, SIG_CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, e.time, true);
    cv.setUint16(14, e.date, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.compressedSize, true);
    cv.setUint32(24, e.size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    c.set(name, 46);
    chunks.push(local, data);
    central.push(c);
    offset += local.length + data.length;
    if (offset >= U32) throw new Error('A part came out larger than 4 GB');
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = view(end);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return [...chunks, ...central, end];
}
