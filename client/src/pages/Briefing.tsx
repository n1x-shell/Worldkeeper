/**
 * Session prep from the world: a live briefing on the session's prep tab, built from the campaign's state. A button
 * copies the useful parts into the prep fields that are still empty; it never overwrites anything written there.
 */
export interface Briefing {
  previous: { number: number; title: string; recap: string } | null;
  location: { id: string | null; name: string; type: string } | null;
  chain: { id: string; name: string }[];
  region: { id: string; name: string } | null;
  nearby: { id: string; name: string; type: string }[];
  locals: { id: string; name: string }[];
  met: { id: string; name: string }[];
  clues: { id: number; kind: string; note: string; entity_id: string | null; entity: string | null; secret: string; mystery: string | null; question: string; state: string }[];
  agendas: { id: number; faction_id: string; faction: string | null; title: string; progress: number; segments: number }[];
  standing: { faction_id: string; name: string; renown: number; rank: string; next: { name: string; at: number } | null; close: boolean }[];
  quests: { id: number; title: string; status: string }[];
  level: number;
  tables: { id: number; name: string }[];
  treasure: { region: string; tier: string; label: string } | null;
  terrain?: string[];
  campaign?: { id: number; title: string };
  coming: { kind: string; title: string; inDays: number }[];
}

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');

/** The text each prep field would get from the briefing. */
export function briefingFill(b: Briefing): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (b.previous?.recap) out.recap = b.previous.recap;
  if (b.location) out.partyLocation = [b.location.name, ...b.chain.map((c) => c.name)].join(', ');
  if (b.clues.length) out.clues = bullets(b.clues.map((c) => `${c.mystery ? `${c.mystery}: ` : ''}${c.note || c.secret}${c.entity ? ` (${c.entity})` : ''}`));
  const people = [...b.locals, ...b.met.filter((m) => !b.locals.some((l) => l.id === m.id))];
  if (people.length) out.npcNotes = bullets(people.map((p) => p.name));
  if (b.tables.length) out.encounters = bullets(b.tables.map((t) => t.name));
  if (b.treasure) out.treasure = `Treasure tool: ${b.treasure.label}, levels ${b.treasure.tier}.`;
  const qs = [...new Set(b.clues.map((c) => c.question).filter(Boolean))];
  if (qs.length) out.questions = bullets(qs);
  const cons = [
    ...b.agendas.map((a) => `${a.faction ?? 'A faction'}: "${a.title}" is ${a.segments - a.progress} step${a.segments - a.progress === 1 ? '' : 's'} from done.`),
    ...b.standing.filter((s) => s.close && s.next).map((s) => `${s.name} is ${s.next!.at - s.renown} Renown from ${s.next!.name}.`),
  ];
  if (cons.length) out.consequences = bullets(cons);
  const ids = [b.location?.id, ...b.locals.map((l) => l.id), ...b.met.map((m) => m.id)].filter((x): x is string => !!x);
  if (ids.length) out.relevantIds = [...new Set(ids)].slice(0, 20);
  return out;
}
