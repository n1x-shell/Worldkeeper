/**
 * Record templates (docs/OWN_WORLD_PLAN.md §2.2): for each record type, its facts and sections, each with guidance on
 * what to write, an example from the setting, and whether it is for the GM only. Written in Markdown so the built-in
 * ones (assets/templates), the GM's own (Library → Templates) and people writing by hand all read the same thing:
 *
 *   Template for: settlement
 *   Name: Settlement
 *
 *   # Settlement
 *   What this kind of record is for.
 *
 *   ## Facts
 *   - **Population**: guidance. Example: about 400 (Hollow Refuge)
 *
 *   ## Overview
 *   > Guidance: what goes here, and why it matters at the table.
 *   > Example (Hollow Refuge, SET-001): "A short quotation."
 *
 *   ## Secrets (GM only)
 *   > Guidance: ...
 */

export interface TemplateFact {
  name: string;
  guidance: string;
  example?: string;
}

export interface TemplateSection {
  heading: string;
  guidance: string;
  example?: { source: string; text: string };
  /** For the GM only: never shown to players, whatever is revealed. */
  gm: boolean;
}

export interface TemplateSpec {
  /** The record type it makes. */
  type: string;
  name: string;
  description: string;
  facts: TemplateFact[];
  sections: TemplateSection[];
}

/** A heading marked for the GM only. */
export const GM_ONLY_HEADING = /\((?:gm|dm)[- ]only\)\s*$/i;

/** Read a template. Lenient about spacing; anything it doesn't understand is left out. */
export function parseTemplate(md: string): TemplateSpec {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const meta = (k: string) =>
    lines
      .find((l) => l.toLowerCase().startsWith(`${k.toLowerCase()}:`))
      ?.slice(k.length + 1)
      .trim() ?? '';
  const spec: TemplateSpec = { type: meta('Template for'), name: meta('Name'), description: '', facts: [], sections: [] };
  let section: TemplateSection | null = null;
  let inFacts = false;
  let seenTitle = false;
  const desc: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h1) {
      seenTitle = true;
      if (!spec.name) spec.name = h1[1].trim();
      continue;
    }
    if (h2) {
      const heading = h2[1].trim();
      inFacts = /^facts$/i.test(heading);
      section = inFacts ? null : { heading: heading.replace(GM_ONLY_HEADING, '').trim(), guidance: '', gm: GM_ONLY_HEADING.test(heading) };
      if (section) spec.sections.push(section);
      continue;
    }
    if (inFacts) {
      const f = /^[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(line);
      if (f) {
        const [guidance, example] = f[2].split(/\s*Example:\s*/);
        spec.facts.push({ name: f[1].trim(), guidance: guidance.trim(), ...(example ? { example: example.trim() } : {}) });
      }
      continue;
    }
    if (section) {
      const g = /^>\s*Guidance:\s*(.*)$/i.exec(line);
      const e = /^>\s*Example\s*(?:\(([^)]*)\))?:\s*(.*)$/i.exec(line);
      if (g) section.guidance = [section.guidance, g[1].trim()].filter(Boolean).join(' ');
      else if (e) section.example = { source: (e[1] ?? '').trim(), text: e[2].trim().replace(/^["“]|["”]$/g, '') };
      continue;
    }
    if (seenTitle && line && !/^(template for|name):/i.test(line)) desc.push(line);
  }
  spec.description = desc.join(' ');
  return spec;
}

/** Write a template back out (for duplicating and editing). */
export function templateToMarkdown(t: TemplateSpec): string {
  const out = [`Template for: ${t.type}`, `Name: ${t.name}`, '', `# ${t.name}`, ''];
  if (t.description) out.push(t.description, '');
  if (t.facts.length) {
    out.push('## Facts', '');
    for (const f of t.facts) out.push(`- **${f.name}**: ${f.guidance}${f.example ? ` Example: ${f.example}` : ''}`);
    out.push('');
  }
  for (const s of t.sections) {
    out.push(`## ${s.heading}${s.gm ? ' (GM only)' : ''}`, '');
    if (s.guidance) out.push(`> Guidance: ${s.guidance}`);
    if (s.example) out.push(`> Example${s.example.source ? ` (${s.example.source})` : ''}: "${s.example.text}"`);
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}

/** A new record's starting fields and body from a template: every fact and section, empty, in order. */
export function recordFromTemplate(t: Pick<TemplateSpec, 'facts' | 'sections'>, name: string): { fields: [string, string][]; body: string } {
  const sections = t.sections.length ? t.sections : [{ heading: 'Overview', gm: false }];
  return {
    fields: t.facts.map((f) => [f.name, ''] as [string, string]),
    body: `# ${name}\n\n${sections.map((s) => `## ${s.heading}${s.gm ? ' (GM only)' : ''}\n\n`).join('\n')}`.trimEnd() + '\n',
  };
}
