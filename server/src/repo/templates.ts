/**
 * Record templates (shared/templates.ts): the built-in ones from assets/templates, written at every start; the
 * archive's, as imported; and the GM's own (Library → Templates). A changed template affects only new records.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { parseTemplate, templateToMarkdown, GM_ONLY_HEADING, type TemplateSpec } from '../../../shared/templates.js';
import { SECRET_HEADING_RE } from '../../../shared/domain.js';
import { types } from './recordTypes.js';

export const BUILTIN_TEMPLATES_DIR = process.env.WORLDKEEPER_ADDITIONS_DIR
  ? path.join(process.env.WORLDKEEPER_ADDITIONS_DIR, 'templates')
  : path.resolve(import.meta.dirname, '../../../assets/templates');

export interface TemplateInfo extends TemplateSpec {
  id: string;
  origin: 'builtin' | 'import' | 'user' | 'pack';
  /** The template as Markdown (shared/templates.ts), for editing. */
  markdown: string;
}

interface Row {
  id: string;
  name: string;
  type: string;
  fields: string;
  sections: string;
  body: string;
  origin: string;
  description: string;
  spec: string;
}

const STANDARD = new Set(['id', 'name', 'alternate names', 'category', 'parent', 'continent or realm', 'canon status', 'source', 'tags']);

function toInfo(r: Row): TemplateInfo {
  let spec = parseJson<Partial<TemplateSpec>>(r.spec, {});
  if (!spec.sections) {
    // An archive template: its fields and section headings, without guidance.
    spec = {
      facts: parseJson<string[]>(r.fields, [])
        .filter((f) => !STANDARD.has(f.toLowerCase()))
        .map((name) => ({ name, guidance: '' })),
      sections: parseJson<string[]>(r.sections, [])
        .filter((h) => !/^(review notes|cross-references)$/i.test(h))
        .map((heading) => ({ heading, guidance: '', gm: SECRET_HEADING_RE.test(heading) })),
    };
  }
  const full: TemplateSpec = { type: r.type, name: r.name, description: r.description || spec.description || '', facts: spec.facts ?? [], sections: spec.sections ?? [] };
  return { ...full, id: r.id, origin: r.origin as TemplateInfo['origin'], markdown: r.body || templateToMarkdown(full) };
}

export function listTemplates(db: DB): TemplateInfo[] {
  return (db.prepare(`SELECT * FROM templates ORDER BY CASE origin WHEN 'user' THEN 0 WHEN 'pack' THEN 1 WHEN 'builtin' THEN 2 ELSE 3 END, name`).all() as Row[]).map(toInfo);
}

export function getTemplate(db: DB, id: string): TemplateInfo {
  const r = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Row | undefined;
  if (!r) throw notFound('Template');
  return toInfo(r);
}

const save = (db: DB, id: string, spec: TemplateSpec, markdown: string, origin: string) =>
  db
    .prepare(
      `INSERT INTO templates (id, name, type, fields, sections, body, origin, description, spec, updated_at)
       VALUES (@id, @name, @type, @fields, @sections, @body, @origin, @description, @spec, @now)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, fields = excluded.fields, sections = excluded.sections,
         body = excluded.body, description = excluded.description, spec = excluded.spec, updated_at = excluded.updated_at`,
    )
    .run({
      id,
      name: spec.name,
      type: spec.type,
      fields: JSON.stringify(spec.facts.map((f) => f.name)),
      sections: JSON.stringify(spec.sections.map((s) => s.heading)),
      body: markdown,
      origin,
      description: spec.description,
      spec: JSON.stringify({ facts: spec.facts, sections: spec.sections }),
      now: new Date().toISOString(),
    });

/** Write the built-in templates (assets/templates/*.md) into the library. The GM's own and the archive's are untouched. */
export function syncBuiltinTemplates(db: DB, dir = BUILTIN_TEMPLATES_DIR) {
  if (!fs.existsSync(dir)) return;
  const tx = db.transaction(() => {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const markdown = fs.readFileSync(path.join(dir, f), 'utf8');
      const spec = parseTemplate(markdown);
      if (!spec.type) continue;
      save(db, `builtin:${spec.type}`, spec, markdown, 'builtin');
    }
  });
  tx();
}

/** Write a pack's templates (its templates/ folder) into the library, as that pack's. */
export function syncPackTemplates(db: DB, packId: string, dir: string) {
  if (!fs.existsSync(dir)) return;
  db.transaction(() => {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const markdown = fs.readFileSync(path.join(dir, f), 'utf8');
      const spec = parseTemplate(markdown);
      if (!spec.type) continue;
      const id = `pack:${packId}:${spec.type}`;
      save(db, id, spec, markdown, 'pack');
      db.prepare('UPDATE templates SET pack_id = ? WHERE id = ?').run(packId, id);
    }
  })();
}

/** Check a template the GM wrote: a type the library has, a name, and at least one section. */
function checked(db: DB, markdown: string): TemplateSpec {
  const spec = parseTemplate(markdown);
  if (!spec.type) throw badRequest('Start the template with "Template for:" and a record type');
  if (!types(db).get(spec.type)) throw badRequest(`There is no record type "${spec.type}" in this library`);
  if (!spec.name) throw badRequest('Give the template a name ("Name:" or a "# Title")');
  if (!spec.sections.length) throw badRequest('Add at least one section ("## Heading")');
  return spec;
}

const input = z.object({ markdown: z.string().min(1).max(100_000) });

/** A template of the GM's own, from Markdown. */
export function createTemplate(db: DB, body: unknown): TemplateInfo {
  const { markdown } = input.parse(body);
  const spec = checked(db, markdown);
  const base = `user:${spec.type}`;
  let id = base;
  for (let n = 2; db.prepare('SELECT 1 FROM templates WHERE id = ?').get(id); n++) id = `${base}-${n}`;
  save(db, id, spec, markdown, 'user');
  return getTemplate(db, id);
}

/** A copy of any template, as one of the GM's own, to change freely. */
export function duplicateTemplate(db: DB, id: string): TemplateInfo {
  const t = getTemplate(db, id);
  return createTemplate(db, { markdown: templateToMarkdown({ ...t, name: `${t.name} (copy)` }) });
}

/** Change one of the GM's own templates (built-in and archive templates are fixed: duplicate one to change it). */
export function updateTemplate(db: DB, id: string, body: unknown): TemplateInfo {
  const t = getTemplate(db, id);
  if (t.origin !== 'user') throw badRequest('Duplicate this template to make it your own, then change the copy');
  const { markdown } = input.parse(body);
  save(db, id, checked(db, markdown), markdown, 'user');
  return getTemplate(db, id);
}

export function deleteTemplate(db: DB, id: string) {
  const t = getTemplate(db, id);
  if (t.origin !== 'user') throw badRequest('Only your own templates can be deleted');
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
}

/** Whether a section heading is for the GM only. */
export const isGmHeading = (heading: string) => GM_ONLY_HEADING.test(heading) || SECRET_HEADING_RE.test(heading);
