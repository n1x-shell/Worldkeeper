/**
 * What is kept between saves (v0.9.20): the indexes of every record's name, where each record's search entry is, and
 * the next free ID. They used to be worked out from every record on each save. Kept things can go stale, and a stale
 * index of names links records wrongly without saying so; these tests hold the kept ones to what a fresh build says,
 * through every kind of change, rolled-back ones included.
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { AppContext } from '../server/src/context.js';
import type { DB } from '../server/src/db/connection.js';
import { createEntity, nextCustomId, updateEntity } from '../server/src/repo/entities.js';
import { buildIndexes, loadMentionIndex, loadNameIndex } from '../server/src/repo/mentions.js';
import { NameStore } from '../server/src/repo/nameMatch.js';
import { reindexAll, reindexEntity, search } from '../server/src/repo/search.js';
import { types } from '../server/src/repo/recordTypes.js';

/** The same numbers every run, so a failure can be found again. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Names that try the index: shared names, one inside another, a leading "The", titles, nicknames, apostrophes.
const NAMES = [
  'Harrowgate',
  'Harrowgate Bridge',
  'The Harrowgate Watch',
  'Mirelle',
  'Lady Mirelle Ashdown',
  'Mirelle “the Unseen” Ashdown',
  'Ashdown',
  'Brother Corvin',
  'Corvin',
  'The Iron Crown',
  'Iron Crown',
  "Sal's Rest",
  'Guardian',
  'Thornwood',
  'Thornwood-on-Marsh',
  'Kaelholm (the old city)',
  'Elder Sorrel',
  'Sorrel',
];
const ALIASES = ['The Gate', 'Old Harrow', 'the Unseen', 'Crownhold', 'Sorrel of the Fen', 'Mirelle', 'Watch'];
const TYPES = ['npc', 'settlement', 'landmark', 'faction', 'creature', 'item'];
const TEXTS = [
  'They met at Harrowgate Bridge, under the eyes of the Harrowgate Watch.',
  "Mirelle's letter reached Sal's Rest before Corvin did; Thornwood-on-Marsh never heard of it.",
  'The Iron Crown is not Iron Crownhold. Thornwoods and Harrowgates are other places; Ashdown-born is no one.',
  '"Kaelholm" fell. Elder Sorrel leads; Sorrel follows. A Guardian watches Thornwood.',
  'Lady Mirelle Ashdown, Brother Corvin and the Unseen walked from Harrowgate to Kaelholm.',
];

/** The kept indexes say what freshly built ones say, about every name, every record and every text. */
function expectCurrent(db: DB, when: string) {
  const fresh = buildIndexes(db);
  const mentions = loadMentionIndex(db);
  const names = loadNameIndex(db);
  const ids = (db.prepare('SELECT id FROM entities').all() as { id: string }[]).map((r) => r.id);
  expect([...mentions.byId.keys()].sort(), `${when}: which records there are`).toEqual([...fresh.mentions.byId.keys()].sort());
  for (const label of [...NAMES, ...ALIASES, ...NAMES.map((n) => `${n} (NPC)`), 'Nobody At All']) {
    expect(mentions.resolve(label), `${when}: @[${label}]`).toEqual(fresh.mentions.resolve(label));
    expect(names.find(label), `${when}: the plain name "${label}"`).toBe(fresh.names.find(label));
  }
  for (const id of [...ids, 'GONE-0001']) {
    expect(mentions.mentionFor(id), `${when}: how ${id} is written`).toBe(fresh.mentions.mentionFor(id));
    expect(mentions.canonical(id), `${when}: where ${id} leads`).toBe(fresh.mentions.canonical(id));
    expect(names.typeOf(id), `${when}: the kind of ${id}`).toBe(fresh.names.typeOf(id));
  }
  for (const text of TEXTS) expect(names.scan(text).sort(), `${when}: names in "${text.slice(0, 40)}…"`).toEqual(fresh.names.scan(text).sort());
}

describe('the indexes of names, kept between saves', () => {
  it('are the same objects from one call to the next, not built again', () => {
    const { db } = tempContext();
    createEntity(db, { type: 'npc', realm: 'world', name: 'Mirelle' } as never);
    const first = loadMentionIndex(db);
    createEntity(db, { type: 'settlement', realm: 'world', name: 'Harrowgate' } as never);
    expect(loadMentionIndex(db)).toBe(first);
    expect(first.resolve('Harrowgate')).toEqual({ id: expect.stringMatching(/^SET-/) });
    expect(loadNameIndex(db)).toBe(loadNameIndex(db));
  });

  it('agree with freshly built ones through hundreds of changes of every kind, rolled-back ones too', () => {
    const { db } = tempContext();
    const rand = seeded(20260920);
    const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
    const existing = () => (db.prepare('SELECT id FROM entities ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    const change = () => {
      const ids = existing();
      const id = ids.length ? pick(ids) : null;
      const roll = rand();
      if (!id || roll < 0.3) {
        createEntity(db, { type: pick(TYPES), realm: 'world', name: pick(NAMES), aliases: rand() < 0.3 ? [pick(ALIASES)] : [] } as never);
      } else if (roll < 0.5) updateEntity(db, id, { name: pick(NAMES) });
      else if (roll < 0.62) updateEntity(db, id, { aliases: rand() < 0.5 ? [] : [pick(ALIASES), pick(ALIASES)] });
      else if (roll < 0.72) updateEntity(db, id, { archived: rand() < 0.6 });
      else if (roll < 0.8) updateEntity(db, id, { type: pick(TYPES) });
      // Straight into the database, as an import, a merge or a worldbook does: no function here is told.
      else if (roll < 0.88) db.prepare('DELETE FROM entities WHERE id = ?').run(id);
      else if (roll < 0.94) db.prepare('UPDATE entities SET name = ?, aliases = ? WHERE id = ?').run(pick(NAMES), JSON.stringify([pick(ALIASES)]), id);
      else db.prepare(`UPDATE entities SET redirect_to = ?, type = 'redirect' WHERE id = ?`).run(pick(ids), id);
    };
    class Undo extends Error {}
    for (let step = 0; step < 400; step++) {
      const roll = rand();
      if (roll < 0.7) change();
      else if (roll < 0.85) {
        // Several changes that are all taken back; the indexes are looked at in the middle, as a save does.
        try {
          db.transaction(() => {
            change();
            loadMentionIndex(db);
            change();
            loadNameIndex(db);
            throw new Undo();
          })();
        } catch (e) {
          if (!(e instanceof Undo)) throw e;
        }
      } else {
        // One kept, and inside it one taken back.
        db.transaction(() => {
          change();
          loadNameIndex(db);
          try {
            db.transaction(() => {
              change();
              loadMentionIndex(db);
              throw new Undo();
            })();
          } catch (e) {
            if (!(e instanceof Undo)) throw e;
          }
          change();
        })();
      }
      if (step % 7 === 0 || step > 380) expectCurrent(db, `after step ${step}`);
    }
    expect(existing().length).toBeGreaterThan(20);
  });

  it('are not fooled by a first look inside a transaction that is rolled back', () => {
    const { db } = tempContext();
    createEntity(db, { type: 'npc', realm: 'world', name: 'Corvin' } as never);
    expect(() =>
      db.transaction(() => {
        createEntity(db, { type: 'npc', realm: 'world', name: 'Mirelle' } as never);
        // The very first look: everything is built now, with a record that will never have existed.
        expect(loadMentionIndex(db).resolve('Mirelle')).toBeTruthy();
        expect(loadNameIndex(db).find('Mirelle')).toBeTruthy();
        throw new Error('undo');
      })(),
    ).toThrow('undo');
    expect(loadMentionIndex(db).resolve('Mirelle')).toBeNull();
    expect(loadNameIndex(db).find('Mirelle')).toBeNull();
    // And changes are still noticed afterwards (what notices them was made in that transaction, and went with it).
    createEntity(db, { type: 'npc', realm: 'world', name: 'Sorrel' } as never);
    db.prepare(`UPDATE entities SET name = 'Elder Sorrel' WHERE name = 'Sorrel'`).run();
    expectCurrent(db, 'after the rollback');
    expect(loadNameIndex(db).find('Elder Sorrel')).toBeTruthy();
  });

  it('see a change made through another connection (the separate players’ server, a second window)', () => {
    const ctx = tempContext();
    createEntity(ctx.db, { type: 'npc', realm: 'world', name: 'Corvin' } as never);
    const other = new AppContext(ctx.paths, 'player');
    expect(loadMentionIndex(other.db).resolve('Mirelle')).toBeNull();
    createEntity(ctx.db, { type: 'npc', realm: 'world', name: 'Mirelle' } as never);
    ctx.db.prepare(`UPDATE entities SET name = 'Brother Corvin' WHERE name = 'Corvin'`).run();
    expect(loadMentionIndex(other.db).resolve('Mirelle')).toBeTruthy();
    expect(loadNameIndex(other.db).find('Brother Corvin')).toBeTruthy();
    expectCurrent(other.db, 'on the other connection');
    other.db.close();
  });

  it('find names in running text exactly as the one search pattern of every name used to', () => {
    const { db } = tempContext();
    const reg = types(db);
    const rand = seeded(7);
    const rows = NAMES.flatMap((name, i) => [{ id: `X-${i}`, name, type: TYPES[i % TYPES.length], aliases: '[]', archived: 0 }]);
    // Two records with one name: neither is found (nothing is linked on a guess).
    rows.push({ id: 'X-dup', name: 'Thornwood', type: 'npc', aliases: '[]', archived: 0 });
    const store = new NameStore(reg, rows);
    // The way it was done before, kept here to compare with.
    const generic = new Set(reg.with('commonNoun'));
    const proper = new Map<string, Set<string>>();
    for (const r of rows) {
      if (generic.has(r.type) || reg.get(r.type)?.traits.meta) continue;
      const base = r.name.split(/[“"]/)[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/^The\s+/, '').trim();
      if (base.length < 5) continue;
      proper.set(base, (proper.get(base) ?? new Set()).add(r.id));
    }
    const list = [...proper.entries()].filter(([, ids]) => ids.size === 1).map(([n]) => n).sort((a, b) => b.length - a.length);
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w'’-])(${list.map(esc).join('|')})(?![\\w-]|['’](?!s\\b))`, 'g');
    const before = (text: string) => [...new Set([...text.matchAll(re)].map((m) => [...proper.get(m[1])!][0]))];
    const joins = [' ', ', ', '. ', "'s ", '’s ', '-', "'", '’', 's ', ' (', ') ', '"', '“', ': ', '\n', ' the ', ' The ', '—', 'x'];
    const pick = <T>(l: T[]) => l[Math.floor(rand() * l.length)];
    for (let n = 0; n < 3000; n++) {
      let text = '';
      for (let w = 0; w < 6; w++) text += pick([...NAMES, 'and', 'beyond', 'Harrow', 'Thorn', 'Iron']) + pick(joins);
      expect(store.scan(text).sort(), JSON.stringify(text)).toEqual(before(text).sort());
    }
    for (const text of TEXTS) expect(store.scan(text).sort()).toEqual(before(text).sort());
  });
});

describe('where each record’s search entry is', () => {
  const entryCount = (db: DB, id: string) => (db.prepare(`SELECT COUNT(*) n FROM search_index WHERE kind = 'entity' AND ref = ?`).get(id) as { n: number }).n;
  const finds = (db: DB, q: string) => search(db, q).map((h) => h.ref);

  it('keeps one entry for each record through edits, and takes it away with the record', () => {
    const { db } = tempContext();
    const a = createEntity(db, { type: 'npc', realm: 'world', name: 'Mirelle', body: 'Keeps a heron.' } as never);
    const b = createEntity(db, { type: 'npc', realm: 'world', name: 'Corvin', body: 'Keeps bees.' } as never);
    expect(finds(db, 'heron')).toEqual([a.id]);
    for (let i = 0; i < 5; i++) updateEntity(db, a.id, { body: `Keeps a falcon, as of edit ${i}.` });
    expect(entryCount(db, a.id)).toBe(1);
    expect(finds(db, 'heron')).toEqual([]);
    expect(finds(db, 'falcon')).toEqual([a.id]);
    expect(finds(db, 'bees')).toEqual([b.id]);
    // Turned into a signpost to another record: it has no entry of its own any more.
    db.prepare(`UPDATE entities SET type = 'redirect', redirect_to = ? WHERE id = ?`).run(b.id, a.id);
    reindexEntity(db, a.id);
    expect(entryCount(db, a.id)).toBe(0);
    expect(finds(db, 'falcon')).toEqual([]);
  });

  it('is right again after a rolled-back edit, after a rebuild, and for an index an older version left untidy', () => {
    const ctx = tempContext();
    const { db } = ctx;
    const a = createEntity(db, { type: 'npc', realm: 'world', name: 'Mirelle', body: 'Keeps a heron.' } as never);
    expect(() =>
      db.transaction(() => {
        updateEntity(db, a.id, { body: 'Keeps a falcon.' });
        createEntity(db, { type: 'npc', realm: 'world', name: 'Never Was', body: 'A phantom.' } as never);
        throw new Error('undo');
      })(),
    ).toThrow('undo');
    expect(finds(db, 'heron')).toEqual([a.id]);
    expect(finds(db, 'falcon')).toEqual([]);
    expect(finds(db, 'phantom')).toEqual([]);
    updateEntity(db, a.id, { body: 'Keeps an owl.' });
    expect(entryCount(db, a.id)).toBe(1);
    expect(finds(db, 'owl')).toEqual([a.id]);
    expect(finds(db, 'heron')).toEqual([]);

    reindexAll(db);
    expect(entryCount(db, a.id)).toBe(1);
    updateEntity(db, a.id, { body: 'Keeps a wren.' });
    expect(entryCount(db, a.id)).toBe(1);
    expect(finds(db, 'wren')).toEqual([a.id]);

    // Two entries for one record, written by another connection: the next save leaves one, the newest.
    const second = new AppContext(ctx.paths, 'dm');
    second.db.prepare(`INSERT INTO search_index (ref, kind, title, aliases, tags, body) VALUES (?, 'entity', 'Mirelle', '', '', 'An old stray entry about a stoat.')`).run(a.id);
    second.db.close();
    expect(entryCount(db, a.id)).toBe(2);
    updateEntity(db, a.id, { body: 'Keeps a lark.' });
    expect(entryCount(db, a.id)).toBe(1);
    expect(finds(db, 'lark')).toEqual([a.id]);
    expect(finds(db, 'stoat')).toEqual([]);
  });
});

describe('the next free ID', () => {
  it('is one more than the highest, whatever else has a similar ID', () => {
    const { db } = tempContext();
    expect(nextCustomId(db, 'NPC')).toBe('NPC-0001');
    const put = db.prepare(`INSERT INTO entities (id, name, type, realm, canon_status, origin, created_at, updated_at) VALUES (?, ?, 'npc', 'world', 'CANON', 'import', '', '')`);
    // An archive's three-digit IDs, a suffixed one, and another type's: none of them count.
    for (const id of ['NPC-001', 'NPC-999', 'NPC-0412-B', 'NPCX-9000', 'NP-7000']) put.run(id, id);
    expect(nextCustomId(db, 'NPC')).toBe('NPC-0001');
    for (const id of ['NPC-0007', 'NPC-0412', 'NPC-0099']) put.run(id, id);
    expect(nextCustomId(db, 'NPC')).toBe('NPC-0413');
    expect(createEntity(db, { type: 'npc', realm: 'world', name: 'Next' } as never).id).toBe('NPC-0413');
    expect(nextCustomId(db, 'SET')).toBe('SET-0001');
  });

  it('goes on past 9999 (it used to offer the same ID for ever)', () => {
    const { db } = tempContext();
    const put = db.prepare(`INSERT INTO entities (id, name, type, realm, canon_status, origin, created_at, updated_at) VALUES (?, ?, 'npc', 'world', 'CANON', 'user', '', '')`);
    for (const id of ['NPC-9998', 'NPC-9999']) put.run(id, id);
    expect(nextCustomId(db, 'NPC')).toBe('NPC-10000');
    const a = createEntity(db, { type: 'npc', realm: 'world', name: 'Ten thousand' } as never);
    const b = createEntity(db, { type: 'npc', realm: 'world', name: 'And one' } as never);
    expect([a.id, b.id]).toEqual(['NPC-10000', 'NPC-10001']);
    put.run('NPC-99999', 'far');
    expect(nextCustomId(db, 'NPC')).toBe('NPC-100000');
  });
});
