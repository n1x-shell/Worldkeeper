/**
 * Making a record (docs/OWN_WORLD_PLAN.md §2.4): the New menu's groups, the "Add … here" suggestions on a place's page,
 * and the two ways to write one. Guided fills a template's facts and sections step by step; Advanced writes the
 * template's Markdown, header and all, in the library's own record format (the archive's: `Name:`, `Category:`,
 * `Parent:`, `Continent or Realm:`, `Canon Status:`, then the type's facts). Both make the same record: a section
 * left out stays as its heading with the template's guidance in a comment, so the record shows what's still to write.
 */
import type { TemplateSpec } from './templates.js';

/** The New menu's groups, as the Codex sidebar has them, by type category. */
export const NEW_GROUPS: { key: string; title: string; categories: string[] }[] = [
  { key: 'places', title: 'Places', categories: ['place'] },
  { key: 'people', title: 'People', categories: ['person', 'group', 'folk'] },
  { key: 'myth', title: 'Myth and history', categories: ['myth'] },
  { key: 'things', title: 'Things', categories: ['thing', 'creature'] },
  { key: 'rules', title: 'Rules and adventures', categories: ['rule', 'adventure'] },
];

interface MenuType {
  key: string;
  category: string;
}

/** The New menu: the recently used types first (up to `max`), then every type in its group. */
export function newMenu<T extends MenuType>(types: T[], recent: string[], max = 4): { recent: T[]; groups: { key: string; title: string; types: T[] }[] } {
  const byKey = new Map(types.map((t) => [t.key, t]));
  const grouped = new Set(NEW_GROUPS.flatMap((g) => g.categories));
  const groups = [
    ...NEW_GROUPS.map((g) => ({ key: g.key, title: g.title, types: types.filter((t) => g.categories.includes(t.category)) })),
    { key: 'other', title: 'Other', types: types.filter((t) => !grouped.has(t.category)) },
  ].filter((g) => g.types.length);
  return {
    recent: [...new Set(recent)]
      .map((k) => byKey.get(k))
      .filter((t): t is T => !!t)
      .slice(0, max),
    groups,
  };
}

/** Remember a type as just used: most recent first, a short list. */
export const noteRecentType = (recent: string[], key: string, max = 6) => [key, ...recent.filter((k) => k !== key)].slice(0, max);

/**
 * What a place's page offers to add inside it: a settlement in a region, an NPC who lives in a settlement. Each names
 * the child type and how the button reads; only types the library offers are kept.
 */
const ADD_HERE: Record<string, { type: string; label: string }[]> = {
  world: [{ type: 'continent', label: 'Add a continent here' }],
  continent: [
    { type: 'nation', label: 'Add a nation here' },
    { type: 'region', label: 'Add a region here' },
  ],
  nation: [
    { type: 'region', label: 'Add a region here' },
    { type: 'settlement', label: 'Add a settlement here' },
  ],
  region: [
    { type: 'settlement', label: 'Add a settlement here' },
    { type: 'landmark', label: 'Add a landmark here' },
  ],
  settlement: [
    { type: 'npc', label: 'Add an NPC who lives here' },
    { type: 'building', label: 'Add a building here' },
  ],
  building: [{ type: 'npc', label: 'Add an NPC who is found here' }],
  landmark: [{ type: 'npc', label: 'Add an NPC who is found here' }],
  dungeon: [{ type: 'creature', label: 'Add a creature found here' }],
  faction: [{ type: 'npc', label: 'Add a member' }],
  cult: [{ type: 'npc', label: 'Add a member' }],
};

export function addHere(parentType: string, offered: (type: string) => boolean): { type: string; label: string }[] {
  return (ADD_HERE[parentType] ?? []).filter((a) => offered(a.type));
}

/** Facts a contextual "Add … here" fills from the parent: where an NPC lives, which region a settlement is in. */
export function factsFromParent(template: Pick<TemplateSpec, 'facts'>, parentName: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.facts) if (/^(home|region|location|where|found in|lives in)$/i.test(f.name)) out[f.name] = parentName;
  return out;
}

// ---------------------------------------------------------------- comments

/** A note to the GM in a record: shown on its page as what's still to write, never to players. */
export const toWrite = (guidance: string) => `<!-- To write: ${(guidance || 'still to write').replace(/-->/g, '—>').replace(/\s+/g, ' ').trim()} -->`;

const COMMENT = /<!--[\s\S]*?-->[ \t]*\n?/g;
/** Text without its comments (for players, and for counting what's written). */
export const stripComments = (text: string) => (text.includes('<!--') ? text.replace(COMMENT, '') : text);

/** A record's notes still to write, in order. */
export const toWriteNotes = (text: string) => [...text.matchAll(/<!--\s*To write:\s*([\s\S]*?)\s*-->/g)].map((m) => m[1]);

// ---------------------------------------------------------------- guided

export interface SectionDraft {
  heading: string;
  gm: boolean;
  guidance: string;
  /** What the GM wrote; empty or null when skipped for now. */
  text: string | null;
}

export const sectionDrafts = (t: Pick<TemplateSpec, 'sections'>): SectionDraft[] =>
  (t.sections.length ? t.sections : [{ heading: 'Overview', gm: false, guidance: '' }]).map((s) => ({ heading: s.heading, gm: s.gm, guidance: s.guidance, text: null }));

/** The record a guided draft makes: the template's facts in order with the values given, and every section. */
export function buildRecord(name: string, template: Pick<TemplateSpec, 'facts'>, facts: Record<string, string>, sections: SectionDraft[]): { fields: [string, string][]; body: string } {
  const known = new Set(template.facts.map((f) => f.name));
  const fields: [string, string][] = [
    ...template.facts.map((f) => [f.name, (facts[f.name] ?? '').trim()] as [string, string]),
    ...Object.entries(facts)
      .filter(([k, v]) => !known.has(k) && v.trim())
      .map(([k, v]) => [k, v.trim()] as [string, string]),
  ];
  const parts = sections.map((s) => {
    const head = `## ${s.heading}${s.gm ? ' (GM only)' : ''}`;
    const text = (s.text ?? '').trim();
    return `${head}\n\n${text || toWrite(s.guidance)}`;
  });
  return { fields, body: `# ${name.trim()}\n\n${parts.join('\n\n')}\n` };
}

// ---------------------------------------------------------------- advanced

export interface DraftHeader {
  name: string;
  /** The type's label, as the archive's Category says it. */
  category: string;
  realm: string;
  parent?: string;
  canon: string;
}

/** The template as Markdown to write in, with the header filled in. */
export function draftMarkdown(h: DraftHeader, template: Pick<TemplateSpec, 'facts' | 'sections'>, facts: Record<string, string> = {}, sections?: SectionDraft[]): string {
  const head = [
    `Name: ${h.name}`,
    `Category: ${h.category}`,
    `Parent: ${h.parent ?? ''}`,
    `Continent or Realm: ${h.realm}`,
    `Canon Status: ${h.canon}`,
    ...template.facts.map((f) => `${f.name}: ${facts[f.name] ?? ''}`),
  ];
  const { body } = buildRecord(h.name || 'New record', template, {}, sections ?? sectionDrafts(template));
  // Each header line ends in a Markdown line break (two spaces), so the preview shows one fact to a line.
  return `${head.map((l) => `${l}  `).join('\n')}\n\n${body}`;
}

const HEADER_LINE = /^([A-Z][A-Za-z0-9 ,/()'’-]{0,60}?):[ \t]?(.*)$/;
const STANDARD: Record<string, keyof DraftHeader | 'aliases'> = {
  name: 'name',
  category: 'category',
  type: 'category',
  parent: 'parent',
  'continent or realm': 'realm',
  realm: 'realm',
  'canon status': 'canon',
  canon: 'canon',
  'alternate names': 'aliases',
};

/** Read an Advanced draft back: its header, the type's facts, any other header lines, and the body. */
export function parseDraft(md: string): { header: Partial<DraftHeader>; aliases: string[]; fields: [string, string][]; body: string } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const header: Partial<DraftHeader> = {};
  const fields: [string, string][] = [];
  let aliases: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) break;
    const m = HEADER_LINE.exec(line);
    if (!m) break;
    const key = m[1].trim();
    const value = m[2].trim();
    const std = STANDARD[key.toLowerCase()];
    if (std === 'aliases')
      aliases = value
        .split(/[;,]/)
        .map((a) => a.trim())
        .filter(Boolean);
    else if (std) header[std] = value;
    else fields.push([key, value]);
  }
  const body = lines.slice(i).join('\n').trim();
  if (!header.name) header.name = /^#\s+(.+)$/m.exec(body)?.[1].trim();
  return { header, aliases, fields, body: body ? `${body}\n` : '' };
}
