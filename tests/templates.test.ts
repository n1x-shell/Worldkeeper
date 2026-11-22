/** Record templates (docs/OWN_WORLD_PLAN.md §2.2): facts and sections with guidance, examples and GM-only marks. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { BUILTIN_TEMPLATES_DIR, listTemplates, syncBuiltinTemplates } from '../server/src/repo/templates.js';
import { parseTemplate, recordFromTemplate, templateToMarkdown } from '../shared/templates.js';
import { BUILTIN_TYPES } from '../shared/recordTypes.js';
import { SECRET_HEADING_RE } from '../shared/domain.js';

const SAMPLE = `Template for: settlement
Name: Settlement

# Settlement

A town, city or village: somewhere people live together.

## Facts

- **Population**: Roughly how many live here. Example: about 400 (Hollow Refuge)
- **Ruled by**: Who decides. Example: the Lantern Council

## Overview

> Guidance: What a traveller sees first.
> Example (Hollow Refuge, SET-001): "Every faction needs a place to talk."

## Secrets (GM only)

> Guidance: What only you know.
`;

describe('record templates', () => {
  it('read and write the template Markdown, and start a record with every fact and section', () => {
    const t = parseTemplate(SAMPLE);
    expect(t).toMatchObject({ type: 'settlement', name: 'Settlement', description: 'A town, city or village: somewhere people live together.' });
    expect(t.facts).toEqual([
      { name: 'Population', guidance: 'Roughly how many live here.', example: 'about 400 (Hollow Refuge)' },
      { name: 'Ruled by', guidance: 'Who decides.', example: 'the Lantern Council' },
    ]);
    expect(t.sections.map((s) => [s.heading, s.gm])).toEqual([
      ['Overview', false],
      ['Secrets', true],
    ]);
    expect(t.sections[0].example).toEqual({ source: 'Hollow Refuge, SET-001', text: 'Every faction needs a place to talk.' });
    expect(parseTemplate(templateToMarkdown(t))).toEqual(t);
    const rec = recordFromTemplate(t, 'Brine Port');
    expect(rec.fields).toEqual([
      ['Population', ''],
      ['Ruled by', ''],
    ]);
    expect(rec.body).toBe('# Brine Port\n\n## Overview\n\n\n## Secrets (GM only)\n');
    // The app keeps GM-only sections from players by their heading.
    expect(SECRET_HEADING_RE.test('Secrets (GM only)')).toBe(true);
  });

  it('come built in, and the GM can duplicate, write, change and delete their own', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-tpl-'));
    fs.writeFileSync(path.join(dir, 'settlement.md'), SAMPLE);
    const ctx = tempContext();
    syncBuiltinTemplates(ctx.db, dir);
    const app = createApp(ctx);
    const builtin = listTemplates(ctx.db).find((t) => t.id === 'builtin:settlement')!;
    expect(builtin).toMatchObject({ origin: 'builtin', type: 'settlement' });
    // Built-ins are fixed: duplicate to change.
    expect((await request(app).put('/api/templates/builtin:settlement').send({ markdown: SAMPLE })).status).toBe(400);
    const copy = (await request(app).post('/api/templates/builtin:settlement/duplicate')).body;
    expect(copy).toMatchObject({ origin: 'user', type: 'settlement', name: 'Settlement (copy)' });
    const changed = SAMPLE.replace('Name: Settlement', 'Name: Port town').replace('## Overview', '## The harbour');
    const saved = (
      await request(app)
        .put(`/api/templates/${encodeURIComponent(copy.id)}`)
        .send({ markdown: changed })
    ).body;
    expect(saved.sections[0].heading).toBe('The harbour');
    // Yours come first, so New uses it.
    expect(listTemplates(ctx.db)[0].id).toBe(copy.id);
    // A template must name a type the library has, and have a section.
    expect(
      (
        await request(app)
          .post('/api/templates')
          .send({ markdown: SAMPLE.replace('settlement', 'spaceship') })
      ).status,
    ).toBe(400);
    expect((await request(app).post('/api/templates').send({ markdown: 'Template for: settlement\nName: Empty\n' })).status).toBe(400);
    expect((await request(app).delete(`/api/templates/${encodeURIComponent(copy.id)}`)).status).toBe(200);
    expect((await request(app).delete('/api/templates/builtin:settlement')).status).toBe(400);
  });

  it('ship one per core type, each with guidance on every section, a GM-only section, and examples from real records', () => {
    const files = fs.existsSync(BUILTIN_TEMPLATES_DIR) ? fs.readdirSync(BUILTIN_TEMPLATES_DIR).filter((f) => f.endsWith('.md')) : [];
    const core = BUILTIN_TYPES.filter((t) => !t.traits.meta && t.key !== 'custom').map((t) => t.key);
    expect(files.map((f) => f.replace(/\.md$/, '')).sort()).toEqual(expect.arrayContaining(core));
    const lore = fs
      .readdirSync(path.resolve(import.meta.dirname, '../assets/lore'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.md'))
      .map((f) => fs.readFileSync(path.resolve(import.meta.dirname, '../assets/lore', f), 'utf8'))
      .join('\n');
    for (const f of files) {
      const t = parseTemplate(fs.readFileSync(path.join(BUILTIN_TEMPLATES_DIR, f), 'utf8'));
      expect(t.type, f).toBe(f.replace(/\.md$/, ''));
      expect(
        BUILTIN_TYPES.some((x) => x.key === t.type),
        f,
      ).toBe(true);
      expect(t.description, f).not.toBe('');
      expect(t.sections.length, f).toBeGreaterThanOrEqual(3);
      for (const s of t.sections) expect(s.guidance, `${f}: ${s.heading}`).not.toBe('');
      expect(
        t.sections.some((s) => s.gm),
        f,
      ).toBe(true);
      // Every example is attributed to a record ID.
      for (const s of t.sections) if (s.example) expect(s.example.source, `${f}: ${s.heading}`).toMatch(/[A-Z]{2,5}-\d{3,4}/);
    }
    expect(lore.length).toBeGreaterThan(0);
  });

  it('name the facts other features read', () => {
    const facts = (key: string) =>
      fs.existsSync(path.join(BUILTIN_TEMPLATES_DIR, `${key}.md`)) ? parseTemplate(fs.readFileSync(path.join(BUILTIN_TEMPLATES_DIR, `${key}.md`), 'utf8')).facts.map((f) => f.name) : [];
    expect(facts('region')).toContain('Ruling faction');
    expect(facts('people')).toEqual(expect.arrayContaining(['Common names', 'Naming style', 'Species rules', 'Found in']));
    expect(facts('faction')).toEqual(expect.arrayContaining(['Allies', 'Opposed by', 'Ranks']));
    expect(facts('npc')).toEqual(expect.arrayContaining(['Pronouns', 'Looks', 'Manner']));
    expect(facts('settlement')).toContain('What people say');
  });
});
