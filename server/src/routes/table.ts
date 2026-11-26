import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h } from './util.js';
import { badRequest } from '../lib/errors.js';
import { checkForUpdate, clearInstallStatus, setUpdateCheck, updateStatus } from '../updateCheck.js';
import { closeTable, openTable, tableStatus } from '../table.js';
import { closeRemote, openRemote, remoteStatus, setPassword, signEveryoneOut } from '../remote.js';
import { clientReport, diagnostics } from '../diagnostics.js';
import { isDesktop, openFolder } from '../lib/desktop.js';
import { logClientError } from '../log.js';

/** Open or close the table (the player-only server on the network) from the GM app. GM only. */
export function tableRoutes(ctx: AppContext) {
  const r = Router();
  r.get(
    '/table',
    h(() => tableStatus()),
  );
  r.post(
    '/table',
    h((req) => (req.body?.open === false ? closeTable() : openTable(ctx))),
  );
  // The GM app from another device (v0.9.14): its password, and opening and closing it to the network. These answer
  // on the computer itself only: the network listener refuses them (server/src/remote.ts).
  r.get(
    '/remote',
    h(() => remoteStatus(ctx)),
  );
  // Here, on the computer itself, nobody needs to sign in.
  r.get(
    '/remote/session',
    h(() => ({ remote: false, signedIn: true })),
  );
  r.put(
    '/remote/password',
    h(async (req) => {
      const password = req.body?.password;
      if (password !== null && typeof password !== 'string') throw badRequest('Give a password');
      setPassword(ctx.paths, password);
      // Without a password the door can't stay open.
      if (!password) await closeRemote(ctx);
      return remoteStatus(ctx);
    }),
  );
  r.post(
    '/remote',
    h((req) => (req.body?.open === false ? closeRemote(ctx) : openRemote(ctx))),
  );
  r.post(
    '/remote/sign-out-all',
    h(() => (signEveryoneOut(), remoteStatus(ctx))),
  );
  // Is there a newer version? (v0.9.17.) What is known, the switch, and asking now.
  r.get(
    '/update',
    h(() => updateStatus(ctx.paths)),
  );
  r.put(
    '/update',
    h((req) => setUpdateCheck(ctx.paths, req.body?.enabled !== false)),
  );
  r.post(
    '/update/check',
    h(() => checkForUpdate(ctx.paths, { force: true })),
  );
  // A failed "Update and restart" has been read: forget it.
  r.post(
    '/update/dismiss',
    h(() => (clearInstallStatus(ctx.paths), updateStatus(ctx.paths))),
  );
  // When something goes wrong (v0.9.19): the details for a bug report, as text the GM reads and copies themselves.
  r.get(
    '/diagnostics',
    h(() => diagnostics(ctx)),
  );
  r.post(
    '/diagnostics/open-logs',
    h(() => {
      if (!isDesktop()) throw badRequest('Only the desktop app opens folders');
      return openFolder(diagnostics(ctx).logs);
    }),
  );
  // The page says what it ran into (a screen that broke), so it is in the log with everything else.
  r.post(
    '/log/client',
    h((req) => {
      const report = clientReport(req.body);
      if (report) logClientError(report);
      return { logged: !!report };
    }),
  );
  return r;
}
