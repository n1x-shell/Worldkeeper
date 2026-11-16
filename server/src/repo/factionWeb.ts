/**
 * The faction web: who is allied with whom, and who opposes whom, among the factions, cults and groups of every realm.
 * The ties come from the library's own links (allied_with, opposes). A tie is public when a faction's handbook page
 * already names the other in its "Who opposes them" line; any other tie players see only once the GM reveals it.
 */
import type { DB } from '../db/connection.js';

export interface Tie {
  a: string;
  b: string;
  aName: string;
  bName: string;
  kind: 'allied' | 'opposed';
  public: boolean;
  revealed: boolean;
}

interface Group {
  id: string;
  name: string;
  type: string;
  realm: string;
  revealed: number;
  player_summary: string;
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function factionGroups(db: DB) {
  return db.prepare(`SELECT id, name, type, realm, revealed, player_summary FROM entities WHERE type IN ('faction', 'cult') AND archived = 0 ORDER BY name`).all() as Group[];
}

/** Ties every player already knows: the handbook's "Who opposes them" lines. */
function publicTies(groups: Group[]) {
  const out = new Set<string>();
  const names = groups.map((g) => ({ id: g.id, words: [g.name, g.name.replace(/^The /, ''), g.name.replace(/\s*\(.*\)$/, '')] }));
  for (const g of groups) {
    const line = /\*\*Who opposes them\.\*\*([^\n]*)/.exec(g.player_summary ?? '')?.[1] ?? '';
    if (!line) continue;
    const text = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    for (const n of names) if (n.id !== g.id && n.words.some((w) => w.length > 3 && text.includes(w))) out.add(key(g.id, n.id));
  }
  return out;
}

export function factionWeb(db: DB, campaignId: number | null): { groups: Group[]; ties: Tie[] } {
  const groups = factionGroups(db);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const rows = db
    .prepare(`SELECT DISTINCT source_id, target_id, type FROM relationships WHERE type IN ('allied_with', 'opposes')`)
    .all()
    .filter((r) => byId.has((r as { source_id: string }).source_id) && byId.has((r as { target_id: string }).target_id)) as { source_id: string; target_id: string; type: string }[];
  const pub = publicTies(groups);
  const revealed = new Set(
    campaignId == null ? [] : (db.prepare(`SELECT a, b FROM faction_ties_revealed WHERE campaign_id = ?`).all(campaignId) as { a: string; b: string }[]).map((r) => key(r.a, r.b)),
  );
  const ties = new Map<string, Tie>();
  for (const r of rows) {
    const k = key(r.source_id, r.target_id);
    if (r.source_id === r.target_id) continue;
    const [a, b] = k.split('|');
    const kind = r.type === 'opposes' ? 'opposed' : 'allied';
    // If the two sides disagree, opposition wins: it's the one that starts fights.
    if (ties.has(k) && ties.get(k)!.kind === 'opposed') continue;
    ties.set(k, { a, b, aName: byId.get(a)!.name, bName: byId.get(b)!.name, kind, public: pub.has(k), revealed: revealed.has(k) });
  }
  return { groups, ties: [...ties.values()].sort((x, y) => x.aName.localeCompare(y.aName) || x.bName.localeCompare(y.bName)) };
}

export function revealTie(db: DB, campaignId: number, a: string, b: string, on: boolean) {
  const [x, y] = key(a, b).split('|');
  if (on) db.prepare(`INSERT OR IGNORE INTO faction_ties_revealed (campaign_id, a, b) VALUES (?, ?, ?)`).run(campaignId, x, y);
  else db.prepare(`DELETE FROM faction_ties_revealed WHERE campaign_id = ? AND a = ? AND b = ?`).run(campaignId, x, y);
  return factionWeb(db, campaignId);
}

/** What players know: public and revealed ties between groups whose pages they can read. With no campaign, public ties only. */
export function playerFactionWeb(db: DB, campaignId: number | null) {
  const { groups, ties } = factionWeb(db, campaignId);
  const visible = new Map(groups.filter((g) => g.revealed).map((g) => [g.id, g]));
  return ties
    .filter((t) => (t.public || t.revealed) && visible.has(t.a) && visible.has(t.b))
    .map((t) => ({ a: t.a, b: t.b, aName: t.aName, bName: t.bName, kind: t.kind, aRealm: visible.get(t.a)!.realm, bRealm: visible.get(t.b)!.realm }));
}
