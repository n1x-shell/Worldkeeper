/**
 * Bastions and downtime (Dungeon Master's Guide, 2024): the party's strongholds, each facility's order every Bastion
 * turn, and what characters do between adventures. The app tracks; the book has the rules. A Bastion hosted in a
 * faction's camp needs Trusted standing with it (Faction Standing [RUL-600]).
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { makeCrud, zId } from './crud.js';
import { rankOf } from '../../../shared/standing.js';

const facility = z.object({
  id: z.string().max(40),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['special', 'basic']).default('special'),
  space: z.string().max(20).default('Roomy'),
  hirelings: z.number().int().min(0).max(100).default(0),
  order: z.string().max(40).default(''),
  notes: z.string().max(5000).default(''),
});

export const bastions = makeCrud({
  table: 'bastions',
  schema: z.object({
    campaign_id: z.number().int(),
    name: z.string().trim().min(1).max(200),
    owner: z.string().max(300).default(''),
    location_id: zId,
    host_faction_id: zId,
    gold: z.number().int().min(-1_000_000).max(100_000_000).default(0),
    defenders: z.number().int().min(0).max(10_000).default(0),
    facilities: z.array(facility).max(40).default([]),
    notes: z.string().max(20000).default(''),
  }),
  jsonColumns: ['facilities'],
  orderBy: 'id',
});

export const downtime = makeCrud({
  table: 'downtime',
  schema: z.object({
    campaign_id: z.number().int(),
    character: z.string().trim().min(1).max(200),
    activity: z.string().trim().min(1).max(200),
    days: z.number().int().min(0).max(10_000).default(0),
    cost_gp: z.number().int().min(0).max(10_000_000).default(0),
    result: z.string().max(5000).default(''),
    session_id: z.number().int().nullable().optional(),
  }),
  orderBy: 'id DESC',
});

/** The Bastion's turns, newest first. */
export function bastionTurns(db: DB, bastionId: number) {
  return (
    db.prepare('SELECT id, number, orders, event, notes, session_id, created_at FROM bastion_turns WHERE bastion_id = ? ORDER BY number DESC').all(bastionId) as {
      id: number;
      number: number;
      orders: string;
      event: string;
      notes: string;
      session_id: number | null;
      created_at: string;
    }[]
  ).map((t) => ({ ...t, orders: JSON.parse(t.orders) as { facility: string; order: string }[] }));
}

/** Take a Bastion turn: record each facility's order, any event, and clear the orders for next time. */
export function takeBastionTurn(db: DB, bastionId: number, input: { event?: string; notes?: string }) {
  const b = bastions.get(db, bastionId) as { id: number; campaign_id: number; name: string; facilities: z.infer<typeof facility>[] };
  if (!b) throw notFound('Bastion');
  const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(b.campaign_id) as { id: number } | undefined;
  const number = ((db.prepare('SELECT MAX(number) n FROM bastion_turns WHERE bastion_id = ?').get(bastionId) as { n: number | null }).n ?? 0) + 1;
  const orders = b.facilities.filter((f) => f.order).map((f) => ({ facility: f.name, order: f.order }));
  db.transaction(() => {
    db.prepare('INSERT INTO bastion_turns (bastion_id, number, orders, event, notes, session_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      bastionId,
      number,
      JSON.stringify(orders),
      String(input.event ?? '').slice(0, 5000),
      String(input.notes ?? '').slice(0, 5000),
      live?.id ?? null,
    );
    bastions.update(db, bastionId, { facilities: b.facilities.map((f) => ({ ...f, order: '' })) });
    if (live)
      db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'note', ?)`).run(
        live.id,
        `Bastion turn ${number} at ${b.name}${orders.length ? `: ${orders.map((o) => `${o.facility} (${o.order})`).join(', ')}` : ''}.${input.event ? ` ${input.event}` : ''}`,
      );
  })();
  return bastionTurns(db, bastionId)[0];
}

/** Whether a Bastion's host faction still welcomes it: Trusted (Renown 10) or better. */
export function hostStanding(db: DB, campaignId: number, factionId: string | null) {
  if (!factionId) return null;
  const f = db.prepare('SELECT name FROM entities WHERE id = ?').get(factionId) as { name: string } | undefined;
  if (!f) return null;
  const renown = (db.prepare('SELECT renown FROM faction_standing WHERE campaign_id = ? AND faction_id = ?').get(campaignId, factionId) as { renown: number } | undefined)?.renown ?? 0;
  return { name: f.name, rank: rankOf(renown), renown, welcome: renown >= 10 };
}
