/**
 * When the library can't be opened at start (v0.9.15): instead of a server that never answers, a plain page that says
 * what happened, that nothing was changed, where the copy from before is, and what to do. It needs nothing of the
 * app's own pages or database. From it the GM can try again, or open another library.
 */
import express from 'express';
import { NewerLibraryError, UpgradeError } from './db/migrations.js';
import { readIndex } from './libraries.js';
import { scrub } from './log.js';

const ISSUES = 'https://github.com/n1x-shell/Worldkeeper/issues';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface RecoveryInfo {
  error: unknown;
  rootDir: string;
  /** The library that couldn't be opened, and where its files are. */
  library: { id: string; name: string; dir: string; backupsDir: string } | null;
  version: string;
  /** The details for a bug report (server/src/diagnostics.ts): the system and what the log says. */
  details?: string;
}

/** What to tell the GM, in plain words. */
export function describeFailure(error: unknown): { title: string; what: string; todo: string[]; backup: string | null; detail: string } {
  if (error instanceof NewerLibraryError)
    return {
      title: 'This library needs a newer version',
      what: 'It was last opened with a newer version of The Worldkeeper than this one. Nothing has been changed.',
      todo: ['Install the newest version of The Worldkeeper and open it again.', 'Or open another library below.'],
      backup: null,
      detail: error.message,
    };
  if (error instanceof UpgradeError)
    return {
      title: 'This library could not be updated',
      what: 'This version of The Worldkeeper needs to update the library before opening it, and the update did not go through. Nothing has been changed: the library is exactly as it was.',
      todo: [
        'Your world is safe. To keep working now, install the version you had before: it opens this library as it is.',
        'Please report this, with the details below, so it can be fixed.',
        'Or open another library below.',
      ],
      backup: error.info.backup,
      detail: error.info.cause,
    };
  const e = error as { message?: string; code?: string };
  return {
    title: 'This library could not be opened',
    what: 'The Worldkeeper could not open the library’s files. Nothing has been changed by this attempt.',
    todo: [
      'Check that the disk is not full and that no other copy of the app has it open, then try again.',
      'If it still fails, your world can be brought back from one of the library’s backups: “Getting your world back” in docs/TROUBLESHOOTING.md (on the project’s page) has the steps.',
      'Or open another library below.',
    ],
    backup: null,
    detail: `${e?.code ? `${e.code}: ` : ''}${e?.message ?? String(error)}`,
  };
}

/**
 * The app that answers while no library is open. `retry` tries again (optionally with another library chosen) and
 * returns true once the real app has taken over.
 */
export function recoveryApp(info: () => RecoveryInfo, retry: (libraryId?: string) => boolean) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));
  app.get('/api/health', (_req, res) => res.status(503).json({ ok: false, recovery: true, error: describeFailure(info().error).title }));
  app.post('/recover', (req, res) => {
    const id = typeof (req.body as { library?: unknown })?.library === 'string' ? (req.body as { library: string }).library : undefined;
    // Only a library this installation lists.
    const known = (readIndex(info().rootDir)?.libraries ?? []).some((l) => l.id === id);
    retry(id && known ? id : undefined);
    res.redirect(303, '/');
  });
  app.use('/api', (_req, res) => res.status(503).json({ error: describeFailure(info().error).title, recovery: true }));
  app.use((_req, res) => {
    const i = info();
    const f = describeFailure(i.error);
    const others = (readIndex(i.rootDir)?.libraries ?? []).filter((l) => l.id !== i.library?.id && !l.archived);
    res
      .status(503)
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
      .setHeader('Cache-Control', 'no-store')
      .type('html')
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Worldkeeper</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;background:#f3ecdd;color:#2b2418;margin:0;padding:2rem}
main{max-width:44rem;margin:0 auto;background:#fbf6ea;border:1px solid #d9cdb3;border-radius:10px;padding:1.5rem 2rem}
h1{font-size:1.4rem;color:#7a5a17;margin:.2rem 0 1rem} h2{font-size:1rem;margin:1.4rem 0 .4rem}
code,pre{background:#efe6d2;border-radius:4px;padding:.1rem .35rem;font-size:.9em;word-break:break-all;white-space:pre-wrap}
pre{padding:.6rem .8rem} button{font:inherit;padding:.45rem .9rem;border-radius:6px;border:1px solid #b89b5e;background:#e9dcbd;cursor:pointer}
button.plain{background:transparent} li{margin:.3rem 0} .muted{color:#6b604c;font-size:.9rem} form{display:inline}
</style></head><body><main>
<p class="muted">The Worldkeeper ${esc(i.version)}</p>
<h1>${esc(f.title)}</h1>
${i.library ? `<p><b>${esc(i.library.name)}</b></p>` : ''}
<p>${esc(f.what)}</p>
<h2>What to do</h2>
<ul>${f.todo
  .filter((t) => others.length > 0 || !/another library below/.test(t))
  .map((t) => `<li>${esc(t)}</li>`)
  .join('')}</ul>
${f.backup && i.library ? `<p>A copy from just before the update was made: <code>${esc(f.backup)}</code>, in <code>${esc(i.library.backupsDir)}</code>.</p>` : ''}
${i.library ? `<p class="muted">The library’s files are in <code>${esc(i.library.dir)}</code>, and its backups in <code>${esc(i.library.backupsDir)}</code>.</p>` : ''}
<p><form method="post" action="/recover"><button type="submit">Try again</button></form></p>
${
  others.length
    ? `<h2>Open another library</h2><p>${others.map((l) => `<form method="post" action="/recover"><input type="hidden" name="library" value="${esc(l.id)}"><button class="plain" type="submit">${esc(l.name)}</button></form>`).join(' ')}</p>`
    : ''
}
<h2>Details, for a bug report</h2>
<p class="muted">To report this, open a new issue at <code>${esc(ISSUES)}</code> and paste what is below. It holds versions, numbers and what the app logged; nothing from your world. Read it first if you like.</p>
<pre>${esc(scrub(`${f.title}\n${f.detail}\n\n${i.details ?? `The Worldkeeper ${i.version}`}`))}</pre>
</main></body></html>`);
  });
  return app;
}
