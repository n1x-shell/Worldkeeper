/**
 * Open questions: every fact the library marks UNDEFINED, and where each one stands. Some are kept open on purpose
 * (the world's mysteries), some have been filled by Worldkeeper's additions (with links to what fills them), and the
 * rest are still to do. A report only: nothing is changed.
 *
 * How each stands comes from assets/lore/open-questions.json (curated rules), then from a few automatic checks
 * (a person's handbook page and fight card, a place's map pin, a god's faith page). Anything else is still to do.
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { splitSections } from '../import/parseMarkdown.js';
import { statblockFor } from './statblocks.js';

export type QuestionStatus = 'kept' | 'filled' | 'todo';
export interface OpenQuestion {
  id: string;
  name: string;
  type: string;
  section: string;
  text: string;
  status: QuestionStatus;
  /** Records that fill it. On a question still to do, these fill part of it. */
  by: string[];
  note?: string;
}
interface Rule {
  ids: string[];
  section?: string;
  status: QuestionStatus | 'skip';
  by?: string[];
  note?: string;
}

const RULES_FILE = process.env.WORLDKEEPER_ADDITIONS_DIR
  ? path.join(process.env.WORLDKEEPER_ADDITIONS_DIR, 'lore', 'open-questions.json')
  : path.resolve(import.meta.dirname, '../../../assets/lore/open-questions.json');

export function readRules(file = RULES_FILE): Rule[] {
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { rules: Rule[] }).rules;
}

/** The text of a section that holds an UNDEFINED: the whole section if its heading is marked, else the marked lines. */
function questionText(heading: string, content: string): string {
  const lines = /UNDEFINED/.test(heading) ? content.split('\n') : content.split('\n').filter((l) => l.includes('UNDEFINED'));
  return lines
    .map((l) =>
      l
        .replace(/\s*\[UNDEFINED[^\]]*\]/g, '')
        .replace(/\s*\[[A-Z]{3,4}-\d{3}[^\]]*\]/g, '')
        .replace(/^\s*[-*]\s*/, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
}

interface Row {
  id: string;
  name: string;
  type: string;
  body: string;
  player_summary: string | null;
}

export function openQuestions(db: Database.Database, rules = readRules()) {
  const rows = db
    .prepare(`SELECT id, name, type, body, player_summary FROM entities WHERE archived = 0 AND type NOT IN ('register', 'redirect') AND body LIKE '%UNDEFINED%' ORDER BY id`)
    .all() as Row[];
  const pinned = db.prepare(
    `SELECT m.name FROM maps m WHERE m.id IN (SELECT map_id FROM map_markers WHERE entity_id = ? UNION SELECT map_id FROM map_shapes WHERE entity_id = ?) LIMIT 1`,
  );
  const questions: OpenQuestion[] = [];
  for (const r of rows) {
    for (const s of splitSections(r.body)) {
      if (!/UNDEFINED/.test(s.heading + s.content)) continue;
      const section = s.heading.replace(/\s*\[UNDEFINED\]/, '').trim();
      const q: OpenQuestion = { id: r.id, name: r.name, type: r.type, section, text: questionText(s.heading, s.content), status: 'todo', by: [] };
      const rule = rules.find((x) => x.ids.includes(r.id) && (!x.section || new RegExp(x.section, 'i').test(section)));
      if (rule?.status === 'skip') continue;
      if (rule) {
        q.status = rule.status as QuestionStatus;
        q.by = rule.by ?? [];
        q.note = rule.note;
      } else autoStatus(q, r, pinned);
      questions.push(q);
    }
  }
  const counts = { kept: 0, filled: 0, todo: 0 };
  for (const q of questions) counts[q.status]++;
  return { questions, counts };
}

/** The automatic checks, for questions no rule covers. */
function autoStatus(q: OpenQuestion, r: Row, pinned: Database.Statement) {
  const summary = r.player_summary ?? '';
  if (/Attitude toward the party/i.test(q.section)) {
    q.status = 'kept';
    q.note = 'Decided in play.';
    return;
  }
  if (r.type === 'npc' && /Pressure and secrets/i.test(q.section)) {
    q.status = 'kept';
    q.note = 'No secrets beyond their aims. Add one if the story needs it.';
    return;
  }
  if (r.type === 'npc' && /Unspecified fields|Appearance and voice|Not established/i.test(q.section)) {
    const looks = /\*\*Looks\.\*\*/.test(summary) && /\| Pronouns \|/.test(summary);
    const card = !!statblockFor(r.id);
    const has = [looks && 'its handbook page gives pronouns and looks', card && 'its fight card is on its page'].filter(Boolean);
    const lacks = [!looks && 'pronouns and looks', !card && 'a fight card'].filter(Boolean);
    if (has.length) q.by = [r.id];
    q.status = looks && card ? 'filled' : 'todo';
    q.note = [has.length ? `Done: ${has.join('; ')}.` : '', lacks.length ? `Still to do: ${lacks.join(' and ')}.` : ''].filter(Boolean).join(' ');
    return;
  }
  if (/Position and map use|Map and boundaries/i.test(q.section)) {
    const map = pinned.get(r.id, r.id) as { name: string } | undefined;
    if (map) {
      q.status = 'filled';
      q.by = [r.id];
      q.note = `Placed on ${map.name}. Exact borders stay approximate.`;
    }
    return;
  }
  if (r.type === 'deity' && /Unknowns/i.test(q.section) && /worship/i.test(summary)) {
    q.status = 'filled';
    q.by = [r.id];
    q.note = 'Where and how the god is worshipped is on its handbook page.';
  }
}
