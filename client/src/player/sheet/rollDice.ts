/** The dice in what a sheet shows, as a roll (v0.9.8). Pure, so tests read it too. */

/** "1d20+5" for a bonus of 5, "1d20-1" for −1, "1d20" for none. */
export const d20 = (bonus: number) => `1d20${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`;

/** The dice in a damage entry as players write them: "1d8 + 3 Slashing" is "1d8+3"; "—" or "see notes" is nothing. */
export function damageDice(text: string): string | null {
  const m = /^\s*((?:\d*d\d+|\d+)(?:\s*[+\-−]\s*(?:\d*d\d+|\d+))*)/i.exec(text);
  const expr = m?.[1].replace(/\s/g, '').replace(/−/g, '-');
  return expr && /d\d/i.test(expr) ? expr : null;
}

/** The roll for an attack's bonus: "+5" is "1d20+5". A save DC ("DC 13") isn't a roll of the attacker's. */
export function attackDice(text: string): string | null {
  const m = /^\s*([+\-−]?\s*\d+)\s*$/.exec(text);
  return m ? d20(Number(m[1].replace(/\s/g, '').replace('−', '-'))) : null;
}
