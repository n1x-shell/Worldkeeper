/** Exports are complete (docs/OWN_WORLD_PLAN.md §2.10): every table, campaigns whole, Markdown round trips, full-world ZIP. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { TABLES, exportCampaign, exportFullWorldZip, exportMarkdownZip } from '../server/src/backup/exporter.js';
import { finishSetup } from '../server/src/repo/setup.js';
import { createTemplate } from '../server/src/repo/templates.js';
import { updateEntity } from '../server/src/repo/entities.js';

/** Tables a JSON export leaves out, and why. */
const NOT_EXPORTED: Record<string, string> = {
  rules_packs: "your books' rules: imported again from your own copy, never carried with a world",
  rules_entries: "your books' rules (as above)",
  rules_pack_switches: "which of your books' rules this library uses: they're shared by every library, and never carried with a world",
  schema_migrations: 'the database version, written by the app itself',
};
const SEARCH = /^search_index/;

/** A small own world: realms, a campaign with its town and party, the records that teach. */
function ownWorld() {
  const ctx = tempContext();
  const made = finishSetup(ctx.db, {
    path: 'own',
    world: { name: 'Ostmark', pitch: 'Iron kings.' },
    realms: [{ key: 'c', name: 'Vael', kind: 'continent', parent: 'world' }],
    campaign: { title: 'The Iron Crown', town: 'Harrowgate', party: ['Ash'] },
    tutorial: true,
  });
  return { ctx, made };
}

describe('exports', () => {
  it('the JSON export covers every table in the schema', () => {
    const ctx = tempContext();
    const tables = (ctx.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((t) => t.name);
    const missing = tables.filter((t) => !SEARCH.test(t) && !(t in NOT_EXPORTED) && !TABLES.includes(t));
    expect(missing).toEqual([]);
    // And names nothing the schema doesn't have.
    expect(TABLES.filter((t) => !tables.includes(t))).toEqual([]);
  });

  it('a Markdown export makes the same library again: realms, templates, canon flags and reveals', async () => {
    const { ctx, made } = ownWorld();
    ctx.db.prepare(`UPDATE realms SET color = 'violet', icon = 'mountain' WHERE id = 'vael'`).run();
    createTemplate(ctx.db, { markdown: 'Template for: settlement\nName: Port\n\n# Port\n\n## Facts\n\n- **Harbour**: How big.\n\n## The docks\n\n> Guidance: Who works there.\n' });
    updateEntity(ctx.db, made.town!, {
      revealed: true,
      revealed_sections: ['A first look'],
      revealed_facts: ['Population: about 400'],
      player_summary: 'A mill town.',
      canon_flags: ['CANON', 'DISPUTED'],
    });
    const zip = exportMarkdownZip(ctx.db);

    const other = tempContext();
    const gm = createApp(other);
    const preview = await request(gm).post('/api/import/preview').attach('archive', zip, 'export.zip');
    expect(preview.status).toBe(200);
    const commit = await request(gm).post('/api/import/commit').send({ token: preview.body.token });
    expect(commit.status).toBe(200);
    expect(commit.body.restored.records).toBeGreaterThan(0);
    expect(commit.body.restored.templates).toBe(1);

    expect(other.db.prepare(`SELECT name, kind, parent_id, color, icon FROM realms WHERE id = 'vael'`).get()).toEqual({
      name: 'Vael',
      kind: 'continent',
      parent_id: 'world',
      color: 'violet',
      icon: 'mountain',
    });
    const town = (await request(gm).get(`/api/entities/${made.town}`)).body.entity;
    expect(town).toMatchObject({ name: 'Harrowgate', realm: 'vael', revealed: true, revealed_sections: ['A first look'], revealed_facts: ['Population: about 400'], player_summary: 'A mill town.' });
    expect(town.canon_flags).toEqual(['CANON', 'DISPUTED']);
    expect((await request(gm).get('/api/templates')).body.some((t: { name: string; origin: string }) => t.name === 'Port' && t.origin === 'user')).toBe(true);
    // The records that teach come back too, as they were (never revealed).
    expect((await request(gm).get(`/api/entities/${made.tutorial[0]}`)).body.entity.revealed).toBe(false);
  });

  it('a campaign export carries everything the campaign keeps, and says what it needs', async () => {
    const { ctx, made } = ownWorld();
    const cid = made.campaignId!;
    const npc = made.tutorial.find((id) => id.startsWith('NPC'))!;
    const fac = made.tutorial.find((id) => id.startsWith('FAC'))!;
    const db = ctx.db;
    const session = Number(db.prepare(`INSERT INTO sessions (campaign_id, number, title) VALUES (?, 1, 'One')`).run(cid).lastInsertRowid);
    db.prepare(`INSERT INTO faction_standing (campaign_id, faction_id, renown) VALUES (?, ?, 3)`).run(cid, fac);
    db.prepare(`INSERT INTO renown_log (campaign_id, faction_id, delta, reason, session_id) VALUES (?, ?, 3, 'Saved the inn', ?)`).run(cid, fac, session);
    const loot = Number(db.prepare(`INSERT INTO party_treasure (campaign_id, name, kind, quantity, entity_id) VALUES (?, 'Silver lamp', 'item', 1, ?)`).run(cid, npc).lastInsertRowid);
    db.prepare(`INSERT INTO module_data (module, owner, owner_id, data) VALUES ('fading-salvage', 'treasure', ?, '{"fades":true}')`).run(loot);
    fs.mkdirSync(ctx.paths.uploadsDir, { recursive: true });
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'handout-1-x.png'), png);
    db.prepare(`INSERT INTO handouts (campaign_id, title, body, image_file) VALUES (?, 'A letter', 'Meet me.', 'handout-1-x.png')`).run(cid);
    const bastion = Number(db.prepare(`INSERT INTO bastions (campaign_id, name) VALUES (?, 'The Old Mill')`).run(cid).lastInsertRowid);
    db.prepare(`INSERT INTO bastion_turns (bastion_id, number, orders, session_id) VALUES (?, 1, '[]', ?)`).run(bastion, session);
    db.prepare(`INSERT INTO downtime (campaign_id, character, activity, days) VALUES (?, 'Ash', 'Crafting', 5)`).run(cid);
    db.prepare(`INSERT INTO calendar_events (campaign_id, year, day, title) VALUES (?, 1, 10, 'Market day')`).run(cid);
    const rumour = Number(db.prepare(`INSERT INTO rumours (key, text, truth) VALUES ('mill-ghost', 'A ghost turns the third wheel.', 'false')`).run().lastInsertRowid);
    db.prepare(`INSERT INTO rumour_heard (campaign_id, rumour_id) VALUES (?, ?)`).run(cid, rumour);
    const map = Number(db.prepare(`INSERT INTO maps (name, kind, width, height) VALUES ('Ostmark', 'image', 100, 100)`).run().lastInsertRowid);
    db.prepare(`INSERT INTO map_travel (campaign_id, map_id, entity_id, x, y, label) VALUES (?, ?, ?, 5, 5, 'Camp')`).run(cid, map, made.town);

    const data = exportCampaign(db, cid, ctx.paths.uploadsDir);
    expect(data.format).toBe(2);
    expect(data.needs.world).toEqual({ id: 'world', name: 'Ostmark' });
    expect(data.needs.records).toEqual(expect.arrayContaining([made.town, npc, fac]));
    expect(data.needs.maps).toEqual(['Ostmark']);
    for (const k of [
      'faction_standing',
      'renown_log',
      'party_treasure',
      'treasure_module_data',
      'handouts',
      'bastions',
      'bastion_turns',
      'downtime',
      'calendar_events',
      'rumour_heard',
      'map_travel',
    ] as const)
      expect((data as unknown as Record<string, unknown[]>)[k], k).toHaveLength(1);
    expect(Object.keys(data.handout_images)).toHaveLength(1);

    // Into the same library: a whole copy, with nothing missing.
    const gm = createApp(ctx);
    const same = await request(gm)
      .post('/api/import/json')
      .attach('file', Buffer.from(JSON.stringify(data)), 'c.json');
    expect(same.body.missing).toEqual({ world: null, packs: [], records: [], maps: [] });
    const copy = same.body.campaignId;
    const n = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE campaign_id = ?`).get(copy) as { n: number }).n;
    for (const t of ['faction_standing', 'renown_log', 'party_treasure', 'handouts', 'bastions', 'downtime', 'calendar_events', 'rumour_heard', 'map_travel']) expect(n(t), t).toBe(1);
    const h = db.prepare('SELECT image_file FROM handouts WHERE campaign_id = ?').get(copy) as { image_file: string };
    expect(h.image_file).not.toBe('handout-1-x.png');
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, h.image_file))).toBe(true);
    const turn = db.prepare(`SELECT t.session_id FROM bastion_turns t JOIN bastions b ON b.id = t.bastion_id WHERE b.campaign_id = ?`).get(copy) as { session_id: number };
    expect(turn.session_id).not.toBe(session);
    const newLoot = (db.prepare('SELECT id FROM party_treasure WHERE campaign_id = ?').get(copy) as { id: number }).id;
    expect(db.prepare(`SELECT data FROM module_data WHERE owner = 'treasure' AND owner_id = ?`).get(newLoot)).toEqual({ data: '{"fades":true}' });

    // Into another library: added all the same, with a report of what that library lacks.
    const other = tempContext();
    const res = await request(createApp(other))
      .post('/api/import/json')
      .attach('file', Buffer.from(JSON.stringify(data)), 'c.json');
    expect(res.status).toBe(200);
    expect(res.body.missing.records).toEqual(expect.arrayContaining([made.town, npc, fac]));
    expect(res.body.missing.maps).toEqual(['Ostmark']);
    // A rumour this library doesn't have, and travel on a map it doesn't have, are left out.
    expect((other.db.prepare('SELECT COUNT(*) n FROM rumour_heard').get() as { n: number }).n).toBe(0);
    expect((other.db.prepare('SELECT COUNT(*) n FROM map_travel').get() as { n: number }).n).toBe(0);
    expect((other.db.prepare('SELECT COUNT(*) n FROM downtime').get() as { n: number }).n).toBe(1);
  });

  it('a full-world ZIP loads into an empty library, pictures and all', async () => {
    const { ctx } = ownWorld();
    fs.mkdirSync(ctx.paths.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-1-abc.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    ctx.db.prepare(`INSERT INTO maps (name, kind, image_file, width, height) VALUES ('Ostmark', 'image', 'map-1-abc.png', 100, 100)`).run();
    const zip = exportFullWorldZip(ctx.db, ctx.paths);
    const records = (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n;

    const other = tempContext();
    const gm = createApp(other);
    const res = await request(gm).post('/api/import/json').attach('file', zip, 'world.zip');
    expect(res.status).toBe(200);
    expect(res.body.pictures).toBe(1);
    expect((other.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n).toBe(records);
    expect(fs.existsSync(path.join(other.paths.uploadsDir, 'map-1-abc.png'))).toBe(true);
    expect((await request(gm).get('/api/campaigns')).body.map((c: { title: string }) => c.title)).toEqual(['The Iron Crown']);
    // Only into an empty library.
    expect((await request(gm).post('/api/import/json').attach('file', zip, 'world.zip')).status).toBe(400);
  });
});
