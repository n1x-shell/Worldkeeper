/**
 * The app's own log (v0.9.19, docs/BETA_PLAN.md A3). Until now what the server said went to the terminal it was started
 * from, which a GM using the desktop app never sees, and an unexpected error left nothing behind to send with a bug
 * report. This keeps a plain text file, `logs/worldkeeper.log` in the data folder:
 *
 * - what the app is and where it runs (version, system), when it starts and stops;
 * - what it does to the library on its own: an update of the library, an automatic backup, opening the table;
 * - every unexpected error, with where in the code it happened.
 *
 * It never holds a record's text, a request's content or a search: an error is logged with the kind of request it
 * happened in (`POST /api/entities`), not what was sent. The file is kept small (about 1 MB, then one older file), is
 * not part of any backup or export, and goes nowhere unless the GM copies from it (server/src/diagnostics.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import { isDesktop } from './lib/desktop.js';

const MAX_BYTES = 1_000_000;
type Level = 'INFO' | 'WARN' | 'ERROR';

let file: string | null = null;
let size = 0;
let restoreConsole: (() => void) | null = null;

export const logsDir = (rootDir: string) => path.join(rootDir, 'logs');
/** The file being written, or null when the log isn't on (the tests, the command-line tools). */
export const logFile = () => file;

function rotate() {
  if (!file) return;
  try {
    fs.renameSync(file, `${file}.1`);
  } catch {
    // Can't be moved aside (open elsewhere on Windows): start it again where it is.
    try {
      fs.truncateSync(file);
    } catch {
      /* nothing more to try */
    }
  }
  size = 0;
}

/** One entry. False when it couldn't be written (the disk is full, the folder is gone): the caller says it elsewhere. */
function write(level: Level, text: string): boolean {
  if (!file) return false;
  const entry = `${new Date().toISOString()} ${level.padEnd(5)} ${text.replace(/\r?\n/g, '\n    ')}\n`;
  try {
    if (size + entry.length > MAX_BYTES) rotate();
    fs.appendFileSync(file, entry);
    size += Buffer.byteLength(entry);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the log in this data folder. From here on, everything the server says (console.log, .warn, .error) is written
 * to the file too. In the desktop app it is written only to the file: the app's shell keeps whatever the server prints
 * in `logs/server.log`, which is then left for what can't be logged here (the server failing before it starts).
 */
export function startLog(rootDir: string, name = 'worldkeeper.log'): string | null {
  stopLog();
  try {
    fs.mkdirSync(logsDir(rootDir), { recursive: true });
    file = path.join(logsDir(rootDir), name);
    size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size > MAX_BYTES) rotate();
  } catch {
    file = null;
    return null;
  }
  const quiet = isDesktop();
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const tee =
    (level: Level, out: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const written = write(level, util.format(...args));
      if (!quiet || !written) out(...args);
    };
  console.log = tee('INFO', original.log);
  console.info = tee('INFO', original.info);
  console.warn = tee('WARN', original.warn);
  console.error = tee('ERROR', original.error);
  restoreConsole = () => Object.assign(console, original);
  return file;
}

export function stopLog() {
  restoreConsole?.();
  restoreConsole = null;
  file = null;
  size = 0;
}

/** Something worth knowing later (a library opened, an update of it ran). Only into the file: silent when the log is off. */
export function logInfo(text: string) {
  write('INFO', `[worldkeeper] ${text}`);
}

/**
 * An unexpected error, with what was being done (never what was sent). The stack says where in the code it happened.
 * Without a log file it goes to the terminal, as before.
 */
export function logError(doing: string, err: unknown) {
  const e = err as { stack?: unknown; message?: unknown; code?: unknown } | null;
  const detail = typeof e?.stack === 'string' ? e.stack : typeof e?.message === 'string' ? e.message : util.inspect(err, { depth: 2 });
  const text = `${doing}${typeof e?.code === 'string' ? ` [${e.code}]` : ''}\n${detail}`;
  if (!write('ERROR', text)) console.error(`[worldkeeper] ${text}`);
}

/** Something the page ran into (client/src/lib/report.ts): a screen that broke, a script error. */
export function logClientError(o: { message: string; stack?: string; where?: string }) {
  write('ERROR', `in the page${o.where ? ` at ${o.where}` : ''}: ${o.message}${o.stack ? `\n${o.stack}` : ''}`);
}

/** The newest lines of the log (the older file first, if the current one is short), for a bug report. */
export function logTail(rootDir: string, lines = 150, name = 'worldkeeper.log'): string {
  const read = (f: string) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  };
  const current = path.join(logsDir(rootDir), name);
  let all = read(current).split('\n');
  if (all.length <= lines) all = [...read(`${current}.1`).split('\n'), ...all];
  return all
    .filter((l) => l !== '')
    .slice(-lines)
    .join('\n');
}

/**
 * For anything that leaves the computer in a bug report: the GM's home folder (which is usually their name) becomes
 * "~", wherever it appears and however its slashes are written.
 */
export function scrub(text: string, home = os.homedir()): string {
  if (!home || home === path.parse(home).root) return text;
  const forms = new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]);
  let out = text;
  for (const f of forms) out = out.split(f).join('~');
  const user = path.basename(home);
  // What is left of the name in a path written another way (C:/Users/name, /Users/name).
  if (user.length >= 3) out = out.replace(new RegExp(`([\\\\/](?:Users|home)[\\\\/])${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\\\/\\s"'])`, 'gi'), '$1~');
  return out;
}
