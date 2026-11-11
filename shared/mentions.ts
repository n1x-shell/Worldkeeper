/**
 * Record links in text.
 *
 *  - Natural-language mentions:  @[Mara Venn]            → linked by name (or alias)
 *                                @[Kaelholm (Settlement)] → disambiguated by type when two records share a name
 *                                @[Kaelholm|SET-302]      → explicit stable ID (written by tools, still readable)
 *  - The source library's format: Mara Venn [NPC-010]    → the name before the ID becomes the link text
 *
 * Pure functions shared by the server (relationships, broken links, player text) and the client (rendering).
 */
import { BRACKET_REF_RE, ENTITY_TYPE_LABELS, type EntityType } from './domain.js';

export interface MentionTarget {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  redirect_to?: string | null;
}

export const MENTION_RE = () => /@\[([^\]\n|]{1,200})(?:\|([^\]\n]{1,60}))?\]/g;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const bare = (s: string) => norm(s).replace(/^the /, '');
const typeLabel = (t: string) => ENTITY_TYPE_LABELS[t as EntityType] ?? t;

export type Resolution = { id: string } | { ambiguous: string[] } | null;

export class MentionIndex {
  readonly byId = new Map<string, MentionTarget>();
  private byName = new Map<string, MentionTarget[]>();
  private byAlias = new Map<string, MentionTarget[]>();

  constructor(targets: Iterable<MentionTarget>) {
    for (const t of targets) {
      this.byId.set(t.id, t);
      if (t.type === 'redirect') continue;
      for (const key of new Set([norm(t.name), bare(t.name)])) this.push(this.byName, key, t);
      for (const a of t.aliases ?? []) {
        const clean = a.replace(new RegExp(BRACKET_REF_RE().source, 'g'), '').trim();
        if (clean) for (const key of new Set([norm(clean), bare(clean)])) this.push(this.byAlias, key, t);
      }
    }
  }

  private push(m: Map<string, MentionTarget[]>, k: string, t: MentionTarget) {
    const list = m.get(k) ?? [];
    if (!list.includes(t)) list.push(t);
    m.set(k, list);
  }

  /** Follow legacy redirect IDs to their authoritative record. */
  canonical(id: string): string | null {
    const t = this.byId.get(id);
    if (!t) return null;
    return t.redirect_to && this.byId.has(t.redirect_to) ? t.redirect_to : t.id;
  }

  resolve(label: string, explicitId?: string): Resolution {
    if (explicitId) {
      const id = this.canonical(explicitId.trim());
      return id ? { id } : null;
    }
    const pick = (list: MentionTarget[] | undefined): Resolution => {
      if (!list?.length) return null;
      const uniq = [...new Set(list.map((t) => t.id))];
      return uniq.length === 1 ? { id: uniq[0] } : { ambiguous: uniq };
    };
    const exact = pick(this.byName.get(norm(label)) ?? this.byName.get(bare(label)));
    if (exact && 'id' in exact) return exact;
    // "Name (Type)" qualifier for records that share a name.
    const q = /^(.*\S)\s*\(([^)]+)\)\s*$/.exec(label);
    if (q) {
      const cands = (this.byName.get(norm(q[1])) ?? this.byName.get(bare(q[1])) ?? []).filter((t) => norm(typeLabel(t.type)) === norm(q[2]) || norm(t.type) === norm(q[2]));
      const r = pick(cands);
      if (r) return r;
    }
    if (exact) return exact;
    return pick(this.byAlias.get(norm(label)) ?? this.byAlias.get(bare(label)));
  }

  /** The text to insert for a record: its name, plus its type when another record has the same name. */
  mentionFor(id: string): string {
    const t = this.byId.get(id);
    if (!t) return `@[${id}]`;
    const r = this.resolve(t.name);
    if (r && 'id' in r && r.id === t.id) return `@[${t.name}]`;
    const qualified = `${t.name} (${typeLabel(t.type)})`;
    const rq = this.resolve(qualified);
    if (rq && 'id' in rq && rq.id === t.id) return `@[${qualified}]`;
    return `@[${t.name}|${t.id}]`;
  }
}

export type RefSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; id: string; label: string; source: 'mention' | 'legacy' }
  /** A legacy `[ID]` whose preceding words are not the record's name (rendered as a small link). */
  | { kind: 'anchor'; id: string }
  | { kind: 'broken'; label: string; reason: 'missing' | 'ambiguous' };

/** Split text into plain text and record references. Code spans are left untouched. */
export function parseRefs(text: string, index: MentionIndex): RefSegment[] {
  const out: RefSegment[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.kind === 'text') last.text += t;
    else out.push({ kind: 'text', text: t });
  };
  const re = new RegExp(`${MENTION_RE().source}|${BRACKET_REF_RE().source}(?!\\()|\`[^\`\\n]*\``, 'g');
  let pos = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index!;
    if (m[0].startsWith('`')) continue; // inline code: leave as is
    if (m[0].startsWith('@[')) {
      pushText(text.slice(pos, at));
      const r = index.resolve(m[1], m[2]);
      if (r && 'id' in r) out.push({ kind: 'link', id: r.id, label: m[1].trim(), source: 'mention' });
      else out.push({ kind: 'broken', label: m[1].trim(), reason: r ? 'ambiguous' : 'missing' });
      pos = at + m[0].length;
      continue;
    }
    // Legacy "Name [ID]"
    const rawId = m[3];
    const id = index.canonical(rawId);
    const before = text.slice(pos, at);
    if (!id) {
      pushText(before);
      out.push({ kind: 'broken', label: rawId, reason: 'missing' });
      pos = at + m[0].length;
      continue;
    }
    const t = index.byId.get(id)!;
    const trimmed = before.replace(/\s+$/, '');
    const names = [t.name, t.name.replace(/^the\s+/i, ''), ...(t.aliases ?? []).map((a) => a.replace(new RegExp(BRACKET_REF_RE().source, 'g'), '').trim())]
      .filter((n) => n.length > 1)
      .sort((a, b) => b.length - a.length);
    let matched: string | null = null;
    for (const n of names) {
      const tail = trimmed.slice(-n.length);
      const boundary = trimmed.length === n.length || /[^\p{L}\p{N}]/u.test(trimmed.charAt(trimmed.length - n.length - 1));
      if (tail.toLowerCase() === n.toLowerCase() && boundary) {
        matched = tail;
        break;
      }
    }
    if (matched) {
      pushText(trimmed.slice(0, trimmed.length - matched.length));
      out.push({ kind: 'link', id, label: matched, source: 'legacy' });
    } else {
      pushText(trimmed);
      out.push({ kind: 'anchor', id });
    }
    pos = at + m[0].length;
  }
  pushText(text.slice(pos));
  return out;
}

/** Every record ID referenced by the text (mentions and legacy IDs), plus unresolved mentions. */
export function collectRefs(text: string, index: MentionIndex): { ids: string[]; broken: string[] } {
  const ids: string[] = [];
  const broken: string[] = [];
  for (const s of parseRefs(text, index)) {
    if ((s.kind === 'link' || s.kind === 'anchor') && !ids.includes(s.id)) ids.push(s.id);
    else if (s.kind === 'broken') broken.push(s.reason === 'ambiguous' ? `@[${s.label}] (ambiguous)` : s.label.match(/^[A-Z]+-/) ? s.label : `@[${s.label}]`);
  }
  return { ids, broken };
}
