/**
 * Overland travel by the 2024 rules: a pace covers 18 (slow), 24 (normal) or 30 (fast) miles a day. A map's scale
 * is how many miles its image is across (its width), set by the GM.
 */
export const PACES = {
  slow: { label: 'Slow', milesPerDay: 18, note: 'Advantage on Wisdom (Perception or Survival) checks' },
  normal: { label: 'Normal', milesPerDay: 24, note: '' },
  fast: { label: 'Fast', milesPerDay: 30, note: 'Disadvantage on Wisdom (Perception or Survival) checks' },
} as const;
export type Pace = keyof typeof PACES;

/** Miles between two points of a map's image, or null when the map has no scale. */
export function milesBetween(a: { x: number; y: number }, b: { x: number; y: number }, map: { width: number; scale_miles?: number | null }) {
  if (!map.scale_miles || !map.width) return null;
  return (Math.hypot(b.x - a.x, b.y - a.y) / map.width) * map.scale_miles;
}

/** Miles along a path of points ([x, y] pairs of the map's image), or null without a scale. */
export function pathMiles(points: [number, number][], map: { width: number; scale_miles?: number | null }) {
  if (!map.scale_miles || !map.width) return null;
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return (d / map.width) * map.scale_miles;
}

/** Days on the road at a pace (a part day counts as a day). */
export const travelDays = (miles: number, pace: Pace) => (miles <= 0 ? 0 : Math.ceil(miles / PACES[pace].milesPerDay));

/** "42 miles", "1.5 miles", "about 1,200 miles". */
export function formatMiles(miles: number) {
  if (miles < 10) return `${Math.round(miles * 10) / 10} miles`;
  if (miles < 1000) return `${Math.round(miles)} miles`;
  return `about ${(Math.round(miles / 10) * 10).toLocaleString('en-GB')} miles`;
}

/** A round number of miles for a scale bar about `targetMiles` long. */
export function niceMiles(targetMiles: number) {
  const steps = [1, 2, 5];
  let mag = 10 ** Math.floor(Math.log10(Math.max(targetMiles, 0.1)));
  for (;;) {
    for (const s of steps) if (s * mag >= targetMiles * 0.7) return s * mag;
    mag *= 10;
  }
}
