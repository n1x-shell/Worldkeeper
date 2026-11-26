/**
 * "Copy details for a bug report" (v0.9.19, docs/BETA_PLAN.md A3): what someone fixing a bug needs to know and can't
 * guess, as plain text the GM reads before sending it anywhere. It says what the app and the computer are, how big the
 * library is, and what the log says happened. It holds numbers and versions, never names or text from the world: no
 * library name, no record, no campaign. The home folder's name is taken out of every path.
 *
 * Nothing here is sent anywhere by the app. The GM copies it and pastes it into a bug report themselves.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppContext } from './context.js';
import { APP_VERSION } from '../../shared/version.js';
import { LATEST_SCHEMA, schemaVersion } from './db/migrations.js';
import { isDesktop } from './lib/desktop.js';
import { parseJson } from './lib/json.js';
import { listBackups } from './backup/backup.js';
import { installedPacks } from './packs/registry.js';
import { modulesOn } from './repo/modules.js';
import { tableStatus } from './table.js';
import { remoteStatus } from './remote.js';
import { updateStatus } from './updateCheck.js';
import { logTail, logsDir, scrub } from './log.js';

export const ISSUES_NEW = 'https://github.com/n1x-shell/Worldkeeper/issues/new/choose';

const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);
/** One line, or "unknown" if finding it out fails: a report that can't be made is worse than one with a gap. */
const safe = (fn: () => string): string => {
  try {
    return fn();
  } catch {
    return 'unknown';
  }
};

/** The app and the computer: the same whether or not a library is open. */
export function systemLines(): string[] {
  return [
    `The Worldkeeper ${APP_VERSION} (${isDesktop() ? 'desktop app' : 'run from source'})`,
    `System: ${safe(() => `${os.type()} ${os.release()} ${os.arch()}`)} · ${safe(() => os.version())}`,
    `Node ${process.version} · memory ${size(os.totalmem())}`,
  ];
}

function libraryLines(ctx: AppContext): string[] {
  const n = (sql: string) => safe(() => String((ctx.db.prepare(sql).get() as { n: number }).n));
  const schema = safe(() => String(schemaVersion(ctx.db)));
  const backups = safe(() => {
    const all = listBackups(ctx.paths);
    return all.length ? `${all.length} (newest ${all.map((b) => b.created_at).sort().at(-1)!.slice(0, 10)})` : 'none';
  });
  const pictures = safe(() => {
    const files = fs.readdirSync(ctx.paths.uploadsDir);
    return `${files.length} (${size(files.reduce((sum, f) => sum + fs.statSync(path.join(ctx.paths.uploadsDir, f)).size, 0))})`;
  });
  const upgrade = parseJson<{ from: number; to: number; at: string } | null>((ctx.db.prepare(`SELECT value FROM settings WHERE key = 'upgrade_notice'`).get() as { value: string } | undefined)?.value ?? 'null', null);
  return [
    `Library: schema ${schema} of ${LATEST_SCHEMA()} · records ${n('SELECT COUNT(*) n FROM entities')} · campaigns ${n('SELECT COUNT(*) n FROM campaigns')} · sessions ${n('SELECT COUNT(*) n FROM sessions')} · characters ${n('SELECT COUNT(*) n FROM characters')}`,
    `Files: database ${safe(() => size(fs.statSync(ctx.paths.dbFile).size))} · pictures ${pictures} · backups ${backups} · free disk ${safe(() => {
      const s = fs.statfsSync(ctx.paths.rootDir);
      return size(Number(s.bavail) * Number(s.bsize));
    })}`,
    // The bundled worldbook by name; a GM's own worldbooks and books only as a count (their names are the GM's).
    `Worldbooks: ${safe(() => {
      const packs = installedPacks(ctx.db);
      const oros = packs.find((p) => p.id === 'worldkeeper');
      const others = packs.length - (oros ? 1 : 0);
      return [oros ? `Oros ${oros.version}` : null, others ? `${others} other${others === 1 ? '' : 's'}` : null].filter(Boolean).join(', ') || 'none';
    })} · rules from books: ${n('SELECT COUNT(*) n FROM shared.rules_packs')} · parts on: ${safe(() => [...modulesOn(ctx.db)].sort().join(', ') || 'none')}`,
    `Table: ${tableStatus().open ? 'open' : 'closed'} · GM app on the network: ${safe(() => (remoteStatus(ctx).open ? 'open' : 'closed'))}`,
    `Update check: ${safe(() => {
      const u = updateStatus(ctx.paths);
      return `${u.enabled ? 'on' : 'off'}${u.checked_at ? `, last ${u.checked_at.slice(0, 10)}` : ', never run'}${u.latest ? `, newest known ${u.latest.version}` : ''}${u.error ? `, problem: ${u.error}` : ''}${u.install ? `, install ${u.install.state}${u.install.error ? `: ${u.install.error}` : ''}` : ''}`;
    })}`,
    ...(upgrade ? [`This library was updated from schema ${upgrade.from} to ${upgrade.to} on ${upgrade.at.slice(0, 10)}`] : []),
    `Data folder: ${ctx.paths.rootDir}`,
  ];
}

/** The whole text. `ctx` is missing when no library could be opened (the recovery page): then only the system and the log. */
export function diagnosticsText(o: { ctx?: AppContext | null; rootDir: string; note?: string; lines?: number }): string {
  const log = logTail(o.rootDir, o.lines ?? 150);
  return scrub(
    [
      ...systemLines(),
      ...(o.ctx ? libraryLines(o.ctx) : [`Data folder: ${o.rootDir}`]),
      ...(o.note ? ['', o.note] : []),
      '',
      log ? `Log (the newest ${log.split('\n').length} lines):` : 'Log: nothing has been logged yet.',
      ...(log ? [log] : []),
    ].join('\n'),
  );
}

export function diagnostics(ctx: AppContext) {
  return {
    text: diagnosticsText({ ctx, rootDir: ctx.paths.rootDir }),
    logs: logsDir(ctx.paths.rootDir),
    /** The desktop app can show the folder in the file manager. */
    canOpen: isDesktop(),
    report: ISSUES_NEW,
  };
}

// ---- What the page ran into ------------------------------------------------------------------------------------------

/** No more than this many of the page's errors are logged in a minute: a screen that fails in a loop can't fill the log. */
const PER_MINUTE = 20;
let windowStart = 0;
let inWindow = 0;

/** A page's error report, cut to size. Null when it isn't one, or there have been too many. */
export function clientReport(body: unknown, now = Date.now()): { message: string; stack?: string; where?: string } | null {
  const b = (body ?? {}) as { message?: unknown; stack?: unknown; where?: unknown };
  if (typeof b.message !== 'string' || !b.message.trim()) return null;
  if (now - windowStart > 60_000) {
    windowStart = now;
    inWindow = 0;
  }
  if (++inWindow > PER_MINUTE) return null;
  // Where: the page's path only (which screen), never its query or what was typed.
  const where = typeof b.where === 'string' && /^\/[\w\-./%]*$/.test(b.where) ? b.where.slice(0, 200) : undefined;
  return { message: b.message.slice(0, 500), stack: typeof b.stack === 'string' ? b.stack.slice(0, 4000) : undefined, where };
}
