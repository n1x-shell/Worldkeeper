import type { EntitySummary } from '../../../shared/domain';

/** Rank records for link suggestions: exact ID, name prefix, ID prefix, word prefix, substring. */
export function rankRecords(all: Iterable<EntitySummary>, query: string, limit = 8): EntitySummary[] {
  const q = query.trim().toLowerCase();
  const list = [...all].filter((e) => e.type !== 'redirect' && !e.archived);
  if (!q) return list.filter((e) => e.favorite).concat(list.filter((e) => !e.favorite)).slice(0, limit);
  const score = (e: EntitySummary) => {
    const n = e.name.toLowerCase();
    const bare = n.replace(/^the\s+/, '');
    const id = e.id.toLowerCase();
    if (id === q) return 0;
    if (n.startsWith(q) || bare.startsWith(q)) return 1;
    if (id.startsWith(q)) return 2;
    if (n.split(/[\s,'’-]+/).some((w) => w.startsWith(q))) return 3;
    if (n.includes(q)) return 4;
    return 99;
  };
  return list
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length)
    .slice(0, limit)
    .map((x) => x.e);
}

