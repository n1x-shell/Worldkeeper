import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { h } from './util.js';
import { buildPlayerSite, playerSiteZip, siteBuildAvailable } from '../publish/site.js';
import { GitHubError, publishToGitHub } from '../publish/github.js';
import { getSecret, setSecret } from '../publish/secrets.js';
import { parseJson, now } from '../lib/json.js';
import { HttpError, badRequest } from '../lib/errors.js';

const configSchema = z.object({
  repo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, 'Enter the repository as owner/name, e.g. n1x-shell/Worldkeeper'),
  branch: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._/-]{1,100}$/)
    .default('gh-pages'),
  /** New token; '' removes the saved token; omitted keeps it. */
  token: z.string().trim().max(400).optional(),
});

interface PublishConfig {
  repo: string;
  branch: string;
}

/** Publishing the Player Handbook (a static, player-safe site) to GitHub Pages or as a ZIP. DM server only. */
export function publishRoutes(ctx: AppContext) {
  const r = Router();
  const readConfig = (): PublishConfig | null =>
    parseJson<PublishConfig | null>((ctx.db.prepare(`SELECT value FROM settings WHERE key = 'publish_github'`).get() as { value: string } | undefined)?.value, null);
  const setSetting = (k: string, v: string) =>
    ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
  const status = () => ({
    config: readConfig(),
    tokenSaved: !!getSecret(ctx.paths, 'github_token'),
    last: parseJson((ctx.db.prepare(`SELECT value FROM settings WHERE key = 'publish_last'`).get() as { value: string } | undefined)?.value, null),
    available: siteBuildAvailable(),
    preview: siteBuildAvailable() ? buildPlayerSite(ctx.db, ctx.paths).summary : null,
  });

  r.get('/publish', h(() => status()));

  r.put(
    '/publish/config',
    h((req) => {
      const d = configSchema.parse(req.body ?? {});
      setSetting('publish_github', JSON.stringify({ repo: d.repo, branch: d.branch }));
      if (d.token !== undefined) setSecret(ctx.paths, 'github_token', d.token || null);
      return status();
    }),
  );

  r.get(
    '/publish/site.zip',
    h((_req, res) => {
      const { files } = buildPlayerSite(ctx.db, ctx.paths);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="player-handbook-${now().slice(0, 10)}.zip"`);
      res.send(playerSiteZip(files));
    }),
  );

  r.post(
    '/publish/github',
    h(async (req) => {
      if (req.body?.confirm !== true) throw badRequest('Publishing must be confirmed');
      const cfg = readConfig();
      if (!cfg) throw badRequest('Set the repository first');
      const token = getSecret(ctx.paths, 'github_token');
      if (!token) throw badRequest('Save a GitHub token first');
      const prev = parseJson<{ contentHash?: string; summary?: { generated_at: string } } | null>(
        (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'publish_last'`).get() as { value: string } | undefined)?.value,
        null,
      );
      const { files, summary, contentHash } = buildPlayerSite(
        ctx.db,
        ctx.paths,
        prev?.contentHash && prev.summary ? { contentHash: prev.contentHash, generated_at: prev.summary.generated_at } : null,
      );
      const [owner, repo] = cfg.repo.split('/');
      try {
        const result = await publishToGitHub({
          owner,
          repo,
          branch: cfg.branch,
          token,
          files,
          message: `Update player handbook (${summary.entries} entries, ${summary.maps} maps)`,
          apiBase: process.env.WORLDKEEPER_GITHUB_API || undefined,
        });
        const last = { ...result, at: now(), summary, contentHash, repo: cfg.repo, branch: cfg.branch };
        setSetting('publish_last', JSON.stringify(last));
        return last;
      } catch (e) {
        if (e instanceof GitHubError) throw new HttpError(e.status === 401 || e.status === 404 ? 400 : 502, e.message);
        throw new HttpError(502, `Could not reach GitHub: ${(e as Error).message}`);
      }
    }),
  );
  return r;
}
