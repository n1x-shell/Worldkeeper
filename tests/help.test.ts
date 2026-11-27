/** Help inside the app (v0.9.21, docs/BETA_PLAN.md A5): the guides are part of the app, and they hold together. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { GUIDES, HELP_FOR_PAGE, helpFor, resolveLink, searchHelp, sections, slugify } from '../shared/help.js';
import { updatedNote, updatedNoteSeen } from '../server/src/whatsNew.js';
import { APP_VERSION } from '../shared/version.js';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, 'docs', file), 'utf8');
const docs = GUIDES.map((g) => ({ slug: g.slug, file: g.file, markdown: read(g.file) }));
const ids = new Map(docs.map((d) => [d.slug, new Set(sections(d.markdown).map((s) => s.id))]));

describe('the guides in the app', () => {
  it('are the ones the app bundles, each with a title of its own', () => {
    const bundled = /docs\/\{([A-Z_,]+)\}\.md/.exec(fs.readFileSync(path.join(root, 'client/src/lib/helpDocs.ts'), 'utf8'))![1].split(',');
    expect(bundled.sort()).toEqual(GUIDES.map((g) => g.file.replace('.md', '')).sort());
    for (const d of docs) {
      const first = sections(d.markdown)[0];
      expect(first?.level, `${d.file} starts with its title`).toBe(1);
    }
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    // No guide has two headings with the same words: each heading's address is just its words.
    for (const d of docs) expect(sections(d.markdown).filter((x) => /-\d+$/.test(x.id) && !/-\d+$/.test(slugify(x.title))).map((x) => `${d.file}: ${x.title}`)).toEqual([]);
  });

  it('are split at their headings, not at a # inside an example', () => {
    const s = sections('# Title\n\nIntro.\n\n## One\n\nText one.\n\n```md\n# Not a heading\n## Nor this\n```\n\n## Two & more\n\n### Deep\n\n## One\n');
    expect(s.map((x) => [x.level, x.title, x.id])).toEqual([
      [1, 'Title', 'title'],
      [2, 'One', 'one'],
      [2, 'Two & more', 'two--more'],
      [3, 'Deep', 'deep'],
      [2, 'One', 'one-1'],
    ]);
    expect(s[1].text).toContain('# Not a heading');
    // As GitHub addresses them, so a link written for the repository lands in the same place in the app.
    expect(slugify('Bringing your own notes (an Obsidian vault or plain Markdown)')).toBe('bringing-your-own-notes-an-obsidian-vault-or-plain-markdown');
    expect(slugify('Worlds & Realms')).toBe('worlds--realms');
    expect(slugify('2. Start your world')).toBe('2-start-your-world');
    expect(slugify('`pack.json`')).toBe('packjson');
    // The guides that show whole files: their examples' headings are not parts of the guide.
    expect([...ids.get('worldbooks')!]).not.toContain('the-lamp');
    expect([...ids.get('rules')!]).not.toContain('child-of-the-sea');
  });

  it('link only to places that exist: another guide’s heading, or a page of the project', () => {
    const problems: string[] = [];
    for (const d of docs) {
      // Links outside code examples.
      const text = d.markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const to = resolveLink(m[1]);
        if (to.kind === 'guide') {
          if (to.anchor && !ids.get(to.slug)!.has(to.anchor)) problems.push(`${d.file}: ${m[1]} (no such heading in that guide)`);
        } else if (to.kind === 'anchor') {
          if (!ids.get(d.slug)!.has(to.anchor)) problems.push(`${d.file}: ${m[1]} (no such heading here)`);
        } else if (to.url.startsWith('https://github.com/n1x-shell/Worldkeeper/blob/main/')) {
          // A file of the project that is not a guide: it must be there.
          const file = to.url.split('/blob/main/')[1].split('#')[0];
          if (!fs.existsSync(path.join(root, file))) problems.push(`${d.file}: ${m[1]} (no such file: ${file})`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(resolveLink('DATA.md#backups')).toEqual({ kind: 'guide', slug: 'data', anchor: 'backups' });
    expect(resolveLink('#the-log')).toEqual({ kind: 'anchor', anchor: 'the-log' });
    expect(resolveLink('../README.md#run-from-source')).toEqual({ kind: 'outside', url: 'https://github.com/n1x-shell/Worldkeeper/blob/main/README.md#run-from-source' });
    expect(resolveLink('DESKTOP.md')).toEqual({ kind: 'outside', url: 'https://github.com/n1x-shell/Worldkeeper/blob/main/docs/DESKTOP.md' });
    expect(resolveLink('https://example.org/x')).toEqual({ kind: 'outside', url: 'https://example.org/x' });
  });
});

describe('help for the screen you are on', () => {
  it('names a heading that exists, for every screen it knows', () => {
    for (const [prefix, slug, anchor] of HELP_FOR_PAGE) {
      expect(ids.has(slug), `${prefix}: the guide "${slug}"`).toBe(true);
      if (anchor) expect(ids.get(slug)!.has(anchor), `${prefix}: "${anchor}" in ${slug}`).toBe(true);
    }
  });

  it('takes the closest match, and the quick start when it knows nothing closer', () => {
    expect(helpFor('/campaign')).toEqual({ slug: 'features', anchor: 'campaigns' });
    expect(helpFor('/campaign/calendar')).toEqual({ slug: 'features', anchor: 'calendars' });
    expect(helpFor('/campaign/party')).toEqual({ slug: 'features', anchor: 'campaigns' });
    expect(helpFor('/e/NPC-0001')).toEqual({ slug: 'features', anchor: 'encyclopedia' });
    expect(helpFor('/e/DUN-0001/plan')).toEqual({ slug: 'features', anchor: 'plans-of-places' });
    expect(helpFor('/backups')).toEqual({ slug: 'data', anchor: 'backups' });
    expect(helpFor('/')).toEqual({ slug: 'start', anchor: '' });
    expect(helpFor('/somewhere-new')).toEqual({ slug: 'start', anchor: '' });
    // "/e" is not the start of "/export-something".
    expect(helpFor('/elsewhere')).toEqual({ slug: 'start', anchor: '' });
  });

  it('knows every screen in the app’s menus that has a part of the guides about it', () => {
    // Each address the app routes to is either known here or falls back to the quick start: none throws.
    const routes = [...fs.readFileSync(path.join(root, 'client/src/App.tsx'), 'utf8').matchAll(/path="([a-z][^"*:]*)/g)].map((m) => `/${m[1].replace(/\/$/, '')}`);
    expect(routes.length).toBeGreaterThan(40);
    for (const r of routes) expect(GUIDES.some((g) => g.slug === helpFor(r).slug), r).toBe(true);
  });
});

describe('searching the guides', () => {
  const find = (q: string) => searchHelp(docs, q);
  it('finds what a GM would ask for, the heading that says it first', () => {
    expect(find('backup')[0]).toMatchObject({ slug: 'data', id: 'backups' });
    expect(find('keyboard')[0].slug).toBe('shortcuts');
    expect(find('obsidian').some((h) => h.slug === 'data')).toBe(true);
    expect(find('open the table').some((h) => h.slug === 'players')).toBe(true);
    expect(find('bug report').some((h) => h.slug === 'trouble')).toBe(true);
    expect(find('worldbook')[0].title.toLowerCase()).toContain('worldbook');
  });

  it('needs every word, ignores what is too short to mean anything, and says where the words are', () => {
    expect(find('backup zzzznothing')).toEqual([]);
    expect(find('a')).toEqual([]);
    expect(find('   ')).toEqual([]);
    const hit = find('restore')[0];
    expect(hit.snippet.toLowerCase()).toContain('restore');
    expect(hit.snippet.length).toBeLessThan(200);
    expect(find('backup').length).toBeLessThanOrEqual(12);
    expect(searchHelp(docs, 'backup', 3)).toHaveLength(3);
  });
});

describe('what’s new', () => {
  it('has an entry for this version, newest first', () => {
    const versions = sections(read('WHATS_NEW.md'))
      .filter((s) => s.level === 2)
      .map((s) => s.title);
    expect(versions[0]).toBe(APP_VERSION);
    const n = (v: string) => v.split('.').map(Number);
    // Each is newer than the one under it, part by part (1.0.0 is newer than 0.9.30).
    const weight = (v: string) => n(v).reduce((sum, part) => sum * 1000 + part, 0);
    for (let i = 1; i < versions.length; i++) expect(weight(versions[i - 1]), `${versions[i - 1]} before ${versions[i]}`).toBeGreaterThan(weight(versions[i]));
  });

  it('is said once after an update, never on a first install, and not for going back a version', async () => {
    // A first install: nothing in it, nothing to be told.
    const fresh = tempContext();
    expect(updatedNote(fresh.paths, () => false)).toBeNull();
    expect(updatedNote(fresh.paths, () => true)).toBeNull();

    // An installation from before this was kept, with a world in it: told, without a version to name.
    const old = tempContext();
    expect(updatedNote(old.paths, () => true)).toEqual({ from: null, to: APP_VERSION });
    expect(updatedNote(old.paths, () => true)).toEqual({ from: null, to: APP_VERSION });
    updatedNoteSeen(old.paths);
    expect(updatedNote(old.paths, () => true)).toBeNull();

    // The version before ran here: told which, until seen. Through the app as the page asks.
    const ctx = tempContext();
    const file = path.join(ctx.paths.sharedDir, 'app.json');
    fs.writeFileSync(file, JSON.stringify({ version: '0.9.3', from: null, pending: false }));
    const app = createApp(ctx);
    expect((await request(app).get('/api/meta')).body.updated).toEqual({ from: '0.9.3', to: APP_VERSION });
    expect((await request(app).get('/api/meta')).body.updated).toEqual({ from: '0.9.3', to: APP_VERSION });
    await request(app).post('/api/meta/whats-new-seen').expect(200);
    expect((await request(app).get('/api/meta')).body.updated).toBeNull();
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ version: APP_VERSION, pending: false });

    // A newer version ran here and this older one was put back: not news.
    fs.writeFileSync(file, JSON.stringify({ version: '99.0.0', from: null, pending: false }));
    expect((await request(app).get('/api/meta')).body.updated).toBeNull();
  });
});
