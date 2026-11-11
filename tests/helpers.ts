/**
 * Test helpers. The fixture library below is SYNTHETIC TEST DATA that only mimics the archive's
 * file conventions; it is not world lore and is never shipped to users.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import type { SourceFile } from '../server/src/import/scan.js';

export function tempContext(): AppContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-test-'));
  return new AppContext(resolvePaths(dir));
}

const header = (id: string, name: string, extra: Record<string, string> = {}, o: Partial<Record<string, string>> = {}) =>
  [
    `ID: ${id}`,
    `Name: ${name}`,
    `Alternate names: ${o.aliases ?? 'None'}`,
    `Category: ${o.category ?? 'Landmark'}`,
    `Parent: ${o.parent ?? 'Testland [CON-001]'}`,
    `Continent or realm: ${o.realm ?? 'Aetheris'}`,
    `Canon status: ${o.canon ?? 'CANON'}`,
    `Source: ${o.source ?? 'Test_Bible.md: Section'}`,
    `Tags: ${o.tags ?? 'realm/aetheris, status/canon, vis/gm'}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
  ].join('\n');

export function fixtureFiles(): SourceFile[] {
  return [
    { path: 'Lib/References/Aetheris_Setting_Bible.md', content: '# Test bible\n\nImmutable source text v1.' },
    { path: 'Lib/Manifest.md', content: '# Manifest\n\nTest manifest.' },
    {
      path: 'Lib/01_Aetheris/Aetheris_Overview.md',
      content: `${header('CON-001', 'Testland', {}, { category: 'Continent', parent: 'The World [WLD-901]' })}\n\n# Testland\n\n## Overview\nA test continent.\n`,
    },
    {
      path: 'Lib/00_World/01_World_Overview.md',
      content: `${header('WLD-901', 'The World', {}, { category: 'World', parent: 'None', realm: 'World' })}\n\n# The World\n\n## Overview\nRoot.\n`,
    },
    {
      path: 'Lib/01_Aetheris/SET-001_Town.md',
      content: `${header('SET-001', 'Test Town', { Population: '100' }, { category: 'Settlement', canon: 'CANON, SECRET' })}\n\n# Test Town\n\n## Overview\nA town near Old Tower [LOC-002]. Ruled by Test Keeper [NPC-001].\n\n## GM-only truths\nThe mayor is secretly the Hidden Test Villain.\n\n## Missing facts\nStreet map is UNDEFINED.\n`,
    },
    {
      path: 'Lib/01_Aetheris/LOC-002_Old_Tower.md',
      content: `${header('LOC-002', 'Old Tower')}\n\n# Old Tower\n\n## Overview\nA ruined tower.\n`,
    },
    {
      path: 'Lib/01_Aetheris/LOC-099_Legacy.md',
      content: `${header('LOC-099', 'Old Tower (legacy locator)', {}, { aliases: 'Old Tower [LOC-002]', category: 'Legacy cross-reference (NOT a second Lore site)' })}\n\n# Legacy\n\nUse [LOC-002].\n`,
    },
    {
      path: 'Lib/05_People/NPC-001_Keeper.md',
      content: `${header('NPC-001', 'Test Keeper', {}, { category: 'NPC', parent: 'People' })}\n\n# Test Keeper\n\n## Wants\nOrder.\n\n## Secrets (GM only)\nKeeps a forbidden ledger.\n`,
    },
    {
      path: 'Lib/05_People/FAC-001_Guild.md',
      content: `${header('FAC-001', 'Test Guild', { Leaders: 'Test Keeper [NPC-001]' }, { category: 'Faction', parent: 'People' })}\n\n# Test Guild\n\n## Aim\nTrade. Seeks the legacy tower [LOC-099] and an unknown [NPC-777].\n`,
    },
    {
      path: 'Lib/00_World/03_World_Cosmology.md',
      content: `${header('WLD-903', 'World Cosmology', {}, { category: 'Index', parent: 'The World [WLD-901]', realm: 'World' })}\n\n# World Cosmology\n\nCompendium.\n\n---\n\n${header('COS-901', 'The First Thing', {}, { category: 'Cosmology', parent: 'World Cosmology [WLD-903]' })}\n\n## Text\nCompendium copy.\n\n---\n\n${header('COS-950', 'Only Embedded', {}, { category: 'Cosmology', parent: 'World Cosmology [WLD-903]' })}\n\n## Text\nOnly lives in the compendium.\n`,
    },
    {
      path: 'Lib/00_World/Cosmology_Entries/COS-901_The_First_Thing.md',
      content: `${header('COS-901', 'The First Thing', {}, { category: 'Cosmology', parent: 'World Cosmology [WLD-903]' })}\n\n## Text\nCompendium copy.\n`,
    },
    {
      path: 'Lib/08_Amsel_Lore_Foundation/Worked_Examples/SET-001_Town.md',
      content: `${header('SET-001', 'Test Town', {}, { category: 'Settlement' })}\n\n# Example copy\n`,
    },
    {
      path: 'Lib/08_Amsel_Lore_Foundation/Templates/TEMPLATE_NPC.md',
      content: `# TEMPLATE: NPC\n\nDesign aid.\n\n${header('[UNDEFINED: check source]', '[UNDEFINED: check source]', { Wants: '[UNDEFINED: check source]' })}\n\n## Public role\n\n[prompt]\n`,
    },
    {
      path: 'Lib/00_World/04_World_Timeline.md',
      content: `${header('WLD-904', 'World Timeline', {}, { category: 'Index (history)', realm: 'World' })}\n\n# World Timeline\n\n## Established chronology\n\n| Time | Event | Continent / realm | Source | Access |\n| --- | --- | --- | --- | --- |\n| Long ago | The tower falls [LOC-002] | Aetheris | Test | CANON |\n| 300 AB | Play begins | Both | Test | CANON |\n`,
    },
  ];
}

export function zipOf(files: SourceFile[]): Buffer {
  const z = new AdmZip();
  for (const f of files) z.addFile(f.path, Buffer.from(f.content, 'utf8'));
  return z.toBuffer();
}
