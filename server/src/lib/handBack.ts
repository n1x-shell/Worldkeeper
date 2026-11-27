/**
 * A file the app made in the window (a plan's picture), handed back as a download. Every file the app offers to save
 * comes from the server with its name: that is the one way that works in a browser and in the desktop app alike,
 * where a link to something made in the page itself does not save anything.
 *
 * Kept in memory for a few minutes, a handful at a time: nothing is written to the library.
 */
import { randomBytes } from 'node:crypto';

interface Held {
  name: string;
  type: 'image/png' | 'image/svg+xml';
  data: Buffer;
  until: number;
}
const held = new Map<string, Held>();
const KEEP_MS = 10 * 60 * 1000;
const MOST = 6;

/** A name safe to save under: letters, numbers, spaces and a few marks, with the right ending. */
export function safeName(name: string, ext: string): string {
  const base = name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .normalize('NFKD')
    .replace(/[^\w .()-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim()
    .slice(0, 80);
  return `${base || 'plan'}${ext}`;
}

export function hold(name: string, type: Held['type'], data: Buffer, now = Date.now()): string {
  for (const [k, v] of held) if (v.until < now) held.delete(k);
  while (held.size >= MOST) held.delete(held.keys().next().value as string);
  const token = randomBytes(12).toString('hex');
  held.set(token, { name: safeName(name, type === 'image/png' ? '.png' : '.svg'), type, data, until: now + KEEP_MS });
  return token;
}

export function handBack(token: string, now = Date.now()): Held | null {
  const h = held.get(token);
  if (!h || h.until < now) return null;
  return h;
}
